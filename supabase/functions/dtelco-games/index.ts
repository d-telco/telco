/* dtelco-games: the record and the coupon pocket behind the site's gamification stand ins.
 *
 * The wheel, the scratch card and the countdown are drawn by the site while the panel's
 * Gamification templates await enabling (ACCOUNT-SETUP.md confirm item 21). The surfaces are the
 * site's; the facts are real, and this function is where they land.
 *
 * A win is a row. POST records it in dtelco_game_win: which game, where, what prize, and for a
 * coupon backed prize, which code went with it. The site also reports the same win through the
 * creative engine as a creative_action event, so the platform's event table carries it too.
 *
 * The code is never minted. dtelco-coupons only reads the account's list, and inventing a
 * DTELCO- shaped string here would hand a visitor a coupon that exists nowhere. So codes come
 * from dtelco_coupon_pocket, a table the account owner fills with real codes taken from the
 * panel's own list. Pocket empty means the win says so and shows the live list instead, which is
 * the honest state until the served template starts issuing codes of its own.
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
    const [{ count: free }, { count: used }, { count: wins }] = await Promise.all([
      db.from('dtelco_coupon_pocket').select('code', { count: 'exact', head: true })
        .is('used_by', null),
      db.from('dtelco_coupon_pocket').select('code', { count: 'exact', head: true })
        .not('used_by', 'is', null),
      db.from('dtelco_game_win').select('id', { count: 'exact', head: true }),
    ]);
    return new Response(JSON.stringify({
      function: 'dtelco-games',
      does: 'POST { contact_key, game, placement, prize, coupon } records one win and, for a ' +
            'coupon backed prize, hands out a code from the pocket',
      games: GAMES,
      pocket_available: free ?? 0,
      pocket_used: used ?? 0,
      wins_recorded: wins ?? 0,
      why_a_pocket: 'dtelco-coupons only reads the account\'s list and nothing here mints a ' +
                    'code. The pocket holds real codes the account owner took from the panel\'s ' +
                    'own list, so a handed out code exists and the checkout recognises it. ' +
                    'Empty pocket, honest answer: the win shows the live list and says the ' +
                    'served Gamification template is what issues codes of your own.',
      fill_it: 'insert real codes from the panel list into dtelco_coupon_pocket. Only platform ' +
               'issued codes belong there.',
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

  /* A code only for a coupon backed prize, and only one the platform issued. The two step
     update guards the race two simultaneous wins would run: the second update matches no row
     and that win goes codeless, which is correct rather than shared. */
  let code: string | null = null;
  if (body.coupon === true) {
    const { data: candidate } = await db.from('dtelco_coupon_pocket')
      .select('code').is('used_by', null).order('code').limit(1).maybeSingle();
    if (candidate?.code) {
      const { data: taken } = await db.from('dtelco_coupon_pocket')
        .update({ used_by: key, used_at: new Date().toISOString() })
        .eq('code', candidate.code).is('used_by', null).select('code');
      if (taken?.length) code = candidate.code;
    }
  }

  const { data: win, error } = await db.from('dtelco_game_win').insert({
    contact_key: key,
    game,
    placement: String(body.placement ?? '').slice(0, 40) || null,
    prize,
    coupon_code: code,
    simulated: true,
  }).select('id').single();
  if (error) {
    return new Response(JSON.stringify({ error: 'could not record the win', detail: error.message }),
      { status: 500, headers });
  }

  const { count: left } = await db.from('dtelco_coupon_pocket')
    .select('code', { count: 'exact', head: true }).is('used_by', null);

  return new Response(JSON.stringify({
    ok: true,
    win_id: win.id,
    game,
    prize,
    code,
    pocket_left: left ?? 0,
    note: code
      ? 'a real code from the pocket, issued by the platform before it got here. The checkout ' +
        'recognises its shape.'
      : body.coupon === true
        ? 'the pocket is empty, so no code travelled. The live list is what the visitor is ' +
          'shown, and the served Gamification template is what issues codes of your own.'
        : 'not a coupon prize, so no code was ever in question.',
  }, null, 1), { headers });
});
