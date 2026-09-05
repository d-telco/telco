/* dtelco-games: the record and the coupon pocket behind the site's gamification stand ins.
 *
 * The wheel, the scratch card and the countdown are drawn by the site while the panel's
 * Gamification templates await enabling (ACCOUNT-SETUP.md confirm item 21). The surfaces are the
 * site's; the facts are real, and this function is where they land.
 *
 * A win is a row. POST records it in dtelco_game_win: which game, where, what prize. The site
 * also reports the same win through the creative engine as a creative_action event, so the
 * platform's event table carries it too.
 *
 * No coupon code ever travels here, and that is the platform's design rather than this build's
 * caution, measured 5 September 2026 at the account owner's own challenge: GET
 * /contents/coupon-list/{id}/coupons lists every coupon with the code masked by the API itself,
 * ****69, and no assignment call exists under any plausible spelling, six tried, all 404. A full
 * code exists only inside a message the platform sends, the email coupon tag or the gamification
 * template, which is also the moment it is marked taken. So a win here records the fact, the
 * site shows the list read live, and the code arrives with the served surface.
 * dtelco_coupon_pocket was created for a hand filled fallback and retired the same day, before
 * ever holding a row, when that measurement settled the question. Nothing is deleted, so the
 * empty table stands, referenced by nothing.
 *
 * Idempotence is not wanted here: two spins are two wins. The rate cap is the guard.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;
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

/* The two games that can win. The countdown never posts here: urgency has no prize row. */
const GAMES = ['spin_wheel', 'scratch_card'];

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'GET') {
    const { count: wins } = await db.from('dtelco_game_win')
      .select('id', { count: 'exact', head: true });
    return new Response(JSON.stringify({
      function: 'dtelco-games',
      does: 'POST { contact_key, game, placement, prize } records one win',
      games: GAMES,
      wins_recorded: wins ?? 0,
      coupon_codes: 'never handled here, and never duplicated anywhere. Measured 5 September ' +
                    '2026: the API masks every code on read and offers no assignment call, so a ' +
                    'full code exists only inside a message the platform sends, where it is ' +
                    'also marked taken. The win shows the account\'s list read live; the served ' +
                    'Gamification template is what hands the code out.',
      note: 'the surfaces are stand ins for the panel Gamification templates, confirm item 21. ' +
            'Every win is also a creative_action row in the platform\'s own event table.',
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
  const game = String(body.game ?? '');
  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key refused: shape' }),
      { status: 400, headers });
  }
  if (!GAMES.includes(game)) {
    return new Response(JSON.stringify({ error: 'unknown game', games: GAMES }),
      { status: 400, headers });
  }
  const prize = String(body.prize ?? '').slice(0, 80).trim();
  if (!prize) {
    return new Response(JSON.stringify({ error: 'a win names its prize' }),
      { status: 400, headers });
  }

  /* The row carries no code, ever. See the header: the platform masks codes on read and offers
     no assignment call, so a code reaches a winner only inside the message the platform sends. */
  const { data: win, error } = await db.from('dtelco_game_win').insert({
    contact_key: key,
    game,
    placement: String(body.placement ?? '').slice(0, 40) || null,
    prize,
    coupon_code: null,
    simulated: true,
  }).select('id').single();
  if (error) {
    return new Response(JSON.stringify({ error: 'could not record the win', detail: error.message }),
      { status: 500, headers });
  }

  return new Response(JSON.stringify({
    ok: true,
    win_id: win.id,
    game,
    prize,
    note: 'recorded. When the prize carries a coupon, the code is issued by the platform inside ' +
          'the message it sends, the served gamification template or the coupon tag on a journey ' +
          'email, and marked taken at that same moment. Nothing here pretends otherwise.',
  }, null, 1), { headers });
});
