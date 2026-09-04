/* dtelco-coupons: read a Dengage coupon list, so the room can see there is stock before a send.
 *
 * The abandoned checkout email carries a discount code, and there are two ways to do that. A
 * single code in the copy, which every recipient shares and the first person to post on a forum
 * makes worthless. Or a coupon list, where every recipient gets a code of their own, the platform
 * marks it taken, and a list running low raises its own alert. This build uses the second.
 *
 * The code itself is inserted in the panel and never here. docs/coupon: "in the Email Rich Text
 * Editor, click Insert > Customization Tags ... a new Coupons tab appears on the right. From this
 * tab, you can select a previously created coupon list ... Click the desired coupon list to insert
 * it dynamically into your content." There is no documented tag to paste, which is why the body in
 * panel/email carries a marked slot rather than a guess.
 *
 * What this endpoint is for is the question a presenter gets asked and wants to answer from a
 * screenshot: is the list real, is it active, has it got any left. GET /contents/coupon-list/{id}
 * answers all three, and this reports the answer in the words the room needs.
 *
 * What it deliberately does NOT do is validate or redeem a code. Dengage has no such endpoint, and
 * inventing one in a demonstration is exactly the sort of thing that ends up quoted back in a
 * tender. Redemption is the operator's billing system, and the checkout says so on screen.
 */

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
/* The list the abandoned checkout journey draws from. Set once in the function's environment so
   the console reads the same list the panel content points at, rather than a number typed twice. */
const LIST_ID = Deno.env.get('DTELCO_COUPON_LIST_ID') ?? '';

/* The shape a generated code takes. docs/coupon, Coupon Code Generation: a prefix is optional and
   "the system automatically appends 8 random letters and numbers". So a code from a list whose
   prefix is DTELCO- reads DTELCO-A1B2C3D4. The checkout recognises that and nothing else: a code
   it does not recognise is refused rather than accepted on faith. */
const PREFIX = Deno.env.get('DTELCO_COUPON_PREFIX') ?? 'DTELCO-';
const CODE_SHAPE = new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Za-z0-9]{8}$`);

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

type List = {
  ListId?: number; Name?: string; Key?: string; Description?: string; Status?: string;
  ExpiryDate?: string | null; AvailableCouponCount?: number; TakenCouponCount?: number;
  TotalCouponCount?: number; ShowShortageWarning?: boolean; ShowExpiryWarning?: boolean;
};

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '30' } });
  }

  const url = new URL(req.url);

  /* The shape check, answerable with no account at all, so the checkout can refuse a typed code
     offline and the console can show the rule rather than assert it. */
  const check = url.searchParams.get('check');
  if (check !== null) {
    return new Response(JSON.stringify({
      code: check,
      recognised: CODE_SHAPE.test(check.trim()),
      shape: `${PREFIX} followed by 8 letters or numbers`,
      why: 'docs/coupon, Coupon Code Generation: a prefix is optional and the system automatically ' +
           'appends 8 random letters and numbers.',
      redemption: 'Dengage issues the code and marks it taken. It has no validate or redeem ' +
                  'endpoint, so applying the discount is the operator\'s billing system.',
    }, null, 1), { headers });
  }

  const listId = (url.searchParams.get('list') ?? LIST_ID).trim();
  if (!/^\d+$/.test(listId)) {
    return new Response(JSON.stringify({
      function: 'dtelco-coupons',
      reads: 'GET ?list=<listId> reports one Dengage coupon list. GET ?check=<code> tests a code ' +
             'against the shape a generated code takes.',
      configured: !!(USERKEY && PASSWORD),
      list_id_configured: !!LIST_ID,
      prefix: PREFIX,
      endpoint: 'GET /contents/coupon-list/{listId}',
      note: 'This endpoint reads. It never imports, takes or redeems a coupon.',
    }, null, 1), { headers });
  }

  const bearer = await login();
  if (!bearer) {
    return new Response(JSON.stringify({
      ok: false, list_id: listId,
      why: 'no Dengage credentials are configured for this function, so the list cannot be read',
    }, null, 1), { headers });
  }

  const r = await fetch(`${API}/contents/coupon-list/${listId}`, {
    headers: { authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(12000),
  });
  const text = await r.text();
  /* An API user without the permission answers 403 with an empty body, which reads as a network
     fault unless it is named. Naming it is the difference between "the demo is broken" and "this
     API user needs one more permission". */
  if (r.status === 403) {
    return new Response(JSON.stringify({
      ok: false, list_id: listId, http: 403,
      why: 'the API user has no coupon permission: 403 with an empty body',
    }, null, 1), { headers });
  }
  let parsed: { code?: number; message?: string; data?: List } | null = null;
  try { parsed = JSON.parse(text); } catch { /* reported below as its own text */ }
  const list = parsed?.data;
  if (!list) {
    return new Response(JSON.stringify({
      ok: false, list_id: listId, http: r.status,
      code: parsed?.code ?? null, message: parsed?.message ?? null,
      raw: text.slice(0, 400),
    }, null, 1), { headers });
  }

  const available = list.AvailableCouponCount ?? 0;
  return new Response(JSON.stringify({
    ok: true,
    list_id: list.ListId ?? Number(listId),
    name: list.Name ?? null,
    /* The Key is the snippet docs/coupon calls "a short identifier usable in content". It is what
       ties the list in the panel to the codes the checkout recognises. */
    key: list.Key ?? null,
    status: list.Status ?? null,
    expires: list.ExpiryDate ?? null,
    available,
    taken: list.TakenCouponCount ?? 0,
    total: list.TotalCouponCount ?? 0,
    shortage_warning: list.ShowShortageWarning ?? false,
    expiry_warning: list.ShowExpiryWarning ?? false,
    /* The sentence a presenter needs, rather than three numbers to interpret on the spot. */
    reads: available > 0
      ? `${available} of ${list.TotalCouponCount ?? 0} codes are still available, so the next ` +
        'recipient gets one of their own'
      : 'no codes are left in this list, so a send would go out without one',
    prefix: PREFIX,
    redemption: 'Dengage issues a unique code per recipient and marks it taken. There is no ' +
                'validate or redeem endpoint, so applying the discount is the operator\'s ' +
                'billing system.',
  }, null, 1), { headers });
});
