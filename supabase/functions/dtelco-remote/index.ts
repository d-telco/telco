/* dtelco-remote: the database as the reporting role sees it.
 *
 * Edge functions read Postgres as the service role, which bypasses RLS and holds every grant. The
 * platform connects as dengage_reader instead, and a view resolves for that role only when the
 * role can select every relation the view reads. A view that reads a table the role has no grant
 * on returns rows for one connection and an error for the other.
 *
 * So this endpoint reads the catalogue the way the reporting role reads it, and reports two things:
 *
 *   views    every v_dtelco_ view: does it resolve for dengage_reader, and what blocks it
 *   surface  every dtelco object and whether that role can select it, which is what the remote
 *            source picker offers
 *
 * The surface half holds the rule that remote tables relate to master_contact or master_device and
 * that reference tables about products or places are never offered. That holds because the
 * migrations do not grant them, and one convenience grant would change it silently.
 *
 * It reads. It writes nothing, and the two functions behind it run catalogue queries only.
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

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* The reference tables, named here so the answer says which rule a grant would break rather than
   only that something changed. Products and places. */
const REFERENCE = new Set([
  'dtelco_product', 'dtelco_product_variant', 'dtelco_product_relation',
  'dtelco_bundle_item', 'dtelco_store',
]);

async function rpc(name: string): Promise<unknown[] | { error: string }> {
  if (!URL_ || !KEY) return { error: 'the database is not configured for this function' };
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: KEY, authorization: `Bearer ${KEY}` },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    if (!r.ok) return { error: `${name} answered ${r.status}: ${text.slice(0, 200)}` };
    return JSON.parse(text);
  } catch (e) {
    return { error: `${name} did not answer: ${String(e).slice(0, 160)}` };
  }
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

  const [viewsRaw, surfaceRaw] = await Promise.all([
    rpc('dtelco_reader_probe'), rpc('dtelco_reader_surface'),
  ]);

  if (!Array.isArray(viewsRaw) || !Array.isArray(surfaceRaw)) {
    return new Response(JSON.stringify({
      function: 'dtelco-remote', ok: false,
      why: (viewsRaw as { error?: string })?.error ??
           (surfaceRaw as { error?: string })?.error ?? 'the probes did not answer',
    }, null, 1), { headers });
  }

  const views = viewsRaw as Array<{ view_name: string; resolves: boolean; blocked_on: string | null }>;
  const surface = surfaceRaw as Array<{ object_name: string; kind: string; reader_can_select: boolean; is_contact_keyed: boolean }>;

  /* Two different answers, and conflating them would make this check cry wolf every run.
     A view nobody granted is deliberately not offered: the two product shaped upload views exist
     for the ecomm API and must never appear in a remote source picker.
     A view that IS granted and still cannot resolve is a segment that errors in the panel. */
  const notOffered = views.filter((v) => v.blocked_on === 'the view itself is not granted');
  const broken = views.filter((v) => !v.resolves && v.blocked_on !== 'the view itself is not granted');
  const offered = surface.filter((s) => s.reader_can_select);
  const referenceOffered = offered.filter((s) => REFERENCE.has(s.object_name));
  /* A remote table has to relate to master_contact or master_device, which on this side means it
     carries a contact key or a device id. Something offered without one cannot be connected, so
     it is noise in the picker at best and a rule being broken at worst. */
  const offeredWithoutKey = offered.filter((s) => !s.is_contact_keyed);

  return new Response(JSON.stringify({
    function: 'dtelco-remote',
    reads_as: 'dengage_reader, which is the role Dengage connects with, not the service role',
    writes: 'nothing, ever',

    views_resolving: views.filter((v) => v.resolves).length,
    views_broken: broken.length,
    broken: broken.map((v) => ({ view: v.view_name, why: v.blocked_on })),
    not_offered: notOffered.map((v) => v.view_name),
    why_not_offered: 'granted to nobody on purpose. These are the product shaped views the ' +
                     'ecommerce API uploads from, and a remote source picker must never list them.',

    offered_count: offered.length,
    reference_tables_offered: referenceOffered.map((s) => s.object_name),
    offered_without_a_contact_key: offeredWithoutKey.map((s) => s.object_name),

    ok: broken.length === 0 && referenceOffered.length === 0 && offeredWithoutKey.length === 0,
    rules: {
      every_granted_view_resolves: 'a view granted to this role that cannot read its own base ' +
                                   'tables is a segment that errors in the panel',
      no_reference_tables: 'reference tables about products or places are never offered as remote ' +
                           'sources and never connected',
      contact_keyed_only: 'a remote table must relate to master_contact or master_device',
    },
    why_this_exists: 'the service role and the reporting role see different things, and only one ' +
                     'of them is what the platform connects with',
  }, null, 1), { headers });
});
