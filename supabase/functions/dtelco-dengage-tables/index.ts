/* dtelco-dengage-tables: the row counts, read from Dengage rather than guessed.
 *
 * The verification console can prove a page fired an event. It cannot prove Dengage stored it, and
 * a demonstration that says "sent" is worth nothing next to one that says "stored, and here is the
 * count". This walks the Data Space listing, finds the demo's own custom tables, and reports their
 * row counts beside the six standard event tables and the two master tables.
 *
 * Three properties of that read shape how it is done here.
 *
 * Storage lags about two minutes. A count read straight after a click shows nothing and means
 * nothing, so the answer carries the lag rather than leaving a presenter to wonder.
 *
 * The listing is paged and an account holds far more tables than a demo's, so it is walked until
 * found rather than read once and given up on.
 *
 * Seven simultaneous reads trip the rate limit: the seventh came back 429 every time. The reads
 * here are sequential with a backoff, which is slower and finishes.
 *
 * In a shared account a count that moved is not proof it was your event. A count that did not move
 * is proof it was not. That asymmetry is the whole method and it is printed with the answer.
 */
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
    'access-control-allow-methods': 'GET, OPTIONS',
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
const EVENT_TABLE = Deno.env.get('DTELCO_EVENT_TABLE') ?? 'dtelco_events';
/* The operator's own table, counted beside the rest. It is written by the Event API from the
   server rather than by an SDK, so nothing in a browser can tell you whether it exists, and a
   table that does not exist accepts every row and stores none of them. Counting it here is the
   only place that difference becomes visible. */
const BSS_TABLE = Deno.env.get('DTELCO_BSS_EVENT_TABLE') ?? 'dtelco_bss_events';

const STANDARD = ['page_view_events', 'shopping_cart_events', 'order_events',
                  'order_events_detail', 'wishlist_events', 'search_events'];
/* The two master tables, counted for the same reason the event tables are: a contact write is
   proved the way an event is. The persona seed answers accepted; the master_contact count is
   what says stored, and it is the only number that can tell an upsert that landed from one the
   reply only half described. */
const MASTER = ['master_contact', 'master_device'];
/* The two ecommerce catalogue tables, because dtelco-ecomm's push names this count as its proof.
   If the platform does not list them in /dataspace/tables they read not found, which is itself
   the honest answer rather than a zero. */
const ECOMM = ['product', 'product_variant'];

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

/* Sequential with a backoff, because parallel reads trip the cap and a 429 reads like a missing
   table unless you know better. */
async function get(bearer: string, path: string, attempt = 0): Promise<Response> {
  const r = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 429 && attempt < 3) {
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    return get(bearer, path, attempt + 1);
  }
  return r;
}

async function findTables(bearer: string, wanted: string[]) {
  const found = new Map<string, string>();
  for (let offset = 0; offset < 20000; offset += 1000) {
    const r = await get(bearer, `/dataspace/tables?limit=1000&offset=${offset}`);
    if (!r.ok) break;
    const body = await r.json();
    const rows: Array<{ tableName?: string; publicId?: string }> = body?.data?.result ?? [];
    for (const row of rows) {
      if (row.tableName && row.publicId && wanted.includes(row.tableName)) {
        found.set(row.tableName, row.publicId);
      }
    }
    if (rows.length < 1000 || found.size === wanted.length) break;
  }
  return found;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  const wanted = [...STANDARD, ...MASTER, ...ECOMM, EVENT_TABLE, BSS_TABLE];
  const bearer = await login();
  if (!bearer) {
    return new Response(JSON.stringify({
      function: 'dtelco-dengage-tables',
      dengage_configured: false,
      tables_it_will_count: wanted,
      custom_event_table: EVENT_TABLE,
      operator_event_table: BSS_TABLE,
      storage_lag_seconds: 120,
      why: 'no API user configured yet, so nothing was read. The tables above are what it will ' +
           'count when there is one.',
      method: 'read the counts, walk the journey, read them again. In a shared account a count ' +
              'that moved is not proof it was your event; a count that did not move is proof it ' +
              'was not.',
    }, null, 1), { headers });
  }

  const found = await findTables(bearer, wanted);
  const counts: Record<string, number | string> = {};
  for (const name of wanted) {
    const publicId = found.get(name);
    if (!publicId) {
      /* Named rather than reported as zero. Until a custom table exists in the panel, every send
         to it is accepted by the endpoint and stored nowhere, with no error anywhere. A zero here
         would read as "nothing happened yet" when the truth is "the table does not exist". */
      counts[name] = 'not found in Data Space';
      continue;
    }
    const r = await get(bearer, `/dataspace/tables/${publicId}`);
    if (!r.ok) { counts[name] = `error HTTP ${r.status}`; continue; }
    const body = await r.json();
    counts[name] = body?.data?.totalRowCount ?? 'no count in the reply';
  }

  return new Response(JSON.stringify({
    function: 'dtelco-dengage-tables',
    dengage_configured: true,
    datacenter: DC,
    custom_event_table: EVENT_TABLE,
    operator_event_table: BSS_TABLE,
    counts,
    storage_lag_seconds: 120,
    read_at: new Date().toISOString(),
    method: 'read the counts, walk the journey, read them again. Storage lags about two minutes, ' +
            'so a reading taken straight after a click shows nothing and means nothing.',
    caveat: 'in a shared account a count that moved is not proof it was your event. A count that ' +
            'did not move is proof it was not.',
  }, null, 1), { headers });
});
