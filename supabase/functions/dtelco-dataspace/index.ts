/* dtelco-dataspace: the three Data Space calls, and the one gap they close.
 *
 * The recommendation reaches a message two ways, and the second one exists for exactly one reason.
 *
 * Route one is the contact. The relay writes reco_product_id_1..3 to master_contact and a marketing
 * message resolves each against the catalogue with $from. Documented, built, and checked. It cannot
 * reach a push: reference/advanced-personalization says $Contact "can be null in Push sends".
 *
 * Route two is a send list. The same page says $Current "contains extra columns coming from a
 * selected audience. This can be from a Send List Table or a SQL Segment", and its own worked
 * Example 1 is titled "Product Recommendations from a Send List", with contact_key and a
 * recommended product id, which is this table exactly. $Current carries no push caveat, so a
 * campaign whose audience is this table prints the same three products on every channel.
 *
 * So: createtable builds the table with the columns the code writes, sync/upsert fills it, and
 * triggerAutomatedFlow starts the journey that sends from it without waiting for a segment refresh.
 * Three endpoints, one story, and none of them duplicates route one.
 *
 * Everything here reads the body rather than the status. /dataspace/sync/upsert answers 200 for a
 * partial failure and puts the truth in data.errorCount and data.errorList; triggerAutomatedFlow
 * puts it in data.HasError. A green HTTP status means the request arrived.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 60 * 1000, CAP = 10;
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

/* The send list table, and its columns are the columns dtelco_reco holds. Naming them in one place
   is what stops the table being created one column short of what the sync writes, which is a
   failure that shows up as errorCount rather than as anything readable. */
const TABLE = 'dtelco_reco_list';
const COLUMNS = [
  { name: 'contact_key', type: 'TEXT', isPrimary: true, isNullable: false },
  { name: 'reco_product_id_1', type: 'TEXT' },
  { name: 'reco_product_id_2', type: 'TEXT' },
  { name: 'reco_product_id_3', type: 'TEXT' },
  { name: 'reco_rule', type: 'TEXT' },
  /* DATE rather than TEXT, so a campaign can filter on recency: "recommended in the last seven
     days" is a real audience and a text column cannot answer it. The value is formatted
     yyyy-MM-dd HH:mm:ss, which is on the documented DateTime Formats list at the head of the REST
     reference. If this account disagrees, errorCount says so on the first sync rather than
     silently dropping the column. */
  { name: 'reco_at', type: 'DATE' },
];

/* 1000 is the documented ceiling for the synchronous upsert. Above it the asynchronous version is
   the endpoint, and this demonstration has never been near it: eight personas and whoever walks in.
   Refusing loudly at the boundary is better than sending 1001 rows and reading a partial success. */
const SYNC_MAX = 1000;

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

async function call(bearer: string, path: string, payload: unknown, method = 'POST') {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(text); } catch { /* a 200 that will not parse is still not a success */ }
  return { http: r.status, parsed, text };
}

/* Whether the table is already there, so create_table is safe to press twice. Nothing in this
   repository deletes or alters a Dengage object, so the only honest behaviour on a second press is
   to report that it exists and change nothing. */
async function findTable(bearer: string): Promise<string | null> {
  for (let offset = 0; offset < 20000; offset += 1000) {
    const r = await fetch(`${API}/dataspace/tables?limit=1000&offset=${offset}`, {
      headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const body = await r.json();
    const rows: Array<{ tableName?: string; publicId?: string }> = body?.data?.result ?? [];
    for (const row of rows) if (row.tableName === TABLE) return row.publicId ?? null;
    if (rows.length < 1000) break;
  }
  return null;
}

/* yyyy-MM-dd HH:mm:ss, from the DateTime Formats list. Built by hand rather than by toISOString,
   because that emits a T and a Z and the list's T forms are a different entry: sending a format
   the endpoint does not expect is the kind of thing that comes back as errorCount 8. */
function stamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    const { count } = await db.from('dtelco_reco')
      .select('contact_key', { count: 'exact', head: true }).not('reco_product_id_1', 'is', null);
    return new Response(JSON.stringify({
      function: 'dtelco-dataspace',
      ops: {
        create_table: 'POST /dataspace/tables, the send list the recommendation campaign selects',
        sync_reco: 'POST /dataspace/sync/upsert, the rows into it',
        trigger_flow: 'POST /dataspace/triggerAutomatedFlow, the journey that sends from it',
      },
      table: TABLE,
      columns: COLUMNS.map((c) => `${c.name} ${c.type}`),
      contact_key_column: 'contact_key',
      why: 'the contact route reaches every marketing channel except push, because ' +
           '$Contact can be null in Push sends. A send list reaches all of them, because ' +
           '$Current carries no such caveat. This is that send list.',
      rows_ready: count ?? 0,
      sync_max: SYNC_MAX,
      above_that: 'the asynchronous upsert is the endpoint. Nothing here has been near 1000 rows.',
      dengage_configured: !!(USERKEY && PASSWORD),
      reads_the_body: 'sync/upsert answers 200 for a partial failure and puts the truth in ' +
                      'data.errorCount and data.errorList. triggerAutomatedFlow puts it in ' +
                      'data.HasError. Neither is readable from the HTTP status.',
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'body must be json' }), { status: 400, headers });
  }
  const op = String(body.op ?? '');
  if (!['create_table', 'sync_reco', 'trigger_flow'].includes(op)) {
    return new Response(JSON.stringify({ error: 'unknown op',
      ops: ['create_table', 'sync_reco', 'trigger_flow'] }), { status: 400, headers });
  }

  const bearer = await login();
  if (!bearer) {
    return new Response(JSON.stringify({
      ok: false, op,
      why: 'no Dengage API user is configured for this function, so nothing was called',
      would_do: op === 'create_table' ? { table: TABLE, columns: COLUMNS }
              : op === 'sync_reco' ? { table: TABLE, from: 'dtelco_reco' }
              : { endpoint: '/dataspace/triggerAutomatedFlow' },
    }, null, 1), { headers });
  }

  if (op === 'create_table') {
    const existing = await findTable(bearer);
    if (existing) {
      return new Response(JSON.stringify({
        ok: true, op, created: false, table: TABLE, table_id: existing,
        why: 'the table is already there, so nothing was created. Nothing in this build alters or ' +
             'drops a Dengage object.',
      }, null, 1), { headers });
    }
    const r = await call(bearer, '/dataspace/tables', {
      name: TABLE,
      description: 'D-TELCO recommendation send list. One row per contact, the three product ids ' +
                   'the site chose. Select it as a campaign audience and the ids arrive as ' +
                   '$Current on every channel including push.',
      /* Connecting it to master_contact is what makes it a send list rather than a standalone
         table. reference/createtable is explicit about the consequence and it is the intended one
         here: "all values in contact key column will be created in master_contact table if they
         don't exist". Every key this sends is a DPS-DTELCO- key this demonstration owns. */
      contactKeyColumn: 'contact_key',
      columns: COLUMNS,
    });
    const code = (r.parsed?.code as number | undefined) ?? null;
    return new Response(JSON.stringify({
      ok: r.http === 200 && code === 0,
      op, created: r.http === 200 && code === 0, table: TABLE,
      http: r.http, code, message: r.parsed?.message ?? null,
      data: r.parsed?.data ?? null,
      raw: code === null ? r.text.slice(0, 400) : undefined,
      note: 'create it once. The columns above are the columns the sync writes, and a table one ' +
            'column short shows up as errorCount rather than as anything readable.',
    }, null, 1), { headers });
  }

  if (op === 'sync_reco') {
    const { data: rows } = await db.from('dtelco_reco')
      .select('contact_key, reco_product_id_1, reco_product_id_2, reco_product_id_3, reco_rule, reco_at')
      .not('reco_product_id_1', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(SYNC_MAX + 1);
    const list = rows ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({
        ok: true, op, sent: 0,
        why: 'no contact has a stored recommendation yet. Open a product twice on the site and ' +
             'the rail writes one.',
      }, null, 1), { headers });
    }
    if (list.length > SYNC_MAX) {
      return new Response(JSON.stringify({
        ok: false, op, rows: list.length,
        why: `the synchronous upsert takes at most ${SYNC_MAX} rows in one call. Above that the ` +
             'asynchronous endpoint is the route, and nothing here should ever be above it.',
      }, null, 1), { status: 400, headers });
    }

    const columns = COLUMNS.map((c) => c.name);
    const payloadRows = list.map((r) => [
      r.contact_key, r.reco_product_id_1, r.reco_product_id_2, r.reco_product_id_3,
      r.reco_rule, stamp(r.reco_at as string | null),
    ]);
    const r = await call(bearer, '/dataspace/sync/upsert', {
      tableName: TABLE, columns, rows: payloadRows,
    });
    const code = (r.parsed?.code as number | undefined) ?? null;
    const data = (r.parsed?.data ?? {}) as {
      affectedRowCount?: number; errorCount?: number; errorList?: unknown[];
    };
    const errors = data.errorCount ?? 0;

    /* The answer written back onto the rows, so the console can say which rows Dengage has been
       sent rather than which rows exist here. Accepted is still not stored: storage lags about two
       minutes and a count is what proves it. */
    const detail = `code ${code}, affected ${data.affectedRowCount ?? 0}, errors ${errors}`;
    if (errors === 0 && code === 0) {
      await db.from('dtelco_reco')
        .update({ synced_at: new Date().toISOString(), sync_detail: detail })
        .in('contact_key', list.map((x) => x.contact_key));
    }

    return new Response(JSON.stringify({
      ok: code === 0 && errors === 0,
      op, table: TABLE, sent: payloadRows.length,
      http: r.http, code,
      affected: data.affectedRowCount ?? 0,
      errors,
      error_list: (data.errorList ?? []).slice(0, 10),
      raw: code === null ? r.text.slice(0, 400) : undefined,
      note: 'a 200 here means at least some rows landed. errorCount and errorList are where a ' +
            'partial failure lives, and accepted is still not stored: prove it with a count.',
    }, null, 1), { headers });
  }

  /* trigger_flow. The flow id comes from the panel, and this deliberately does not guess one:
     an id shaped like a uuid that names nothing would answer 200 with HasError true, and reading
     that as a working trigger is exactly the mistake this file exists to avoid. */
  const flowId = String(body.flow_id ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(flowId)) {
    return new Response(JSON.stringify({
      ok: false, op,
      why: 'flow_id must be the uuid of an automated flow whose first step is an API trigger. ' +
           'It comes from the panel and this function will not invent one.',
    }, null, 1), { status: 400, headers });
  }
  const r = await call(bearer, '/dataspace/triggerAutomatedFlow', { id: flowId });
  const code = (r.parsed?.code as number | undefined) ?? null;
  const data = (r.parsed?.data ?? {}) as { HasError?: boolean; ErrorMessage?: string };
  return new Response(JSON.stringify({
    ok: code === 0 && data.HasError !== true,
    op, flow_id: flowId, http: r.http, code,
    has_error: data.HasError ?? null,
    error_message: data.ErrorMessage ?? null,
    transaction_id: r.parsed?.transactionId ?? null,
    raw: code === null ? r.text.slice(0, 400) : undefined,
    note: 'the flow needs an API trigger as its first step, and HasError in the body is the ' +
          'outcome. The HTTP status only says the request arrived.',
  }, null, 1), { headers });
});
