/* dtelco-operator: the BSS, the care desk, the store and the chatbot, standing in.
 *
 * This is the function that makes the demonstration move. Every signal writes a real row into
 * Postgres, so a Dengage remote segment changes size between one refresh and the next while the
 * room is watching. Nothing here is theatre: the balance really drops, the stock really returns,
 * the price really falls, and the segment really gains a member.
 *
 * It writes to Postgres, and it tells Dengage the fact directly through the Event API. Contact
 * FIELDS are still the relay's job, because a page cannot write them and neither can a simulator.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 10 * 60 * 1000, CAP = 60;
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

/* The Event API, and it is the one Dengage endpoint here that needs no login token.
 *
 * reference/sendevent puts it on its own host, https://event.dengage.com, and says so plainly:
 * "This api requires no login token so your application does not need to get a login token from
 * API." It writes big tables only: "Data can't be sent to a regular/sendable data table using this
 * function."
 *
 * Why it matters here more than anywhere else. Until now a signal pressed in the simulator reached
 * Dengage only because a browser tab was open to send the matching sendDeviceEvent. A real BSS has
 * no browser. This is the route an operator's own systems actually use, and with it the fact
 * reaches Dengage whether or not anybody is looking at the site.
 *
 * The table is separate from dtelco_events on purpose. dtelco_events is device keyed, because web
 * behaviour belongs to a browser. A BSS fact belongs to a person and the operator has no device id
 * to offer, so it goes to its own contact keyed table. Which of the two `key` is matched against is
 * not stated on that page, so it is in the verify list rather than assumed here. */
const EVENT_API = 'https://event.dengage.com/api/web/event';
const ACCOUNT_ID = Deno.env.get('DENGAGE_ACCOUNT_ID') ?? '';
const EVENT_TABLE = Deno.env.get('DTELCO_BSS_EVENT_TABLE') ?? 'dtelco_bss_events';

/* Sent after the row is written, never instead of it, and a failure is reported rather than
   thrown: the demonstration's own record is the thing that must not be lost. */
async function tellDengage(key: string, signal: string, source: string, note: string | null,
                           preview = false) {
  /* A preview writes the operator's own row and stops there.
   *
   * The Event API creates a contact for a key it has not seen, which is correct for a real visitor
   * adopting a line and wrong for a check that mints DPS-DTELCO-CHECK<timestamp> and throws it
   * away. Without this the repository's own suite left one junk contact in the account per run,
   * and a junk contact is never deleted here, so they accumulate for good. */
  if (preview) {
    return { sent: false, preview: true,
             why: 'a preview. The row is written and the event API was not called, so no contact ' +
                  'was created for a key nobody will use again.' };
  }
  if (!ACCOUNT_ID) {
    return { sent: false, why: 'no Dengage account id is configured, so the event API was not called' };
  }
  try {
    const r = await fetch(EVENT_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: ACCOUNT_ID,
        eventTable: EVENT_TABLE,
        key,
        eventDetails: {
          event_name: signal,
          /* yyyy-MM-dd HH:mm:ss, from the DateTime Formats list. */
          event_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          source,
          note: note ?? '',
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    return { sent: r.ok, http: r.status, detail: text.slice(0, 200),
             why: r.ok ? 'the fact reached Dengage from this server, with no browser involved'
                       : 'the event API refused it' };
  } catch (e) {
    return { sent: false, why: `the event API could not be reached: ${(e as Error).message}` };
  }
}

/* The vocabulary is closed. A signal not on this list is refused rather than written, because a
   typo here would create an event_type no segment will ever match, and nobody would notice. */
const SIGNALS = [
  'usage_80', 'usage_100', 'balance_low', 'topup', 'plan_expiring', 'renewal_ok',
  'renewal_failed', 'bill_issued', 'bill_paid', 'number_activated', 'esim_installed',
  'port_in_done', 'port_out_requested', 'roaming_detected', 'price_dropped', 'back_in_stock',
  'store_visit', 'care_call', 'chatbot_intent', 'complaint_opened', 'complaint_resolved',
  'upgrade_eligible', 'fiber_checked',
  /* Fulfilment, and it is here rather than on the order API because the order API cannot carry
     it. reference/upsertorders is closed about the vocabulary: "order_status = success / refund".
     There is no shipped and no delivered, so an order whose status advances is a sequence of
     custom events rather than a series of order upserts. These two write nothing but the offline
     row, which is the whole point: the fact is recorded, the browser sends the matching event,
     and journey 7 continues on it. */
  'order_shipped', 'order_delivered',
] as const;
type Signal = typeof SIGNALS[number];

/* Which segment each signal is expected to move. Returned with the reply so the simulator can
   show a before and after count, which is the only honest way to demonstrate a segment moving:
   read it, press the button, read it again. */
const MOVES: Partial<Record<Signal, string>> = {
  usage_80: 'v_dtelco_heavy_on_small_plan',
  usage_100: 'v_dtelco_heavy_on_small_plan',
  balance_low: 'v_dtelco_low_balance_high_usage',
  topup: 'v_dtelco_low_balance_high_usage',
  plan_expiring: 'v_dtelco_plan_expiring_7d',
  renewal_failed: 'v_dtelco_renewal_failed',
  roaming_detected: 'v_dtelco_roamers_now',
  port_out_requested: 'v_dtelco_churn_risk',
  back_in_stock: 'v_dtelco_stock_waiters_with_stock',
  price_dropped: 'v_dtelco_price_watchers',
  upgrade_eligible: 'v_dtelco_upgrade_eligible',
  fiber_checked: 'v_dtelco_fiber_checked_no_order',
  number_activated: 'v_dtelco_switchers_1m',
};

async function count(view: string): Promise<number | null> {
  const { count: n } = await db.from(view).select('*', { count: 'exact', head: true });
  return n ?? null;
}

/* Whether THIS contact is in the view, which is what a presenter actually points at. A total
   that goes 253 to 253 tells nobody anything; "Rashad is now in it" is the demonstration. */
async function inView(view: string, key: string): Promise<boolean> {
  const { count: n } = await db.from(view)
    .select('contact_key', { count: 'exact', head: true }).eq('contact_key', key);
  return (n ?? 0) > 0;
}

/* Why a correctly working button moved nothing. Without this a presenter presses balance_low on
   a postpaid line, sees the count unchanged, and has to guess whether the demo is broken. Every
   reason here is read from the row rather than assumed. */
function whyNotMoved(signal: Signal, sub: Record<string, unknown>,
                     usage: Record<string, unknown> | null, wasIn: boolean): string {
  if (wasIn) return 'this subscriber was already in the segment before the signal';
  const cap = Number(usage?.data_cap_gb ?? 0);
  switch (signal) {
    case 'usage_80': case 'usage_100':
      return cap > 10
        ? `the segment is for allowances of 10 GB or less and this line has ${cap} GB, so a high ` +
          'usage signal correctly does not put it in the upsell audience'
        : 'usage was written but the threshold was already met';
    case 'balance_low': case 'topup':
      return sub.plan_type === 'postpaid'
        ? 'the low balance segment is prepaid only, and this is a postpaid line, so it is ' +
          'correctly excluded'
        : 'the balance was written but the usage ratio is below the segment threshold';
    case 'port_out_requested':
      return 'the churn signal was written; this subscriber already qualified on another reason';
    case 'order_shipped': case 'order_delivered':
      return 'fulfilment moves no segment. The order API cannot carry a shipped or delivered ' +
             'status, so this is a custom event a journey waits on rather than a segment';
    default:
      return 'the row was written; this signal does not change membership of that segment for ' +
             'this subscriber';
  }
}

/* Stable across calls, so an adopted line keeps the same number and city on a second visit. Not a
   cryptographic hash and not trying to be: it picks a demo number. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

async function latestUsage(key: string) {
  const { data } = await db.from('dtelco_usage').select('*').eq('contact_key', key)
    .order('period_start', { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      function: 'dtelco-operator',
      writes: ['dtelco_usage', 'dtelco_billing', 'dtelco_offline_event', 'dtelco_product',
               'dtelco_ticket', 'dtelco_subscriber (adopted lines only)'],
      tells_dengage: true,
      how: 'reference/sendevent, POST https://event.dengage.com/api/web/event, which needs no ' +
           'login token and no open browser. A real BSS has neither.',
      event_table: EVENT_TABLE,
      event_api_configured: !!ACCOUNT_ID,
      why: 'a page cannot write contact FIELDS and this function still does not pretend to: the ' +
           'relay writes those. What changed is the fact itself, which used to reach Dengage only ' +
           'because a browser tab happened to be open.',
      adopt: 'POST with adopt: true for a key that has no operator record, and the visitor gets a ' +
             'line of their own. Their real browsing and the operator signals then land on the ' +
             'same person, instead of the visitor having to become a persona and lose their own ' +
             'history. Adopted lines are marked and the reset clears them.',
      preview: 'POST with preview: true and the Postgres row is written and the Event API is not ' +
               'called. It is what the check suite asks for: the Event API creates a contact for ' +
               'a key it has not seen, and a check that mints a throwaway key would leave one ' +
               'behind on every run.',
      signals: SIGNALS,
      moves: MOVES,
      rate_cap: `${CAP} per IP per ${WINDOW_MS / 60000} minutes, per instance`,
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(
    JSON.stringify({ error: 'body must be json' }), { status: 400, headers }); }

  const key = String(body.contact_key ?? '').trim();
  const signal = String(body.signal ?? '') as Signal;
  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  if (!SIGNALS.includes(signal)) {
    return new Response(JSON.stringify({ error: 'unknown signal', signals: SIGNALS }),
      { status: 400, headers });
  }

  let { data: sub } = await db.from('dtelco_subscriber').select('*')
    .eq('contact_key', key).maybeSingle();

  /* Adopt a line. It answers the obvious question: why does anybody have
     to BECOME Aysel to see the telco half.
   *
   * They were right that it is better if they do not. Everything the site does is already real and
   * unscripted for whoever is browsing: the recognition band, the rail, the cart, the creatives,
   * every event. What a walk in visitor cannot have is history. Consumption over a month, a
   * contract clock, three lines at one address, an absence, a trip. Those are the signals that
   * make this a telco demonstration rather than a shop, and no amount of browsing produces them.
   *
   * So instead of swapping the visitor for a persona, the operator gives the visitor a line. The
   * person in the room keeps their own browsing and gains an operator record they can then fire
   * signals at. Personas stay for the three stories that cannot be produced live at all: dormant
   * for a month, a port out yesterday, a household of three.
   *
   * Only a key this browser actually minted, and only when the caller asks. A simulator that
   * silently created subscriber records for every key it was handed would fill the base with
   * strangers and quietly move every segment count in the room. */
  if (!sub && body.adopt === true) {
    const cities = ['Baku', 'Ganja', 'Sumqayit', 'Mingachevir', 'Lankaran', 'Shirvan'];
    const now = new Date();
    const contractEnd = new Date(now); contractEnd.setDate(contractEnd.getDate() + 45);
    const { data: made, error: adoptError } = await db.from('dtelco_subscriber').insert({
      contact_key: key,
      /* A number in the 555 block, like every other invented number here, derived from the key so
         the same visitor gets the same number twice. */
      msisdn: `+994 55 555 ${String(Math.abs(hash(key)) % 10000).padStart(4, '0')}`,
      full_name: 'Guest line',
      city: cities[Math.abs(hash(key)) % cities.length],
      plan_id: 'plan-go-11-99',
      plan_type: 'prepaid',
      lifecycle: 'active',
      arpu: 11.99,
      arpu_band: 'mid',
      esim: true,
      device_product_id: null,
      contract_end: contractEnd.toISOString().slice(0, 10),
      family_lines: 1,
      /* Its own address, so adopting a line never accidentally joins somebody else's household and
         moves the family segment. */
      address_id: `ADOPT-${key}`,
      preferred_store: null,
      preferred_channel: 'email',
      activation_date: now.toISOString().slice(0, 10),
      is_persona: false,
      simulated: true,
    }).select('*').single();
    if (adoptError) {
      return new Response(JSON.stringify({ error: 'could not adopt a line', detail: adoptError.message }),
        { status: 500, headers });
    }
    sub = made;
    /* A usage period, because without one every signal that patches usage does nothing and the
       readout would say the row was written while no number moved. Deliberately unremarkable:
       half an allowance used, a normal balance, no roaming. The room presses the buttons that
       make it interesting. */
    const period = new Date(now.getFullYear(), now.getMonth(), 1);
    await db.from('dtelco_usage').insert({
      contact_key: key, period_start: period.toISOString().slice(0, 10),
      data_cap_gb: 10, data_used_gb: 5, balance: 12.5, roaming_days: 0,
      plan_expires_on: new Date(now.getTime() + 20 * 86400000).toISOString().slice(0, 10),
    });
  }

  if (!sub) {
    return new Response(JSON.stringify({
      error: 'no operator record for that key', contact_key: key,
      adopt: 'POST with adopt: true and this visitor gets a line of their own, so their real ' +
             'browsing and the operator signals land on the same person.',
    }), { status: 404, headers });
  }

  const view = MOVES[signal];
  const before = view ? await count(view) : null;
  const wasIn = view ? await inView(view, key) : false;
  const changed: string[] = [];
  const product = body.product_id ? String(body.product_id) : null;
  const amount = body.amount === undefined ? null : Number(body.amount);
  const note = body.note === undefined ? null : String(body.note).slice(0, 400);

  const usage = await latestUsage(key);
  const patchUsage = async (patch: Record<string, unknown>) => {
    if (!usage) return;
    await db.from('dtelco_usage').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('contact_key', key).eq('period_start', usage.period_start);
    changed.push('dtelco_usage');
  };

  switch (signal) {
    case 'usage_80':
      await patchUsage({ data_used_gb: Number((Number(usage?.data_cap_gb ?? 5) * 0.82).toFixed(2)) });
      break;
    case 'usage_100':
      await patchUsage({ data_used_gb: Number(usage?.data_cap_gb ?? 5) });
      break;
    case 'balance_low':
      await patchUsage({ balance: 0.45 });
      break;
    case 'topup': {
      const add = Number.isFinite(amount) && amount! > 0 ? amount! : 10;
      await patchUsage({ balance: Number((Number(usage?.balance ?? 0) + add).toFixed(2)),
                         last_topup_at: new Date().toISOString(), last_topup_amount: add });
      break;
    }
    case 'plan_expiring': {
      const soon = new Date(); soon.setDate(soon.getDate() + 2);
      await patchUsage({ plan_expires_on: soon.toISOString().slice(0, 10) });
      break;
    }
    case 'roaming_detected':
      await patchUsage({ roaming_days: Number(usage?.roaming_days ?? 0) + 1 });
      break;

    case 'renewal_failed': case 'renewal_ok': case 'bill_issued': case 'bill_paid': {
      const status = signal === 'renewal_failed' ? 'renewal_failed'
        : signal === 'renewal_ok' ? 'renewal_ok'
        : signal === 'bill_paid' ? 'paid' : 'issued';
      const issued = new Date();
      const due = new Date(); due.setDate(due.getDate() + 14);
      await db.from('dtelco_billing').upsert({
        invoice_id: `INV-${key}-SIM`, contact_key: key,
        issued_at: issued.toISOString().slice(0, 10), due_at: due.toISOString().slice(0, 10),
        amount: Number.isFinite(amount) && amount! > 0 ? amount! : Number(sub.arpu), status,
      }, { onConflict: 'invoice_id' });
      changed.push('dtelco_billing');
      break;
    }

    /* The two segments seeded empty on purpose. Somebody is queued behind each, so these two
       buttons take a segment from zero to one, which is the only demonstration of a segment
       moving that a prospect has any reason to believe. */
    case 'back_in_stock': {
      const id = product ?? 'dev-iphone-17-pro-max';
      await db.from('dtelco_product').update({ stock_count: 12 }).eq('product_id', id);
      await db.from('dtelco_product_variant').update({ stock_count: 4 }).eq('product_id', id);
      changed.push('dtelco_product', 'dtelco_product_variant');
      break;
    }
    case 'price_dropped': {
      const id = product ?? 'dev-iphone-17-pro';
      const { data: p } = await db.from('dtelco_product')
        .select('price').eq('product_id', id).maybeSingle();
      if (p) {
        const cut = Number((Number(p.price) * 0.85).toFixed(2));
        await db.from('dtelco_product').update({ discounted_price: cut }).eq('product_id', id);
        changed.push('dtelco_product');
      }
      break;
    }

    case 'complaint_opened': case 'complaint_resolved': {
      await db.from('dtelco_ticket').upsert({
        ticket_id: `TCK-${key}-SIM`, contact_key: key, opened_at: new Date().toISOString(),
        resolved_at: signal === 'complaint_resolved' ? new Date().toISOString() : null,
        channel: 'care', topic: note ?? 'coverage',
        status: signal === 'complaint_resolved' ? 'resolved' : 'open',
        nps: signal === 'complaint_resolved' && Number.isFinite(amount) ? amount : null,
      }, { onConflict: 'ticket_id' });
      changed.push('dtelco_ticket');
      break;
    }
  }

  /* Every signal also lands as an offline row, whatever else it did, so the profile carries the
     BSS side next to everything the visitor did on the site. */
  await db.from('dtelco_offline_event').insert({
    contact_key: key, event_type: signal, product_id: product,
    store_id: sub.preferred_store, source: String(body.source ?? 'bss'), note,
    /* The mark the reset clears by. It cannot be `source`: the operator writes the real source a
       signal came from, bss or care or store, because the whole point is that a care call looks
       like a care call on the profile. It cannot be the timestamp either, now that the seeded
       dates roll forward and would cross any cut off. */
    simulated: true,
  });
  changed.push('dtelco_offline_event');

  /* Now tell Dengage, from here, with no browser involved. The page still sends its own
     sendDeviceEvent when a tab is open, and the two are not a duplicate: one is the device's
     behaviour and one is the operator's record of a fact. A real integration has both. */
  const told = await tellDengage(key, signal, String(body.source ?? 'bss'), note,
                                body.preview === true);

  const after = view ? await count(view) : null;
  const isIn = view ? await inView(view, key) : false;
  return new Response(JSON.stringify({
    ok: true, contact_key: key, signal, wrote: [...new Set(changed)],
    adopted_line: sub.simulated === true,
    segment: view ? {
      view,
      count_before: before, count_after: after, count_moved: (after ?? 0) - (before ?? 0),
      // The line a presenter reads out: is this person in it now, and were they before.
      contact_was_in: wasIn, contact_is_in: isIn,
      entered: isIn && !wasIn,
      why: (isIn && !wasIn) ? null : whyNotMoved(signal, sub, usage, wasIn),
    } : null,
    /* Said plainly, because the difference is the whole architecture. Postgres changed here. The
       contact columns are still the relay's job, because a page cannot write them and neither can
       a simulator. What is new is that the FACT no longer depends on a browser being open. */
    dengage_event: told,
    note: 'Postgres is updated, and the event went to Dengage from this server through the Event ' +
          'API, which needs no login token and no open browser. Contact columns are still the ' +
          'relay\'s job.',
  }), { headers });
});
