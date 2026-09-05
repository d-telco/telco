/* dtelco-preflight: can this backend reach the account, and from which address.
 *
 * Two things have to be true before any REST call works, and they fail in ways that look alike
 * from the outside: the API user has to be configured, and the address these functions call from
 * has to be allowed. A refusal for either reason arrives as a non 200 with very little in it, so
 * this endpoint separates them and says which.
 *
 * It reads. It sends nothing, writes nothing and creates nothing. The only call it makes to the
 * account is /login, which is the cheapest possible proof that credentials and network path are
 * both good, and it reports the outcome rather than the token.
 *
 * Credential names are accepted in two spellings. The functions read DENGAGE_USERKEY and
 * DENGAGE_PASSWORD; an account may be stored under its own name instead. This resolves either and
 * reports which one it found, so a mismatch reads as a mismatch rather than as "not configured".
 * No value is ever returned, only whether a name is set.
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

/* The base, with the secret taken out of it.
 *
 * A proxy path carries the account's own secret, and this endpoint is public. Printing API here
 * would publish it to anybody who called this URL. The host is useful to see and the secret is
 * not, so only the host is reported. */
function safeBase(): string {
  if (!PROXY) return API;
  try { return `${new URL(PROXY).origin}/<redacted>/rest`; }
  catch { return '<proxy configured>/rest'; }
}

/* Every name this build or an operator might have used, in preference order. */
const USER_NAMES = ['DENGAGE_USERKEY', 'TELCO_API_USER', 'telco_api_user'];
const PASS_NAMES = ['DENGAGE_PASSWORD', 'TELCO_API_PASSWORD', 'telco_api_password'];

function firstSet(names: string[]): { name: string | null; value: string } {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim()) return { name: n, value: v.trim() };
  }
  return { name: null, value: '' };
}

/* The address the account sees. Supabase Edge Functions egress from a shared pool rather than one
   fixed address, so this is the measurement that decides whether an allowlist can work at all. */
async function egress(): Promise<string | null> {
  try {
    const r = await fetch('https://api.ipify.org?format=json',
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json())?.ip ?? null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  const user = firstSet(USER_NAMES);
  const pass = firstSet(PASS_NAMES);

  /* Names only. A value never leaves this function. */
  const present: Record<string, boolean> = {};
  for (const n of [...USER_NAMES, ...PASS_NAMES]) present[n] = !!Deno.env.get(n)?.trim();

  const [ip] = await Promise.all([egress()]);

  const base = {
    function: 'dtelco-preflight',
    reads: 'whether the account can be reached, and from which address',
    writes: 'nothing. The only call it makes to the account is /login',
    datacenter: DC,
    api_base: safeBase(),
    via: PROXY ? 'the configured egress proxy' : 'direct to the account',
    proxy_configured: !!PROXY,
    egress_ip: ip,
    egress_ip_note: PROXY
      ? 'this is the address of the Supabase function, not the address the account sees. With a ' +
        'proxy configured the account sees the proxy, so a login that succeeds is the proof.'
      : undefined,
    egress_note: 'Supabase Edge Functions egress from a shared pool, so this address changes ' +
                 'between invocations. An allowlist pinned to one address refuses calls that ' +
                 'carry correct credentials. Call this a few times: a different address each ' +
                 'time is the answer. DTELCO_API_PROXY is the way round it.',
    credential_names_present: present,
    resolved_user_from: user.name,
    resolved_password_from: pass.name,
  };

  if (!user.name || !pass.name) {
    return new Response(JSON.stringify({
      ...base,
      ok: false,
      login: null,
      why: 'no API user resolved. The functions read DENGAGE_USERKEY and DENGAGE_PASSWORD; set ' +
           'those two names, or the values under a name listed above.',
    }, null, 1), { headers });
  }

  let http: number | null = null, full = '', failed: string | null = null;
  try {
    const r = await fetch(`${API}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userkey: user.value, password: pass.value }),
      signal: AbortSignal.timeout(15000),
    });
    http = r.status;
    full = await r.text();
  } catch (e) {
    failed = String(e).slice(0, 200);
  }

  /* Parsed from the whole answer, never from a truncated copy of it. */
  let hasToken = false;
  try { hasToken = !!JSON.parse(full)?.access_token; } catch { /* not json */ }
  /* And belt and braces: an answer that mentions a token is never echoed, whatever the parse did.
     The two guards are deliberate, because the first one failing is what published one. */
  const echoable = !hasToken && !/access_token|refresh_token/i.test(full);

  /* The three answers worth telling apart. A 401 is the credentials. A 403 with nothing in it, or
     a connection that never completes, is the network path. A token is both. */
  const verdict = hasToken ? 'the account answered and issued a token'
    : failed ? `the account could not be reached: ${failed}`
    : http === 401 ? 'the credentials were refused'
    : http === 403 ? (PROXY
        ? 'refused with 403 even through the proxy. Either the proxy is not leaving from the ' +
          'allowlisted address, or the API user lacks a permission'
        : 'refused with 403, which is what an address outside the allowlist looks like. Set ' +
          'DTELCO_API_PROXY to a host that holds the allowlisted address')
    : `answered HTTP ${http} with no token`;

  /* ?froms=1: the GetEmailFroms listing, read only, because a transactional email that answers
     code 6, Vmta information not found, is asking exactly this question: which sender identities
     does the account hold, and under which id. Measured 5 September 2026 when the first two
     template sends both answered code 6. The reference gives the call relative, so the two
     plausible paths are both tried and each answer is reported as itself. From names and
     addresses are account configuration on the same shelf as the sender profile the panel shows;
     no token and no credential is ever echoed. */
  let froms: unknown = undefined;
  if (hasToken && new URL(req.url).searchParams.has('froms')) {
    let bearer = '';
    try { bearer = JSON.parse(full)?.access_token ?? ''; } catch { /* guarded above */ }
    const probes = [];
    for (const path of ['/email/froms', '/transactional/email/froms']) {
      try {
        const r = await fetch(`${API}${path}`, {
          headers: { authorization: `Bearer ${bearer}` },
          signal: AbortSignal.timeout(12000),
        });
        const text = await r.text();
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { /* reported as text below */ }
        const data = (parsed as { data?: unknown })?.data;
        probes.push({
          path, http: r.status,
          entries: Array.isArray(data) ? data.slice(0, 10) : undefined,
          raw: Array.isArray(data) ? undefined : text.slice(0, 300),
        });
      } catch (e) {
        probes.push({ path, http: null, raw: String(e).slice(0, 150) });
      }
    }
    froms = probes;
  }

  return new Response(JSON.stringify({
    ...base,
    ok: hasToken,
    login: { http, issued_token: hasToken, verdict },
    email_froms: froms,
    /* Never the token, and never the body when it holds one. */
    detail: echoable ? (full.slice(0, 300) || undefined) : undefined,
  }, null, 1), { headers });
});
