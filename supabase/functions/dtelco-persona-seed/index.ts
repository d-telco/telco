/* dtelco-persona-seed: put the operator's three contact card columns on the eight personas.
 *
 * Three custom columns, not the whole line. plan_name, lifecycle and contract_end are the values
 * the contact card shows a room and a message can print with $Contact, so they live on the
 * contact and need a writer. Everything else the operator knows, the plan type, the ARPU band,
 * the device, the household, the store, the city, stays in the subscriber tables where the star
 * schema serves it to segments live through the remote views. A contact is not the place to
 * flatten a relational model.
 *
 * They still need this writer. A message printing $Contact.lifecycle against an unwritten column
 * prints nothing: accepted, stored nowhere, no error. That is the same shape of failure a custom
 * table has when it does not exist yet.
 *
 * Run it once after the personas are seeded, and again after the operator simulator has changed
 * a plan or a lifecycle. It is idempotent: /bulk/contacts upserts, so a second run updates.
 *
 * Two things it deliberately does not do.
 *
 * It writes no email address. A rehearsal never invents one, and every one of these eight is
 * invented. A contact with no email cannot be sent an email by accident.
 *
 * It writes gsm_permission and whatsapp_permission false. The numbers are invented 555 block
 * mobiles and SMS and WhatsApp are composed and never sent in this demonstration, so the
 * permission columns are the cheapest possible guarantee that no message can ever reach a number
 * that might belong to somebody real. whatsapp_permission is the account's own column, confirmed
 * in the panel column list on 5 September 2026.
 *
 * The number is not sent at all. Measured 5 September 2026, twice: the validator refuses the
 * invented 555 block with "gsm value is invalid. Default value is used!", and a row carrying the
 * refused value updates an existing contact but does not create a new one. Two runs, eight rows
 * each, both answered 2 updated, 0 inserted, no error, and master_contact sat at 4 half an hour
 * on. Omitting the number is the site's own rule applied here: a value the platform will not
 * store is omitted, never fabricated into a shape that would. The card shows no mobile, which is
 * the price of a number that can never belong to anybody, and the permission columns still
 * travel, false, so the channels stay shut whatever the card holds.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

/* The three, in a fixed order. Published on the health line so a person creating the columns in
   the panel can work from the same list the code writes. */
const COLUMNS = ['plan_name', 'lifecycle', 'contract_end'] as const;

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

async function rows() {
  const { data: subs } = await db.from('dtelco_subscriber').select('*')
    .eq('is_persona', true).order('contact_key');
  if (!subs?.length) return [];

  /* One read for every plan the eight of them are on, rather than one per persona. */
  const ids = [...new Set(subs.map((s) => s.plan_id).filter(Boolean) as string[])];
  const { data: products } = await db.from('dtelco_product')
    .select('product_id, title').in('product_id', ids.length ? ids : ['__none__']);
  const title = new Map((products ?? []).map((p) => [p.product_id as string, p.title as string]));

  return subs.map((s) => {
    const name = String(s.full_name ?? '').trim().split(/\s+/);
    return {
      contact_key: s.contact_key,
      name: name[0] ?? '',
      surname: name.slice(1).join(' '),
      /* No gsm here, deliberately: the validator refuses the invented 555 block, and a refused
         value on a new key blocks the whole contact's creation. See the note at the top of this
         file. The permissions are never true: nothing in this demonstration sends an SMS or a
         WhatsApp, and the numbers, wherever they appear on the site, are invented. */
      gsm_permission: false,
      whatsapp_permission: false,
      plan_name: title.get(s.plan_id) ?? s.plan_id,
      lifecycle: s.lifecycle,
      contract_end: s.contract_end,
    } as Record<string, unknown>;
  });
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    const list = await rows();
    return new Response(JSON.stringify({
      function: 'dtelco-persona-seed',
      does: 'POST upserts the eight personas into master_contact through /bulk/contacts',
      why: 'the contact card columns need a writer. A message printing $Contact.lifecycle ' +
           'against an unwritten column prints nothing, with no error anywhere. The rest of ' +
           'the line stays in the subscriber tables the star schema serves to segments live.',
      columns: COLUMNS,
      writes_email: false,
      why_no_email: 'a rehearsal never invents an email address, and all eight are invented',
      gsm_permission: false,
      whatsapp_permission: false,
      why_no_send_permissions: 'the numbers are invented and SMS and WhatsApp are composed and ' +
                               'never sent, so the permission columns are the cheapest guarantee ' +
                               'nothing reaches a number that might belong to somebody real',
      writes_gsm: false,
      why_no_gsm: 'measured 5 September 2026, twice: the validator refuses the invented 555 ' +
                  'block, and a row carrying the refused value updates an existing contact but ' +
                  'does not create a new one. A value the platform will not store is omitted, ' +
                  'never fabricated into a shape that would.',
      personas: list.length,
      dengage_configured: !!(USERKEY && PASSWORD),
      note: 'idempotent. /bulk/contacts upserts, so a second run updates rather than duplicates.',
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  /* Four a minute. reference/rest-api-limits puts bulk contact upserts at roughly one a minute,
     and this endpoint exists to be run occasionally rather than on a page. */
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit',
      why: 'a bulk contact upsert is roughly one a minute; this is not a page endpoint' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  const contactDatas = await rows();
  if (!contactDatas.length) {
    return new Response(JSON.stringify({ ok: false, why: 'no persona rows in dtelco_subscriber' }),
      { headers });
  }

  const bearer = await login();
  if (!bearer) {
    return new Response(JSON.stringify({
      ok: false, personas: contactDatas.length,
      why: 'no Dengage API user is configured for this function yet, so nothing was written',
      would_write: Object.keys(contactDatas[0]),
    }, null, 1), { headers });
  }

  /* Every row carries the same keys, so one columns list serves all eight. A row missing a key
     another row has would silently write the wrong column, which is why they are built together
     rather than each from its own object. */
  const columns = Object.keys(contactDatas[0]);
  const r = await fetch(`${API}/bulk/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ columns, contactDatas }),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (!r.ok) {
    return new Response(JSON.stringify({
      ok: false, http: r.status,
      detail: text || (r.status === 403 ? 'empty body: the API user lacks the permission' : ''),
    }, null, 1), { headers });
  }
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* a 200 with an unreadable body is still a refusal */ }
  const results = (parsed as {
    data?: { errors?: string[]; inserted?: string[]; updated?: string[]; warnings?: string[] };
  })?.data;
  if (!results) {
    return new Response(JSON.stringify({ ok: false, why: 'rejected', raw: text.slice(0, 400) }),
      { headers });
  }
  return new Response(JSON.stringify({
    ok: (results.errors ?? []).length === 0,
    personas: contactDatas.length,
    inserted: (results.inserted ?? []).length,
    updated: (results.updated ?? []).length,
    errors: results.errors ?? [],
    warnings: results.warnings ?? [],
    columns,
    /* Said every time, because HTTP 200 is acceptance rather than storage. */
    note: 'accepted is not stored. Storage lags about two minutes; prove it with a count, ' +
          'never with a green reply.',
  }, null, 1), { headers });
});
