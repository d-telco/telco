/* dtelco-ecomm: the catalogue and the orders, into Dengage's own ecommerce tables.
 *
 * Two endpoints, /dataspace/ecomm/product/upsert and /dataspace/ecomm/orders_detail/upsert, and
 * each is here for a reason rather than because it was on a list.
 *
 * PRODUCTS. The catalogue used to reach Dengage as a CSV feed on a schedule. The API is the route
 * now: a price drop or a restock reaches Dengage in seconds instead of at the next pull, which is
 * the difference between a price drop journey that fires today and one that fires tomorrow. The
 * feed endpoint keeps serving the site and the Android app, because that is not a Dengage route.
 *
 * ORDERS. ec:order from the browser writes order_events and order_events_detail, which are
 * behavioural rows about a session. This writes orders and orders_detail, which are the operator's
 * record of what was bought. Different table families, different questions, and a real integration
 * usually feeds both: the browser for the moment, the backend for the truth that survives a closed
 * tab. Both are sent, and a presenter can point at the difference.
 *
 * Every value is derived here from an id. A page that passed a title and a price could pass any
 * title and any price, and reference/upsertproduct validates several of them: product_id, title,
 * category_path, price, discounted_price, link and image_link are required, discounted_price must
 * not exceed price, and stock_count must not be negative. An order is validated too: item_count
 * must equal the sum of the quantities and total_amount the sum of the paid prices. So this
 * computes both rather than trusting either.
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

/* The vocabularies reference/upsertorders closes. A value outside them is refused here rather than
   sent and rejected, because a rejection arrives as a validation message nobody reads. */
const ORDER_STATUS = ['success', 'refund'];
const ORDER_SOURCE = ['web', 'mobile_app', 'offline'];
const PAYMENT_METHOD = ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'mobile_payment',
                        'check', 'prepaid_card', 'crypto', 'cod', 'online_payment'];

/* 1000 products per call, from the same page: "Maximum 1000 products can be passed to this
   endpoint." The catalogue is 245, so this chunks rather than assuming it fits. */
const PRODUCT_CHUNK = 1000;

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

async function call(bearer: string, path: string, payload: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const text = await r.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(text); } catch { /* a 200 that will not parse is not a success */ }
  return { http: r.status, parsed, text };
}

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
};

/* One product, in the shape reference/upsertproduct defines, and read from the view that already
   builds it rather than from the table.
 *
 * v_dtelco_dengage_product is where link, mobile_web_link, the two deep links and the three image
 * URLs are composed from link_path and image_slug, because the table holds neither. Building them
 * a second time here would be a second place for the storefront's own URLs to drift from the ones
 * Dengage sends people to. The first version of this function did read the table, and its sample
 * came back with no link and no image_link at all: both are required, so every batch would have
 * been refused. The view was already right; the function was asking the wrong thing.
 *
 * The view is shaped for CSV, so money arrives as a formatted string and is_active as TRUE or
 * FALSE. Both are coerced back here, because the API wants a number and a boolean.
 *
 * Only the eighteen documented fields travel. store_name, parent_id, tags and trans_title are
 * columns the CSV upload carries and the API does not name, and sending a field an endpoint has
 * never heard of is a good way to have a whole batch refused for a reason nobody can read.
 */
const PRODUCT_FIELDS = new Set([
  'product_id', 'title', 'description', 'category_path', 'brand', 'link', 'mobile_web_link',
  'android_deep_link', 'ios_deep_link', 'image_link', 'small_image_link', 'large_image_link',
  'price', 'discounted_price', 'stock_count', 'is_active', 'publish_date', 'variants',
]);
const VARIANT_FIELDS = new Set([
  'product_variant_id', 'title', 'price', 'discounted_price', 'stock_count',
  'image_link', 'small_image_link', 'large_image_link', 'size', 'color', 'gender', 'age_interval',
]);

/* DD-MM-YYYY HH24:MI is what the CSV view emits, because that is what the file upload takes. The
   API's DateTime Formats list has no such entry, so it is turned into yyyy-MM-dd HH:mm:ss, which
   is on it. Sending the CSV form would be sending a date the endpoint cannot read. */
function apiDate(csv: unknown): string | undefined {
  const m = /^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2})/.exec(String(csv ?? ''));
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:00`;
}

function trim(row: Record<string, unknown>, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!allowed.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

function variantRow(v: Record<string, unknown>) {
  const price = money(v.price);
  const discounted = money(v.discounted_price) ?? price;
  return trim({
    product_variant_id: v.product_variant_id,
    title: v.title,
    price,
    /* discounted_price <= price is validated on a variant too, and a variant is where a discount
       is most likely to be entered by hand. */
    discounted_price: discounted !== null && price !== null && discounted > price ? price : discounted,
    stock_count: typeof v.stock_count === 'number' && v.stock_count >= 0 ? v.stock_count : undefined,
    image_link: v.image_link,
    small_image_link: v.small_image_link,
    large_image_link: v.large_image_link,
    size: v.size, color: v.color, gender: v.gender, age_interval: v.age_interval,
  }, VARIANT_FIELDS);
}

function productRow(p: Record<string, unknown>, variants: Record<string, unknown>[]) {
  const price = money(p.price);
  const discounted = money(p.discounted_price) ?? price;
  const row: Record<string, unknown> = {
    product_id: p.product_id,
    title: p.title,
    description: p.description,
    category_path: p.category_path,
    brand: p.brand,
    link: p.link,
    mobile_web_link: p.mobile_web_link,
    android_deep_link: p.android_deep_link,
    ios_deep_link: p.ios_deep_link,
    image_link: p.image_link,
    small_image_link: p.small_image_link,
    large_image_link: p.large_image_link,
    price,
    discounted_price: discounted !== null && price !== null && discounted > price ? price : discounted,
    /* is_active decides whether Dengage will recommend it and stock_count decides whether it is
       shown as available. A 0 stock_count announces the product out of stock and Number(null) is 0,
       so an absent count is omitted rather than defaulted, which is the same trap the page has. */
    is_active: String(p.is_active).toUpperCase() === 'TRUE',
    publish_date: apiDate(p.publish_date),
  };
  const n = Number(p.stock_count);
  if (Number.isFinite(n) && n >= 0) row.stock_count = n;
  /* Variants travel inside the product, which is one call rather than the two files the CSV
     upload needs. reference/upsertproduct: "Variants should be inserted into the product_variant
     table. Variants are optional. can be null or empty." */
  if (variants.length) row.variants = variants.map(variantRow);
  return trim(row, PRODUCT_FIELDS);
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    const [{ count: products }, { count: orders }] = await Promise.all([
      db.from('dtelco_product').select('product_id', { count: 'exact', head: true }),
      db.from('dtelco_order').select('order_id', { count: 'exact', head: true }),
    ]);
    return new Response(JSON.stringify({
      function: 'dtelco-ecomm',
      ops: {
        products: 'POST /dataspace/ecomm/product/upsert, the whole catalogue. Previews unless send: true',
        order: 'POST /dataspace/ecomm/orders_detail/upsert, one order, stored here first. preview: true computes and writes nothing',
      },
      products_in_catalogue: products ?? 0,
      orders_stored: orders ?? 0,
      product_chunk: PRODUCT_CHUNK,
      order_status: ORDER_STATUS,
      order_source: ORDER_SOURCE,
      payment_method: PAYMENT_METHOD,
      why_both_order_routes: 'ec:order from the browser writes order_events and ' +
        'order_events_detail, the behavioural family. This writes orders and orders_detail, the ' +
        'record family. A closed tab loses the first and not the second.',
      why_preview_is_the_default: 'a body that wrote into the account whenever an API user ' +
        'happened to be configured elsewhere was indistinguishable from one that did not. The ' +
        'write is asked for by name now, so a check, a runbook or a mistyped body cannot reach ' +
        'the account by accident.',
      dengage_configured: !!(USERKEY && PASSWORD),
      note: 'the CSV feed still serves the site and the Android app. It is no longer how the ' +
            'catalogue reaches Dengage.',
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
  const op = String(body.op ?? '');
  if (op !== 'products' && op !== 'order') {
    return new Response(JSON.stringify({ error: 'unknown op', ops: ['products', 'order'] }),
      { status: 400, headers });
  }

  /* ------------------------------------------------------------------ the catalogue */

  if (op === 'products') {
    /* The same two views the CSV feed serves, so the file a person uploads by hand and the batch
       this sends are the identical catalogue rather than two builds of it. */
    const { data: rows } = await db.from('v_dtelco_dengage_product').select('*');
    const { data: vrows } = await db.from('v_dtelco_dengage_product_variant').select('*');
    const list = rows ?? [];
    const byProduct = new Map<string, Record<string, unknown>[]>();
    for (const v of vrows ?? []) {
      const pid = String(v.product_id);
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid)!.push(v);
    }
    const built = list.map((p) => productRow(p, byProduct.get(String(p.product_id)) ?? []));

    /* Preview unless somebody asked to send, and not the other way round.
     *
     * This used to send whenever an API user happened to be configured, and the difference between
     * the two behaviours was invisible from the call: the same body, the same op, and whether 245
     * products landed in the account's catalogue depended on an environment variable somewhere
     * else. The repository's own check suite called this to assert the shape of the payload and,
     * the day credentials arrived, started upserting the whole catalogue on every run. A test that
     * writes into a shared account is a test nobody can run twice.
     *
     * So the safe answer is the default and the write has to be asked for by name. A curl in a
     * runbook, a check, or a mistyped body can no longer reach the account. */
    const send = body.send === true;
    const bearer = send ? await login() : null;
    if (!bearer) {
      /* The shape it would send, so a person can see the required fields are there before an
         account exists to refuse them. link and image_link being absent here is what caught the
         first version of this function. */
      const missing = built.filter((b) => !b.link || !b.image_link || !b.title || !b.category_path
        || b.price === undefined || b.discounted_price === undefined);
      return new Response(JSON.stringify({
        ok: false, op, sent: false, products: built.length,
        variants: (vrows ?? []).length,
        missing_required: missing.length,
        missing_examples: missing.slice(0, 3).map((m) => m.product_id),
        why: send
          ? 'send was asked for and no Dengage API user is configured, so nothing was sent'
          : 'this is a preview and nothing was sent. POST send: true to upsert the catalogue.',
        configured: !!(USERKEY && PASSWORD),
        sample: built[0] ?? null,
      }, null, 1), { headers });
    }

    const chunks: Record<string, unknown>[][] = [];
    for (let i = 0; i < built.length; i += PRODUCT_CHUNK) {
      chunks.push(built.slice(i, i + PRODUCT_CHUNK));
    }
    const results = [];
    /* Sequential, never parallel. Parallel Data Space reads trip 429 and a batch that half landed
       is worse than one that took two seconds longer. */
    for (const chunk of chunks) {
      const r = await call(bearer, '/dataspace/ecomm/product/upsert', { products: chunk });
      results.push({ sent: chunk.length, http: r.http,
                     code: (r.parsed?.code as number | undefined) ?? null,
                     message: r.parsed?.message ?? null,
                     raw: r.parsed ? undefined : r.text.slice(0, 300) });
    }
    const failed = results.filter((x) => x.code !== 0);
    return new Response(JSON.stringify({
      ok: failed.length === 0, op, sent: true, products: built.length,
      batches: results.length, results,
      note: 'accepted is not stored. Storage lags about two minutes; dtelco-dengage-tables counts ' +
            'the product table and a count is the only proof.',
    }, null, 1), { headers });
  }

  /* ------------------------------------------------------------------ one order */

  const key = String(body.contact_key ?? '').trim();
  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  const orderId = String(body.order_id ?? '').trim();
  if (!/^DPS-dtelco-[a-z]+-\d+$/.test(orderId)) {
    return new Response(JSON.stringify({ error: 'order_id refused: shape',
      expected: 'DPS-dtelco-<kind>-<timestamp>' }), { status: 400, headers });
  }
  const status = String(body.order_status ?? 'success');
  const source = String(body.order_source ?? 'web');
  const payment = body.payment_method ? String(body.payment_method) : null;
  if (!ORDER_STATUS.includes(status)) {
    return new Response(JSON.stringify({ error: 'order_status refused', allowed: ORDER_STATUS,
      why: 'reference/upsertorders allows success and refund and nothing else. A shipped or ' +
           'delivered status is a custom event.' }), { status: 400, headers });
  }
  if (!ORDER_SOURCE.includes(source)) {
    return new Response(JSON.stringify({ error: 'order_source refused', allowed: ORDER_SOURCE }),
      { status: 400, headers });
  }
  if (payment && !PAYMENT_METHOD.includes(payment)) {
    return new Response(JSON.stringify({ error: 'payment_method refused', allowed: PAYMENT_METHOD }),
      { status: 400, headers });
  }

  /* The lines, and every price is looked up rather than taken from the page. This is the same rule
     the relay follows for a product: a caller that passes a price can pass any price, and the row
     would then record whatever it was told. */
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) {
    return new Response(JSON.stringify({ error: 'an order needs at least one item' }),
      { status: 400, headers });
  }
  const ids = [...new Set(raw.map((i: Record<string, unknown>) => String(i.product_id ?? '')))]
    .filter(Boolean);
  const { data: known } = await db.from('dtelco_product')
    .select('product_id, price, discounted_price').in('product_id', ids.length ? ids : ['__none__']);
  const priced = new Map((known ?? []).map((p) => [p.product_id as string, p]));

  const notes: string[] = [];
  const items = [];
  for (const i of raw as Record<string, unknown>[]) {
    const pid = String(i.product_id ?? '');
    const p = priced.get(pid);
    if (!p) { notes.push(`${pid} is not in the catalogue, so that line was dropped`); continue; }
    const qty = Number(i.quantity);
    items.push({
      product_id: pid,
      product_variant_id: String(i.product_variant_id ?? pid),
      quantity: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
      unit_price: money(p.price) ?? 0,
      discounted_price: money(p.discounted_price) ?? money(p.price) ?? 0,
    });
  }
  if (!items.length) {
    return new Response(JSON.stringify({ ok: false, order_id: orderId, notes,
      why: 'no line resolved against the catalogue, so nothing was stored' }), { status: 400, headers });
  }

  /* Computed, never accepted. reference/upsertorders validates both: item_count must be the sum of
     the quantities and total_amount the sum of the paid prices. A caller's own totals disagreeing
     with its own lines is the most common way a batch is refused. */
  const itemCount = items.reduce((t, i) => t + i.quantity, 0);
  const totalAmount = Number(items.reduce((t, i) => t + i.discounted_price * i.quantity, 0).toFixed(2));

  /* The same rule as the catalogue above, for the same reason. A preview computes and validates
     everything and writes nothing, anywhere: not the order row, not the lines, not Dengage. It is
     what the check suite and the verification console ask for, because what they assert is that
     the totals are computed here rather than accepted from a caller, and that assertion needs no
     row to survive it. */
  if (body.preview === true) {
    return new Response(JSON.stringify({
      ok: true, op, order_id: orderId, preview: true, would_store: true, sent: false,
      items: items.length, item_count: itemCount, total_amount: totalAmount, notes,
      why: 'a preview. Nothing was written here and nothing was sent to Dengage.',
    }, null, 1), { headers });
  }

  const orderDate = new Date().toISOString();
  const { error: storeError } = await db.from('dtelco_order').upsert({
    order_id: orderId, contact_key: key, order_date: orderDate, order_status: status,
    order_source: source, payment_method: payment, coupon_code: body.coupon_code ? String(body.coupon_code) : null,
    item_count: itemCount, total_amount: totalAmount, dengage_status: 'received', simulated: true,
  }, { onConflict: 'order_id' });
  if (storeError) {
    return new Response(JSON.stringify({ error: 'could not store the order', detail: storeError.message }),
      { status: 500, headers });
  }
  await db.from('dtelco_order_item').upsert(
    items.map((i) => ({ order_id: orderId, ...i })), { onConflict: 'order_id,product_variant_id' });

  const bearer = await login();
  if (!bearer) {
    await db.from('dtelco_order').update({ dengage_status: 'pending api user' }).eq('order_id', orderId);
    return new Response(JSON.stringify({
      ok: true, order_id: orderId, stored: true, sent: false, items: items.length,
      item_count: itemCount, total_amount: totalAmount, notes,
      dengage_status: 'pending api user',
      why: 'the order is on record. Dengage was not called because no API user is configured.',
    }, null, 1), { headers });
  }

  /* yyyy-MM-dd HH:mm:ss, from the DateTime Formats list at the head of the REST reference. */
  const d = new Date(orderDate);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ` +
                `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;

  const r = await call(bearer, '/dataspace/ecomm/orders_detail/upsert', {
    orders: [{
      order_id: orderId,
      contact_key: key,
      order_date: stamp,
      order_status: status,
      order_source: source,
      ...(payment ? { payment_method: payment } : {}),
      ...(body.coupon_code ? { coupon_code: String(body.coupon_code) } : {}),
      item_count: itemCount,
      total_amount: totalAmount,
      items,
    }],
  });
  const code = (r.parsed?.code as number | undefined) ?? null;
  const detail = `code ${code}: ${r.parsed?.message ?? (r.parsed ? 'no message' : r.text.slice(0, 200))}`;
  await db.from('dtelco_order')
    .update({ dengage_status: code === 0 ? 'accepted' : 'refused', dengage_detail: detail.slice(0, 1000) })
    .eq('order_id', orderId);

  return new Response(JSON.stringify({
    ok: code === 0,
    order_id: orderId, stored: true, sent: code === 0, items: items.length,
    item_count: itemCount, total_amount: totalAmount, notes,
    http: r.http, code, message: r.parsed?.message ?? null,
    raw: code === null ? r.text.slice(0, 400) : undefined,
    note: 'this is the orders family. The browser also sent ec:order, which is the order_events ' +
          'family, and both are on purpose: one is the record, the other is the moment.',
  }, null, 1), { headers });
});
