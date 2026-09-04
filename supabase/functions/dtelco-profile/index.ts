/* dtelco-profile: read one persona's plan, usage, balance and recommendations.
 *
 * Public by design, like any form handler. A token shipped in a public page is not a secret, so
 * the defence is validation and a rate cap, not obscurity. It reads and never writes, it takes
 * no table name from the caller, and it refuses anything that is not a DPS- key before it
 * touches the database.
 *
 * ?reco=1 returns the same three product ids the web engine would choose for this contact. The
 * Android app calls this rather than reimplementing the rules, so both surfaces recommend the
 * same three things and a message can print them without asking which surface asked.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 10 * 60 * 1000;
const CAP = 120;

/* Best effort, per instance, and it resets on a cold start. That is honest: the real defence is
 * that this endpoint reads invented demo data, validates its one input, and cannot write. */
const hits = new Map<string, number[]>();
function overCap(who: string): boolean {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > CAP;
}

function cors(origin: string | null) {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey',
  };
  if (origin && ORIGINS.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const RULES = ['usage_80', 'traveller', 'family', 'alternative', 'popular'] as const;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  const key = (url.searchParams.get('key') ?? '').trim();

  // A GET with no key is the health line: configuration state, never a secret value.
  if (!key) {
    return new Response(JSON.stringify({
      function: 'dtelco-profile',
      reads: ['dtelco_subscriber', 'dtelco_usage', 'dtelco_product', 'dtelco_product_relation'],
      writes: [],
      key_shape: KEY_SHAPE.source,
      rate_cap: `${CAP} per IP per ${WINDOW_MS / 60000} minutes, per instance`,
      allowed_origins: ORIGINS,
      /* Published so the two engines can be compared rather than assumed equal. The site runs
         ten rules; five of them can run from a profile alone, and these are those five under the
         same names. The other five need a product on screen or a basket, which this endpoint does
         not have and never should. */
      recommendation_rules: RULES,
      rules_needing_the_page: ['requires', 'cart_bundle', 'focus_cross_sell', 'cross_sell',
                               'upsell'],
    }, null, 1), { headers });
  }

  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  const { data: sub } = await db.from('dtelco_subscriber').select('*')
    .eq('contact_key', key).maybeSingle();
  if (!sub) {
    // Not an error. A visitor who registered on the site has no operator record, and saying so
    // is more useful than a 404 the page then has to interpret.
    return new Response(JSON.stringify({ contact_key: key, known_to_operator: false }),
      { headers });
  }

  const { data: usage } = await db.from('dtelco_usage').select('*')
    .eq('contact_key', key).order('period_start', { ascending: false }).limit(1);
  const u = usage?.[0] ?? null;

  const { data: plan } = await db.from('dtelco_product')
    .select('product_id, title, data_gb, minutes, sms, validity_days, discounted_price')
    .eq('product_id', sub.plan_id).maybeSingle();
  const { data: device } = sub.device_product_id
    ? await db.from('dtelco_product').select('product_id, title')
        .eq('product_id', sub.device_product_id).maybeSingle()
    : { data: null };

  const ratio = u && Number(u.data_cap_gb) > 0
    ? Number((Number(u.data_used_gb) / Number(u.data_cap_gb)).toFixed(3)) : null;

  /* How many lines share this address, which is not the same thing as family_lines. family_lines
     is how many this person is billed for; lines_at_address is how many exist there. The family
     rule is exactly the gap between the two, and v_dtelco_family_candidates computes it the same
     way: count over address_id, then family_lines = 1. Without it the site's family rule could
     never fire, because the page had no way to know the second number. */
  const { count: linesAtAddress } = await db.from('dtelco_subscriber')
    .select('contact_key', { count: 'exact', head: true }).eq('address_id', sub.address_id);

  /* Days until the contract ends, negative once it has. The upgrade segment uses sixty days, so
     the page can apply the same threshold rather than inventing its own. */
  const contractDays = sub.contract_end
    ? Math.round((new Date(String(sub.contract_end)).getTime() - Date.now()) / 86400000)
    : null;

  const profile: Record<string, unknown> = {
    contact_key: key,
    known_to_operator: true,
    msisdn: sub.msisdn,
    full_name: sub.full_name,
    city: sub.city,
    plan_id: sub.plan_id,
    plan_name: plan?.title ?? sub.plan_id,
    plan_type: sub.plan_type,
    lifecycle: sub.lifecycle,
    arpu_band: sub.arpu_band,
    esim: sub.esim,
    device_model: device?.title ?? null,
    device_product_id: sub.device_product_id,
    contract_end: sub.contract_end,
    family_lines: sub.family_lines,
    lines_at_address: linesAtAddress ?? null,
    contract_days: contractDays,
    preferred_store: sub.preferred_store,
    preferred_channel: sub.preferred_channel,
    data_cap_gb: u?.data_cap_gb ?? null,
    data_used_gb: u?.data_used_gb ?? null,
    data_ratio: ratio,
    balance: u?.balance ?? null,
    roaming_days: u?.roaming_days ?? null,
    plan_expires_on: u?.plan_expires_on ?? null,
    is_persona: sub.is_persona,
  };

  if (url.searchParams.get('reco') === '1') {
    profile.recommendations = await recommend(sub, ratio, linesAtAddress ?? null,
                                              Number(u?.roaming_days ?? 0));
  }
  return new Response(JSON.stringify(profile), { headers });
});

/* The same rules the web engine runs, in the same order, under the same names.
 *
 * That sentence used to be a comment above code that did none of it. The comment named requires,
 * usage upsell, focus cross sell, traveller, family and a popular fallback; the code ran an
 * upsell, a device cross sell, a traveller rule that fired for every active line, and a plan
 * cross sell, under two rule names the site has never heard of. So the app and the site could
 * recommend different products and label them differently, and the readout would have said so
 * out loud during a demonstration.
 *
 * Five of the site's ten rules can run here. The other five need page state this endpoint does
 * not have and never should: requires, cross_sell and upsell read the product on screen,
 * focus_cross_sell reads the product the visitor keeps returning to, and cart_bundle reads the
 * basket. Naming which five are absent, and why, is the point of listing them.
 */

async function recommend(sub: Record<string, unknown>, ratio: number | null,
                         linesAtAddress: number | null, roamingDays: number) {
  const out: { product_id: string; title: string; price: number; image_slug: string;
               rule: string; why: string }[] = [];
  const seen = new Set<string>();

  const push = async (ids: string[], rule: string, why: string) => {
    if (!ids.length || out.length >= 3) return;
    const { data } = await db.from('dtelco_product')
      .select('product_id, title, discounted_price, image_slug, stock_count, is_active')
      .in('product_id', ids);
    /* .in does not preserve the order of the ids, and the order is the recommendation. Walking
       the ids and looking each one up keeps the rank the relation table gave them. */
    const byId = new Map((data ?? []).map((p) => [p.product_id as string, p]));
    for (const id of ids) {
      const p = byId.get(id);
      if (!p || out.length >= 3 || seen.has(p.product_id)) continue;
      if (!p.is_active || (p.stock_count !== null && p.stock_count <= 0)) continue;
      seen.add(p.product_id);
      out.push({ product_id: p.product_id, title: p.title, price: Number(p.discounted_price),
                 image_slug: p.image_slug, rule, why });
    }
  };
  const related = async (from: string, relation: string) => {
    const { data } = await db.from('dtelco_product_relation')
      .select('to_product_id').eq('from_product_id', from).eq('relation', relation)
      .order('rank').limit(4);
    return (data ?? []).map((r) => r.to_product_id as string);
  };
  const inCategory = async (path: string, limit: number) => {
    const { data } = await db.from('dtelco_product').select('product_id')
      .eq('category_path', path).eq('is_active', true).order('product_id').limit(limit);
    return (data ?? []).map((p) => p.product_id as string);
  };

  /* requires is not here, and that is the parity rather than a gap. On the site it reads the
     product on screen: a tariff a visitor is looking at that needs an internet package. Running
     it here from the account's own plan would fill all three slots for a heavy user before
     usage_80 ever ran, so the one recommendation only a telco can make would never appear. */

  // 1. usage_80. Consumption, the one signal only a telco has.
  if (ratio !== null && ratio >= 0.8) {
    await push(await related(String(sub.plan_id), 'upsell'), 'usage_80',
      `you are at ${Math.round(ratio * 100)} percent of your data`);
  }

  /* 2. traveller. Roaming days actually recorded, not merely an active line. The old condition
        reads roaming days from the usage row rather than the subscriber row. Every
        working line in the base is active, so the second clause fired for everybody; and
        roaming_days is a column on dtelco_usage rather than on dtelco_subscriber, so the first
        clause read undefined and could never have fired on its own. The broad clause hid the
        broken one, which is why nobody noticed. It is passed in from the usage row now. */
  if (roamingDays > 0) {
    await push(await inCategory('Mobile>Roaming>Internet', 3), 'traveller', 'for the next trip');
  }

  // 3. family. More lines at the address than this person is billed for.
  if ((linesAtAddress ?? 1) >= 2 && Number(sub.family_lines ?? 1) === 1) {
    await push(await inCategory('Bundles>Family', 3), 'family',
      'more than one line at this address');
  }

  /* 4. alternative. The site reads this from the product on screen; here the nearest equivalent
        is the handset on the account, which is the one product this endpoint knows the visitor
        has in their hand. */
  if (sub.device_product_id) {
    await push(await related(String(sub.device_product_id), 'cross_sell'), 'alternative',
      'goes with the handset on your account');
  }

  // 5. popular. The fallback, so a profile with no signal still answers with something real.
  await push(await inCategory('Mobile>Plans>Prepaid GO', 4), 'popular',
    'what most people start on');
  return out;
}
