/* dtelco-product-feed: the catalogue, three ways.
 *
 *   ?table=product          the Dengage product upload CSV, A6.1 column order
 *   ?table=product_variant  the Dengage product_variant upload CSV
 *   (no table)              the JSON feed the site and the Android app read
 *
 * Emitted from the two views rather than a stored file, so a catalogue change is a re-download
 * rather than a hand edit, and the CSV can never disagree with what the site is showing.
 * UTF-8 with a byte order mark and CRLF, matching the Magento export Dengage supplied.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 10 * 60 * 1000, CAP = 120;
const hits = new Map<string, number[]>();
function overCap(who: string) {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now); hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > CAP;
}
function cors(origin: string | null, type: string) {
  const h: Record<string, string> = { 'content-type': type,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey',
    'cache-control': 'public, max-age=120' };
  if (origin && ORIGINS.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/* RFC 4180: quote a field that holds a comma, a quote or a newline, and double any quote
   inside it. The tags column is comma separated inside one quoted field, which is exactly the
   case that breaks a naive join. */
function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function page<T>(view: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(view).select('*').order(order)
      .range(from, from + 999);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;   // the client defaults to 1000 rows, and 245 plus
  }                                           // 496 would silently truncate on a bigger catalogue
  return out;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin, 'text/plain') });
  }
  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response('rate limit', { status: 429, headers: cors(origin, 'text/plain') });
  }

  const table = new URL(req.url).searchParams.get('table');
  try {
    if (table === 'product' || table === 'product_variant') {
      const view = `v_dtelco_dengage_${table}`;
      const rows = await page<Record<string, unknown>>(view,
        table === 'product' ? 'product_id' : 'product_variant_id');
      if (!rows.length) {
        return new Response('the catalogue view returned no rows',
          { status: 503, headers: cors(origin, 'text/plain') });
      }
      const header = Object.keys(rows[0]);
      const body = [header.join(','),
        ...rows.map((r) => header.map((k) => csvField(r[k])).join(','))].join('\r\n');
      return new Response('﻿' + body + '\r\n', {
        headers: { ...cors(origin, 'text/csv; charset=utf-8'),
          'content-disposition': `attachment; filename="dtelco-${table}.csv"` },
      });
    }

    const [products, variants, relations, bundles] = await Promise.all([
      page('dtelco_product', 'product_id'),
      page('dtelco_product_variant', 'product_variant_id'),
      page('dtelco_product_relation', 'from_product_id'),
      page('dtelco_bundle_item', 'bundle_id'),
    ]);
    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(), currency: 'USD',
      origin: 'https://d-telco.github.io/telco/',
      counts: { products: products.length, variants: variants.length,
                relations: relations.length, bundle_items: bundles.length },
      products, variants, relations, bundle_items: bundles,
    }), { headers: cors(origin, 'application/json') });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }),
      { status: 500, headers: cors(origin, 'application/json') });
  }
});
