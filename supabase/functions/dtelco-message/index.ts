/* dtelco-message: the transactional send, and the demo's own message centre.
 *
 * Two jobs, and the pairing is deliberate. Dengage sends the transactional push or email. The
 * demo's own centre holds what a campaign would have written to the App Inbox, because the App
 * Inbox fills from campaigns and journeys and never from a transactional send, so a confirmation
 * that has to appear in the same second the visitor acted cannot come from there.
 *
 * That last point is worth stating exactly. reference/inbox-rest-api has two endpoints,
 * getMessages and events: it reads a mailbox and it reports what happened to a message already in
 * it. Inbox messages arrive from a campaign or a journey, which is why the demo's own centre
 * carries the same second confirmation.
 *
 * What this file exists to get right is the reading of the answer.
 *
 * Every transactional endpoint answers HTTP 200 for a refusal as well as a send. The outcome is in
 * the body: code 0 is sent, code 11 is "Token not found with given ContactKey", the normal state
 * for a device that has not claimed the contact. So this reads the code rather than the status,
 * names it, and on code 11 falls back to a send by token when the caller passed one.
 *
 * The push API takes no inline title or body. Every word comes from the saved content, so a send
 * carries values and a content id and nothing else. That is why panel/values/<moment>.json exists.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 60 * 1000, CAP = 20;
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
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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
/* Where a rehearsal email goes when the caller names no recipient. From the environment, because
   an address in source is an address somebody copies into another build. Nothing here invents one,
   and with the variable unset the email path refuses rather than guessing. */
const REHEARSAL_TO = Deno.env.get('DTELCO_REHEARSAL_EMAIL') ?? '';
/* GetEmailFroms gives the from name and address pairs. A transactional email built from inline
   html needs one; an email built from a saved template does not, because the template carries it. */
const FROM_NAME_ID = Deno.env.get('DENGAGE_FROM_NAME_ID') ?? '';
const EMAIL_SHAPE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/* The codes worth naming. Everything else is reported with its number and its message, because a
   code nobody has seen before should read as itself rather than as "failed". */
const CODES: Record<number, string> = {
  0: 'sent: Dengage accepted it for delivery',
  11: 'refused: token not found with given contact key, which is the normal state for a device ' +
      'that has not claimed this contact',
};

/* SMS and WhatsApp are composed and never sent, because each send costs money per message. This
   endpoint refuses them by name rather than by omission, so a presenter who asks for one gets an
   answer instead of a silence. */
const SUPPRESSED = ['sms', 'whatsapp'];

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

type SendResult = { code: number | null; meaning: string; transactionId?: string; raw?: string };

/* The email sibling of push, and the differences are worth stating rather than smoothing over.
 *
 * Push is addressed by contactKey and every word comes from the saved content. Email is addressed
 * by an email ADDRESS: reference/sendtransactionalemail requires the `send` object and its `to`,
 * so a transactional email cannot be sent to a contact key at all. That is the whole reason this
 * function refuses rather than inventing a recipient, and the reason a persona with no email
 * address can be pushed to and cannot be emailed.
 *
 * content takes either a templateId or html plus subject plus fromNameId. This uses templateId,
 * because the demonstration's nineteen bodies are pasted into the panel as saved contents and a
 * second copy of the same html living in a function would be a second place for it to go stale.
 */
async function email(bearer: string, payload: Record<string, unknown>): Promise<SendResult> {
  const r = await fetch(`${API}/transactional/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (r.status === 403) {
    return { code: null, meaning: 'the API user has no transactional permission: 403 with an ' +
             'empty body', raw: text };
  }
  let body: { code?: number; message?: string; data?: { to?: { transactionId?: string } } } = {};
  try { body = JSON.parse(text); } catch { /* a 200 that will not parse is still not a send */ }
  const code = typeof body.code === 'number' ? body.code : null;
  return {
    code,
    meaning: code === null
      ? `HTTP ${r.status} with no code in the body, so nothing can be claimed about delivery`
      : (CODES[code] ?? `code ${code}: ${body.message ?? 'unnamed'}`),
    /* The transaction id sits under data.to for a single recipient, not at the top level as it
       does on push. Reporting later needs it, so it is read from where the documentation puts it. */
    transactionId: body.data?.to?.transactionId,
    raw: text.slice(0, 400),
  };
}

async function push(bearer: string, payload: Record<string, unknown>): Promise<SendResult> {
  const r = await fetch(`${API}/transactional/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (r.status === 403) {
    return { code: null, meaning: 'the API user has no transactional permission: 403 with an empty body', raw: text };
  }
  let body: { code?: number; message?: string; transactionId?: string } = {};
  try { body = JSON.parse(text); } catch { /* a 200 that will not parse is still not a send */ }
  const code = typeof body.code === 'number' ? body.code : null;
  return {
    code,
    meaning: code === null
      ? `HTTP ${r.status} with no code in the body, so nothing can be claimed about delivery`
      : (CODES[code] ?? `code ${code}: ${body.message ?? 'unnamed'}`),
    transactionId: body.transactionId,
    raw: text.slice(0, 400),
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const url = new URL(req.url);

  /* The demo's own message centre, read by the drawer beside Dengage's inbox. Never reported to
     Dengage: impressions, opens and deletes belong to messages Dengage issued. */
  if (req.method === 'GET' && url.searchParams.has('inbox')) {
    const key = (url.searchParams.get('inbox') ?? '').trim();
    if (!KEY_SHAPE.test(key)) {
      return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
        { status: 400, headers });
    }
    /* detail holds what Dengage replied per channel and is never returned to the browser: a
       visitor's message centre is not the place to publish an API's answer. */
    const { data } = await db.from('dtelco_inbox')
      .select('id, title, body, media_url, target_url, channels, sent_at')
      .eq('contact_key', key).order('sent_at', { ascending: false }).limit(25);
    return new Response(JSON.stringify((data ?? []).map((r) => ({
      id: r.id, title: r.title, message: r.body, mediaUrl: r.media_url,
      targetUrl: r.target_url, channels: r.channels, sentDate: r.sent_at,
    }))), { headers });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      function: 'dtelco-message',
      reads: 'GET ?inbox=<contact key> returns the demo\'s own message centre',
      sends: 'POST { contact_key, content_id, channel, values, to?, token? }',
      channels_available: ['push', 'email'],
      email_needs: 'an email address. A transactional email is addressed by address rather than ' +
                   'by contact key, so this endpoint refuses rather than deriving one.',
      rehearsal_address_configured: !!REHEARSAL_TO,
      channels_suppressed: SUPPRESSED,
      why_suppressed: 'composed, rendered and shown, never sent. Each send costs money per message ' +
                      'and this build composes rather than sends them.',
      dengage_configured: !!(USERKEY && PASSWORD && APP_GUID),
      reads_the_code_not_the_status: true,
      why: 'every transactional endpoint answers HTTP 200 for a refusal as well as a send. Code 0 ' +
           'is sent. Code 11 is a device that has not claimed the contact, and is the one refusal ' +
           'worth retrying by token.',
      codes: CODES,
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '30' } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'body must be json' }), { status: 400, headers });
  }

  const key = String(body.contact_key ?? '').trim();
  const channel = String(body.channel ?? 'push');
  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  if (SUPPRESSED.includes(channel)) {
    return new Response(JSON.stringify({
      ok: false, channel, sent: false,
      why: `${channel} is composed and never sent. The copy sits in the moment's lane folder, ` +
           `panel/transactional/${channel}/ or panel/campaign/${channel}/; the audience is a ` +
           'segment and the trigger is a journey. All three cost nothing to show.',
    }, null, 1), { headers });
  }
  if (channel !== 'push' && channel !== 'email') {
    return new Response(JSON.stringify({ error: 'unknown channel', channels: ['push', 'email'] }),
      { status: 400, headers });
  }

  const contentId = String(body.content_id ?? '').trim();
  if (!contentId) {
    return new Response(JSON.stringify({ error: 'content_id is required: neither transactional ' +
      'endpoint takes an inline title or body, so every word comes from the saved content' }),
      { status: 400, headers });
  }

  /* The recipient, and the one place this function will not help. A transactional email is
     addressed by email address, not by contact key, so there is no route from DPS-DTELCO-1 to an
     inbox unless somebody names one. Nothing here derives an address from a persona, a contact
     record or a pattern: the caller gives one, or the environment holds the rehearsal address, or
     this refuses and says which. */
  let to = '';
  if (channel === 'email') {
    to = String(body.to ?? REHEARSAL_TO ?? '').trim();
    if (!EMAIL_SHAPE.test(to)) {
      return new Response(JSON.stringify({
        ok: false, channel, sent: false,
        why: to
          ? `${to} is not a usable email address, so nothing was sent`
          : 'no recipient. A transactional email is addressed by email address rather than by ' +
            'contact key, and this function will not invent one. Pass `to`, or set ' +
            'DTELCO_REHEARSAL_EMAIL on the function.',
        rehearsal_address_configured: !!REHEARSAL_TO,
      }, null, 1), { status: 400, headers });
    }
  }

  /* Written to the demo's own centre first, whatever Dengage answers, so the drawer shows the
     confirmation in the same second and the row survives a refusal. */
  const values = (body.values ?? {}) as Record<string, unknown>;
  const own = {
    contact_key: key,
    device_token: body.token ? String(body.token) : null,
    moment: String(body.moment ?? 'adhoc'),
    title: String(body.title ?? values.title ?? 'D-TELCO'),
    body: String(body.message ?? values.message ?? ''),
    media_url: body.media_url ? String(body.media_url) : null,
    target_url: body.target_url ? String(body.target_url) : null,
    channels: channel,
  };
  const { data: stored } = await db.from('dtelco_inbox').insert(own).select('id').single();

  /* The app guid identifies the push application and is required on a push. An email has no
     application: reference/sendtransactionalemail takes send, content and current, and no appId
     anywhere. Requiring one for both would have made email unsendable on an account that has
     credentials and no mobile application, which is most accounts on day one. */
  const bearer = await login();
  const missing = !bearer ? 'no API user is configured'
    : (channel === 'push' && !APP_GUID) ? 'no push application guid is configured' : null;
  if (missing) {
    return new Response(JSON.stringify({
      ok: true, inbox_row_id: stored?.id ?? null, channel, sent: false,
      dengage_status: 'pending api user',
      why: `the message is in the demo's own centre and the drawer will show it. Dengage was not ` +
           `called because ${missing}.`,
    }, null, 1), { headers });
  }

  const customParameters = Object.entries(values)
    .map(([k, v]) => ({ key: k, value: String(v) }));
  const base = {
    contentId,
    appId: APP_GUID,
    language: 'EN',
    /* Both, because a content built either way then resolves. */
    current: values,
    customParameters,
    inboxParams: { enabled: true, expire: { type: 'PERIOD', period: 7, periodType: 'DAY' } },
    tags: ['demo', 'dtelco', own.moment],
  };

  if (channel === 'email') {
    /* content takes a templateId OR html plus subject plus fromNameId. The saved content is the
       route here, so fromNameId is not required; it is passed only when the environment holds one,
       because reference/sendtransactionalemail pairs it with the html route and sending an empty
       string would be sending a field rather than omitting it. */
    const content: Record<string, unknown> = { templateId: contentId };
    if (FROM_NAME_ID) content.fromNameId = FROM_NAME_ID;
    const emailResult = await email(bearer!, {
      send: { to, toLanguage: 'EN' },
      content,
      /* The same values object push passes as `current`. A body written for one channel then
         resolves on the other, which is the point of writing the values file once. */
      current: values,
      reporting: { trackOpen: true, trackClick: true },
      tags: ['demo', 'dtelco', own.moment].slice(0, 5),
    });
    if (stored?.id) {
      await db.from('dtelco_inbox')
        .update({ detail: `code ${emailResult.code}: ${emailResult.meaning}`.slice(0, 400) })
        .eq('id', stored.id);
    }
    return new Response(JSON.stringify({
      ok: true,
      inbox_row_id: stored?.id ?? null,
      channel: 'email',
      route: 'address',
      to,
      code: emailResult.code,
      meaning: emailResult.meaning,
      transaction_id: emailResult.transactionId ?? null,
      sent: emailResult.code === 0,
      note: 'Code 0 means Dengage accepted it for delivery. It does not mean an inbox received ' +
            'it. Keep the transaction id: it is what a delivery report is looked up by.',
    }, null, 1), { headers });
  }

  let result = await push(bearer!, { ...base, contactKey: key, sendToAll: true });
  let route = 'contact';

  /* Code 11 is a device that never claimed this contact. A token the caller holds is the one
     honest fallback, and only when this browser IS that contact: a simulator firing a signal for
     somebody else must never push to the presenter's machine. */
  const deviceToken = body.token ? String(body.token) : null;
  if (result.code === 11 && deviceToken) {
    result = await push(bearer!, { ...base, token: deviceToken });
    route = 'token';
  }

  if (stored?.id) {
    await db.from('dtelco_inbox')
      .update({ detail: `code ${result.code}: ${result.meaning}`.slice(0, 400) })
      .eq('id', stored.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    inbox_row_id: stored?.id ?? null,
    route,
    code: result.code,
    meaning: result.meaning,
    transaction_id: result.transactionId ?? null,
    sent: result.code === 0,
    /* Said every time, because it is the sentence a demonstration must never skip. */
    note: 'Code 0 means Dengage accepted it for delivery. It does not mean a browser drew a ' +
          'notification, and a token send is accepted blind.',
  }, null, 1), { headers });
});
