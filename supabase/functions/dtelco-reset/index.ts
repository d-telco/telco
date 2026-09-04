/* dtelco-reset: put the demonstration back to its opening state, and align it with today.
 *
 * A separate endpoint from the operator on purpose. It is the one call that undoes work, so it is
 * worth being able to see it in a log on its own, and worth not being able to reach it by
 * mistyping a signal name.
 *
 * It restores from dtelco_demo_snapshot, taken once from the seeded rows, so a reset is exact
 * rather than approximate. Rows the simulator created are cleared by the `simulated` flag on the
 * row. They used to be cleared by time, on the reasoning that every seeded row sits in the past,
 * and that reasoning stopped being true the moment the seeded dates started rolling forward.
 *
 * A GET reports what a reset would touch and how far the seeded data has drifted from today. A
 * POST performs the reset. A POST carrying { "roll": true } resets and then rolls the seeded dates
 * so the counts in handoff/SEGMENTS.md hold today. Roll is opt in rather than automatic: it moves
 * every date in the data set, and a call that does that should be asked for by name.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 10 * 60 * 1000, CAP = 20;
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

/* The numbers a presenter quotes. Read after a reset they are the opening state; read mid
 * rehearsal they show what has moved. Either way they come from the views themselves. */
const SEGMENTS = [
  'v_dtelco_heavy_on_small_plan', 'v_dtelco_low_balance_high_usage', 'v_dtelco_plan_expiring_7d',
  'v_dtelco_renewal_failed', 'v_dtelco_roamers_now', 'v_dtelco_frequent_travellers',
  'v_dtelco_dormant_30d', 'v_dtelco_churn_risk', 'v_dtelco_upgrade_eligible',
  'v_dtelco_family_candidates', 'v_dtelco_switchers_1m', 'v_dtelco_stock_waiters_with_stock',
  'v_dtelco_price_watchers', 'v_dtelco_fiber_checked_no_order',
];

async function counts() {
  const out: Record<string, number | null> = {};
  for (const v of SEGMENTS) {
    const { count } = await db.from(v).select('*', { count: 'exact', head: true });
    out[v.replace('v_dtelco_', '')] = count ?? null;
  }
  return out;
}

/* How far the seeded data has drifted from today. Seven of the fourteen views compare a seeded
   date against the calendar, so this number is the difference between the counts a presenter
   rehearsed and the counts the room will see. */
async function clock() {
  const { data } = await db.from('dtelco_clock').select('*').eq('id', 1).limit(1);
  const row = data?.[0];
  if (!row) return { anchor_date: null, days_behind: null, why: 'no anchor row' };
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(today + 'T00:00:00Z') - Date.parse(row.anchor_date + 'T00:00:00Z')) / 86400000);
  return {
    anchor_date: row.anchor_date,
    today,
    days_behind: days,
    rolled_days_total: row.rolled_days,
    rolled_at: row.rolled_at,
    aligned: days === 0,
    why: days === 0
      ? 'the seeded data represents today, so every count in handoff/SEGMENTS.md holds'
      : `the seeded data represents a day ${days} day(s) ago, so the seven calendar driven ` +
        'segments read differently from the document. POST { "roll": true } to align them.',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  if (req.method === 'GET') {
    const { count: snap } = await db.from('dtelco_demo_snapshot')
      .select('*', { count: 'exact', head: true });
    const { count: sim } = await db.from('dtelco_offline_event')
      .select('*', { count: 'exact', head: true }).eq('simulated', true);
    return new Response(JSON.stringify({
      function: 'dtelco-reset',
      post_to_reset: true,
      post_roll_true_to_align_dates: true,
      snapshot_rows: snap,
      simulator_rows_waiting: sim,
      restores: ['dtelco_product.stock_count', 'dtelco_product.discounted_price',
                 'dtelco_product_variant.stock_count', 'dtelco_product_variant.discounted_price',
                 'dtelco_usage.data_used_gb', 'dtelco_usage.balance', 'dtelco_usage.roaming_days'],
      clears: ['dtelco_offline_event where simulated', 'dtelco_ticket TCK-%-SIM',
               'dtelco_billing INV-%-SIM'],
      clock: await clock(),
      segments_now: await counts(),
    }, null, 1), { headers });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405, headers });

  let wantRoll = false;
  try {
    const body = await req.json();
    wantRoll = body?.roll === true;
  } catch { /* an empty body is a plain reset, which is the safe default */ }

  const { data: report, error } = await db.rpc('dtelco_reset_demo');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  /* Reset first, then roll. The other order would roll the simulator rows written this session,
     which mean now and should stay meaning now. */
  let roll = null;
  if (wantRoll) {
    const { data, error: rollError } = await db.rpc('dtelco_roll_dates');
    if (rollError) {
      return new Response(JSON.stringify({ ok: false, report, roll_error: rollError.message }),
        { status: 500, headers });
    }
    roll = data;
  }

  return new Response(JSON.stringify({
    ok: true, report, roll, clock: await clock(), segments_now: await counts(),
  }, null, 1), { headers });
});
