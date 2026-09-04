/* dtelco-broadcast: the outage notice, and the one push this demonstration composes on the spot.
 *
 * Every other push here goes through /transactional/push, which takes a content id and nothing
 * else: every word comes from a saved content. That is right for a confirmation, and wrong for the
 * message a network operations centre actually needs to send at two in the morning.
 *
 * reference/sendinstantpush is the other shape. It takes applicationIds and an inline content with
 * a title, a message, a target URL and an image, and it goes to an application's tokens now, or to
 * a segment or a table if one is named. "SendInstantPush is used to send quick mobile/web push
 * messages without complex customization or frequency capping."
 *
 * That is an outage notice. There is a fault in Ganja, here are the words, send it to everyone who
 * can receive it. No content saved in advance, because nobody plans the wording of an outage. It is
 * the one telco moment this demonstration had no answer for, and it is a different capability from
 * transactional push rather than a second way of doing the same thing.
 *
 * Two guards, because this is the only endpoint here that reaches more than one person.
 *
 * It refuses without confirm: true. A broadcast is not something to do by mis-click.
 *
 * It says who it will reach before it reaches them. With no segment it goes to every reachable
 * token in the application, which during a demonstration is the presenter's own device and nothing
 * else, because no persona has ever subscribed one. Saying that plainly is better than a reply
 * that reads like a thousand people were messaged.
 */
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 60 * 1000, CAP = 4;
const hits = new Map<string, number[]>();
function overCap(who: string) {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now); hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > CAP;
}
function cors(origin: string | null) {
  const h: Record<string, string> = { 'content-type': 'application/json',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey' };
  if (origin && ORIGINS.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}

const DC = Deno.env.get('DENGAGE_DATACENTER') ?? 'tr';
/* The account's REST base.
 *
 * Supabase Edge Functions egress from a shared pool: measured 4 September 2026, five consecutive
 * calls left from five different addresses. An allowlist pinned to one address therefore refuses
 * calls that carry perfectly good credentials, and the refusal is a 403 with an empty body, which
 * looks exactly like a missing permission.
 *
 * DTELCO_API_PROXY is the way round it. Set it to a host that holds the allowlisted address and
 * forwards to the account, and every call below leaves from there instead. Unset, calls go direct,
 * which is right for an account with no allowlist. */
const PROXY = (Deno.env.get('DTELCO_API_PROXY') ?? '').replace(/\/+$/, '');
const API = PROXY ? `${PROXY}/rest` : `https://${DC}-api.dengage.com/rest`;
/* The API user, under whichever name the account stored it. An operator naming its own secrets is
   normal, and a credential that is present under a different name should read as configured rather
   than as missing: the two look identical from a health line and take an afternoon to tell apart. */
function secret(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim()) return v.trim();
  }
  return '';
}
const USERKEY = secret(['DENGAGE_USERKEY', 'TELCO_API_USER', 'telco_api_user']);
const PASSWORD = secret(['DENGAGE_PASSWORD', 'TELCO_API_PASSWORD', 'telco_api_password']);
const APP_GUID = Deno.env.get('DENGAGE_APP_GUID') ?? '';
/* Optional. With it the broadcast goes to one segment; without it, to every reachable token in the
   application. Both are honest and the reply says which happened. */
const SEGMENT_ID = Deno.env.get('DTELCO_OUTAGE_SEGMENT_ID') ?? '';

/* The cities the storefront already knows about, so an outage names a real place rather than
   whatever a caller typed. A free text city would put an unchecked string in a push title. */
const CITIES = ['Baku', 'Ganja', 'Sumqayit', 'Mingachevir', 'Lankaran', 'Shirvan'];

let token: { value: string; until: number } | null = null;

async function login(): Promise<string | null> {
  if (!USERKEY || !PASSWORD) return null;
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch(`${API}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userkey: USERKEY, password: PASSWORD }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  const body = await r.json();
  if (!body?.access_token) return null;
  token = { value: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      function: 'dtelco-broadcast',
      does: 'POST { city, confirm: true } sends an outage notice through /push/sendInstant',
      why: 'transactional push takes a content id and nothing else, so every word comes from a ' +
           'saved content. Nobody writes the wording of an outage in advance. sendInstant takes ' +
           'the words inline, which is what a network operations centre actually needs.',
      cities: CITIES,
      reaches: SEGMENT_ID
        ? 'the configured segment'
        : 'every reachable token in the application, which during a demonstration is the ' +
          'presenter\'s own device: no persona has ever subscribed one',
      segment_configured: !!SEGMENT_ID,
      application_configured: !!APP_GUID,
      dengage_configured: !!(USERKEY && PASSWORD),
      guard: 'refuses without confirm: true. A broadcast is not something to do by mis-click.',
      note: 'this is the only endpoint here that reaches more than one person.',
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit',
      why: 'four broadcasts a minute is already more than any demonstration needs' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'body must be json' }), { status: 400, headers });
  }

  const city = String(body.city ?? '').trim();
  if (!CITIES.includes(city)) {
    return new Response(JSON.stringify({ error: 'unknown city', cities: CITIES,
      why: 'the title of a push is not the place for an unchecked string' }),
      { status: 400, headers });
  }

  const title = `Service update for ${city}`;
  const message = `We have a fault affecting some ${city} customers and engineers are on it. ` +
                  'Your data allowance is not being charged while it lasts.';
  const targetUrl = 'https://d-telco.github.io/telco/support.html';

  if (body.confirm !== true) {
    return new Response(JSON.stringify({
      ok: false, sent: false, city, title, message, target_url: targetUrl,
      why: 'nothing was sent. Post again with confirm: true.',
      would_reach: SEGMENT_ID ? 'the configured segment'
        : 'every reachable token in the application, which here is the presenter\'s own device',
    }, null, 1), { headers });
  }

  const bearer = await login();
  if (!bearer || !APP_GUID) {
    return new Response(JSON.stringify({
      ok: false, sent: false, city, title, message,
      why: !bearer ? 'no API user is configured, so nothing was sent'
                   : 'no push application guid is configured, and sendInstant requires one',
    }, null, 1), { headers });
  }

  const payload: Record<string, unknown> = {
    applicationIds: [APP_GUID],
    content: {
      title,
      message,
      targetUrl,
      /* An outage notice with an image is an outage notice people scroll past. Deliberately none. */
    },
    /* Off, so a device that subscribed this morning and has not been engaged with still hears
       about the outage. An engagement filter is right for marketing and wrong for a service
       message, which is the distinction worth drawing out loud. */
    useOnlyEngagedTokens: false,
  };
  if (SEGMENT_ID) payload.segmentId = SEGMENT_ID;

  const r = await fetch(`${API}/push/sendInstant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (r.status === 403) {
    return new Response(JSON.stringify({ ok: false, sent: false, http: 403,
      why: 'the API user has no push permission: 403 with an empty body' }, null, 1), { headers });
  }
  let parsed: { code?: number; message?: string; transactionId?: string } = {};
  try { parsed = JSON.parse(text); } catch { /* a 200 that will not parse is still not a send */ }
  const code = typeof parsed.code === 'number' ? parsed.code : null;

  return new Response(JSON.stringify({
    ok: code === 0,
    sent: code === 0,
    city, title, message,
    http: r.status, code, message_from_dengage: parsed.message ?? null,
    transaction_id: parsed.transactionId ?? null,
    reached: SEGMENT_ID ? 'the configured segment' : 'every reachable token in the application',
    raw: code === null ? text.slice(0, 400) : undefined,
    /* Said every time. This is a broadcast, so the gap between accepted and delivered is wider
       here than anywhere else in the build. */
    note: 'code 0 means Dengage accepted the broadcast. It says nothing about how many devices ' +
          'drew a notification, and a device with no token was never in scope to begin with.',
  }, null, 1), { headers });
});
