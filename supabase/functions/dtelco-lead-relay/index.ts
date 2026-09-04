/* dtelco-lead-relay: the backend a page cannot be.
 *
 * A page cannot write contact fields. Dengage takes contact writes over REST from an allowlisted
 * IP, with a credential no public page may hold, so every typed lead, every saved product and
 * every recognition crossing arrives here and this calls Dengage.
 *
 * The order is the whole point and it is not negotiable: the row is stored in Postgres FIRST, then
 * Dengage is called, then the answer is written back onto the row. An HTTP 200 from a marketing
 * platform means the request was accepted, not that a contact was created, and the only artifact
 * that can tell those apart afterwards is a row that recorded which one happened. A relay that
 * called Dengage first and stored second would lose exactly the leads it most needed to explain.
 *
 * Until an API user exists the row still lands, the side effects still run, and dengage_status
 * reads "pending api user". Nothing about the demonstration waits on the credential except the
 * contact write itself.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 60 * 1000, CAP = 30;          // 30 requests per second per IP is Dengage's cap;
const hits = new Map<string, number[]>();       // a minute of headroom is plenty for a demo

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

/* The closed vocabulary of forms. A typo here would store a row no segment will ever match and
   nobody would notice, which is the same reason the operator's signal list is closed. */
const FORMS = ['checkout', 'register', 'newsletter', 'nps', 'fiber_check', 'wishlist',
               'recognition', 'recommendation'] as const;
type Form = typeof FORMS[number];

/* The four Dengage wishlist list names, exactly. A fifth would be unsegmentable on their side. */
const LISTS = ['favorites', 'shopping_list', 'price_drop_alert', 'back_in_stock_alert'];

/* ---------------------------------------------------------------- Dengage */

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

/* Cached until a minute before it expires. Logging in before every call is wrong per Dengage's
   own guidance and burns the rate cap on nothing. */
let token: { value: string; until: number } | null = null;

async function login(): Promise<string | null> {
  if (!USERKEY || !PASSWORD) return null;
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userkey: USERKEY, password: PASSWORD }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  const body = await r.json();
  if (!body?.access_token) return null;
  token = { value: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return token.value;
}

/* The columns Decision 17 confirmed, plus consent and the recommendation columns. Only the ones
   with a value travel: sending an empty string would overwrite a good value with nothing. */
async function upsertContact(row: Record<string, unknown>) {
  const bearer = await login();
  if (!bearer) return { status: 'pending api user', detail: 'no API user configured yet' };

  const columns = Object.keys(row);
  const r = await fetch(`${API}/bulk/contacts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ columns, contactDatas: [row] }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  if (!r.ok) {
    /* An API user without a permission answers 403 with an empty body, which reads as a network
       fault unless it is named. */
    return { status: `error HTTP ${r.status}`,
             detail: text || (r.status === 403 ? 'empty body: the API user lacks the permission' : '') };
  }
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* a 200 with an unparseable body is still a refusal */ }
  /* Results sit under `data`, not at the top level, and `data` is an OBJECT carrying four arrays:
     errors, inserted, updated and warnings, each holding contact keys. The first version of this
     read data as an array and probed a first element for an `inserted` flag, which the endpoint
     never returns. Confirmed against reference/updatecontactsbulk. */
  const results = (parsed as { data?: { inserted?: string[]; updated?: string[] } })?.data;
  if (!results) return { status: 'rejected', detail: text.slice(0, 400) };
  const inserted = (results.inserted ?? []).length > 0;
  return { status: inserted ? 'contact inserted' : 'contact updated',
           detail: JSON.stringify(results).slice(0, 400) };
}

/* ---------------------------------------------------------------- server side truth */

/* Every product value is derived here from the id. A page that passed a title and a price could
   pass any title and any price, and the row would record whatever it was told. */
async function productFacts(productId: string | null) {
  if (!productId) return null;
  const { data } = await db.from('dtelco_product')
    .select('product_id, title, brand, category_path, price, discounted_price, stock_count')
    .eq('product_id', productId).maybeSingle();
  return data ?? null;
}

async function isSubscriber(key: string) {
  const { count } = await db.from('dtelco_subscriber')
    .select('contact_key', { count: 'exact', head: true }).eq('contact_key', key);
  return (count ?? 0) > 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      function: 'dtelco-lead-relay',
      forms: FORMS,
      writes: ['dtelco_web_lead', 'dtelco_watch', 'dtelco_offline_event', 'dtelco_reco'],
      calls_dengage: '/login then /bulk/contacts',
      dengage_configured: !!(USERKEY && PASSWORD),
      datacenter: DC,
      order: 'the row is stored before Dengage is called, and the answer is written back onto it',
      why: 'an HTTP 200 means accepted, not created. The row is the only artifact that can tell ' +
           'those apart afterwards.',
      recommendations: 'ids only, and by two routes. On the contact, read by $Contact and $from ' +
                       'on any marketing channel except push. And into dtelco_reco, which ' +
                       'dtelco-dataspace syncs to a Dengage send list table, where the same ids ' +
                       'arrive as $Current on every channel including push. A transactional send ' +
                       'reads neither: it cannot see a contact column at all.',
      whatsapp_permission: 'a custom column, not a platform permission. /bulk/contacts documents ' +
                           'email_permission and gsm_permission and no third. WhatsApp consent is ' +
                           'a condition a journey or segment reads, not a suppression the ' +
                           'platform enforces.',
      rate_cap: `${CAP} per IP per ${WINDOW_MS / 1000} seconds, per instance`,
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
  const form = String(body.form ?? '') as Form;
  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  if (!FORMS.includes(form)) {
    return new Response(JSON.stringify({ error: 'unknown form', forms: FORMS }),
      { status: 400, headers });
  }

  const str = (v: unknown, max = 200) =>
    v === undefined || v === null || v === '' ? null : String(v).slice(0, max);
  const productId = str(body.product_id, 120);
  const product = await productFacts(productId);

  /* 1. Store first. Everything after this can fail and the lead is still on record. */
  const lead = {
    contact_key: key,
    form,
    username: str(body.username, 80),
    name: str(body.name, 120),
    surname: str(body.surname, 120),
    email: str(body.email, 200),
    gsm: str(body.gsm, 40),
    city: str(body.city, 80),
    product_id: product?.product_id ?? null,
    page_url: str(body.page_url, 400),
    utm_source: str(body.utm_source, 80),
    utm_medium: str(body.utm_medium, 80),
    utm_campaign: str(body.utm_campaign, 120),
    marketing_consent: body.marketing_consent !== false,
    sms_consent: body.sms_consent !== false,
    whatsapp_consent: body.whatsapp_consent !== false,
    dengage_status: 'received',
  };
  const { data: stored, error: storeError } = await db.from('dtelco_web_lead')
    .insert(lead).select('id').single();
  if (storeError) {
    return new Response(JSON.stringify({ error: 'could not store the lead', detail: storeError.message }),
      { status: 500, headers });
  }
  const leadId = stored.id;
  const side: string[] = [];
  const notes: string[] = [];

  /* 2. The side effects a remote view needs, because a view cannot see inside Dengage. */
  if (form === 'wishlist') {
    const list = String(body.watch_list ?? '');
    if (!LISTS.includes(list)) {
      notes.push(`watch_list ${list || 'missing'} is not one of the four Dengage list names, so no watch row`);
    } else if (!product) {
      notes.push('no product matched that id, so no watch row');
    } else {
      /* Marked as a demonstration's own row, so the reset clears it and the next rehearsal starts
         with the two empty segments actually empty. A watch saved on Tuesday and still there on
         Wednesday means the segment that is meant to move from zero to one starts at one. */
      await db.from('dtelco_watch').upsert(
        { contact_key: key, product_id: product.product_id, list_name: list, simulated: true },
        { onConflict: 'contact_key,product_id,list_name' });
      side.push('dtelco_watch');
    }
  }

  if (form === 'fiber_check') {
    /* The convergence segment reads offline events, so a check done on the site has to land there
       too or the audience never sees it. The foreign key means only a real subscriber can carry
       one: an anonymous minted key has no operator record, and saying so is better than a 500. */
    if (await isSubscriber(key)) {
      await db.from('dtelco_offline_event').insert({
        contact_key: key, event_type: 'fiber_checked', source: 'web',
        note: str(body.city, 40), simulated: true,
      });
      side.push('dtelco_offline_event');
    } else {
      notes.push('no operator record for this key, so the check is on the lead row only. ' +
                 'The convergence segment reads subscribers.');
    }
  }

  /* 3. The contact write. Only values that exist travel: an empty string would overwrite a good
     value with nothing, and a transactional message would then print the nothing. */
  const contact: Record<string, unknown> = { contact_key: key };
  const put = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== '') contact[k] = v; };
  put('name', lead.name);
  put('surname', lead.surname);
  put('email', lead.email);
  put('gsm', lead.gsm);
  put('city', lead.city);
  contact.email_permission = lead.marketing_consent;
  contact.gsm_permission = lead.sms_consent;
  /* WhatsApp consent is a custom column, and that is a statement about Dengage rather than a
     shortcut. reference/updatecontactsbulk documents exactly two permission columns on
     master_contact, email_permission and gsm_permission. There is no WhatsApp permission, so a
     WhatsApp consent collected on a form is a value the operator's own compliance holds and a
     journey or segment reads as a condition. It is not a platform level suppression, and saying
     so is better than letting a room assume it is. */
  contact.whatsapp_consent = lead.whatsapp_consent;

  if (form === 'nps') {
    const nps = Number(body.nps);
    if (Number.isFinite(nps) && nps >= 0 && nps <= 10) put('last_nps', nps);
  }
  if (form === 'recognition' && product) {
    put('focus_product_id', product.product_id);
    put('focus_product_title', product.title);
    put('focus_product_brand', product.brand);
    put('focus_product_category', product.category_path);
    /* Derived here, never taken from the page: the price the visitor is shown and the price the
       email quotes have to be the same number and only one of them can be authoritative. */
    put('focus_product_price', product.discounted_price ?? product.price);
    const views = Number(body.views);
    if (Number.isFinite(views)) put('focus_views', views);
  }
  if (form === 'wishlist' && product) {
    put('last_watch_product_id', product.product_id);
    put('last_watch_list', str(body.watch_list, 40));
  }

  /* The three products the site showed, so a marketing message prints the same three.
     Ids only, by decision: a transactional send cannot read a contact column at all, so
     recommendations travel by email, WhatsApp, onsite and in app, where dynamic content resolves
     each id against the product table.

     Every id is checked against dtelco_product before it is written. An id that no longer resolves
     is dropped rather than stored, because a contact column holding a dead id makes a message print
     an empty product box, and an empty box is worse than a shorter rail.

     This form was missing from the vocabulary above until today. The site had been posting it since
     the engine was written, the relay had been answering 400 unknown form, and the browser was
     swallowing the refusal, so the account page promised a prospect that these ids were written and
     they never were. */
  if (form === 'recommendation') {
    const ids = ['1', '2', '3']
      .map((n) => str(body[`reco_product_id_${n}`], 120))
      .filter((id): id is string => !!id);
    const { data: known } = await db.from('dtelco_product')
      .select('product_id').in('product_id', ids.length ? ids : ['__none__']);
    const resolves = new Set((known ?? []).map((r) => r.product_id));
    let slot = 0;
    for (const id of ids) {
      if (!resolves.has(id)) {
        notes.push(`${id} is not in the catalogue, so it was not written to the contact`);
        continue;
      }
      slot += 1;
      put(`reco_product_id_${slot}`, id);
    }
    put('reco_rule', str(body.reco_rule, 60));
    put('reco_at', str(body.reco_at, 40));
    if (slot === 0) notes.push('no recommended id resolved, so no reco column was written');

    /* The same three ids into Postgres, which is a second place on purpose rather than by
       accident. The contact columns above are read by $Contact and $from, and that route cannot
       reach a push: reference/advanced-personalization says $Contact "can be null in Push sends".
       The documented way round it is a send list, and its own worked example is titled "Product
       Recommendations from a Send List". dtelco-dataspace pushes these rows into a Dengage table
       a campaign then selects as its audience, where the ids arrive as $Current with no caveat on
       any channel. One engine, one set of ids, two routes, and the second exists for exactly one
       channel the first cannot serve. */
    const resolved = ids.filter((id) => resolves.has(id));
    if (resolved.length) {
      await db.from('dtelco_reco').upsert({
        contact_key: key,
        reco_product_id_1: resolved[0] ?? null,
        reco_product_id_2: resolved[1] ?? null,
        reco_product_id_3: resolved[2] ?? null,
        reco_rule: str(body.reco_rule, 60),
        reco_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        /* Cleared by the reset, like every other row this demonstration creates. */
        simulated: true,
        /* Cleared because the row changed: a synced_at left behind would say Dengage holds three
           ids it has never been sent. */
        synced_at: null,
        sync_detail: null,
      }, { onConflict: 'contact_key' });
      side.push('dtelco_reco');
    }
  }

  const answer = await upsertContact(contact);

  /* 4. Write the answer back. A row left at "received" is a row that cannot tell you whether the
     contact exists, which is the one question it was created to answer. */
  await db.from('dtelco_web_lead')
    .update({ dengage_status: answer.status, dengage_detail: answer.detail?.slice(0, 1000) ?? null })
    .eq('id', leadId);

  return new Response(JSON.stringify({
    ok: true,
    lead_id: leadId,
    form,
    contact_key: key,
    dengage_status: answer.status,
    columns_sent: Object.keys(contact),
    also_wrote: side,
    notes,
    /* Said plainly because a green send is the thing a demonstration must never rely on. */
    note: 'The row was stored before Dengage was called and now records what Dengage answered.',
  }, null, 1), { headers });
});
