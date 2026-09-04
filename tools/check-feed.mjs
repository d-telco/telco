/* The check that catches drift.
 *
 * The catalogue exists in three places: the generator, the two committed CSVs, and the database
 * the feed function serves from. They are supposed to be the same catalogue. They stopped being
 * the same the moment the generator changed and the database was not reloaded, and nothing
 * noticed, because every individual piece looked right.
 *
 * This compares the live feed against the committed file, row by row and field by field.
 */
import { readFileSync } from 'node:fs';

const FEED = 'https://raextqlludkagdntyzwn.supabase.co/functions/v1/dtelco-product-feed';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter(r => r.length === header.length)
             .map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const fails = [];
for (const table of ['product', 'product_variant']) {
  const key = table === 'product' ? 'product_id' : 'product_variant_id';
  const file = parseCsv(readFileSync(`${new URL('..', import.meta.url).pathname}handoff/dtelco-${table}.csv`, 'utf8'));
  const served = parseCsv(await (await fetch(`${FEED}?table=${table}`)).text());

  const a = new Map(file.map(r => [r[key], r]));
  const b = new Map(served.map(r => [r[key], r]));
  if (a.size !== b.size) fails.push(`${table}: file has ${a.size} rows, feed serves ${b.size}`);
  for (const id of a.keys()) if (!b.has(id)) fails.push(`${table}: ${id} is in the file, not in the feed`);
  for (const id of b.keys()) if (!a.has(id)) fails.push(`${table}: ${id} is in the feed, not in the file`);

  /* stock_count and discounted_price are the two columns the operator simulator is SUPPOSED to
     change: back_in_stock restocks a handset, price_dropped discounts one. Comparing them
     against the committed file would fail every time the demo is rehearsed, which would train
     everyone to ignore this check. They are reported separately instead, as drift that is
     explained rather than drift that is wrong. */
  const MUTABLE = new Set(['stock_count', 'discounted_price']);
  let mismatched = 0, example = '', simulated = 0;
  for (const [id, row] of a) {
    const other = b.get(id);
    if (!other) continue;
    for (const col of Object.keys(row)) {
      if (row[col] === other[col]) continue;
      if (MUTABLE.has(col)) { simulated++; continue; }
      mismatched++;
      if (!example) example = `${table} ${id}.${col}: file ${JSON.stringify(row[col])} vs feed ${JSON.stringify(other[col])}`;
    }
  }
  if (mismatched) fails.push(`${table}: ${mismatched} fields differ. ${example}`);
  if (simulated) console.log(`  ${simulated} stock or price fields moved by the simulator, which is its job`);

  // Tags are comma separated inside one quoted field, and a duplicate there is silent.
  for (const r of served) {
    const tags = (r.tags ?? '').split(',').filter(Boolean);
    if (tags.length !== new Set(tags).size) fails.push(`${table}: duplicated tag on ${r[key]}: ${r.tags}`);
  }
  console.log(`${table}: ${a.size} rows in the file, ${b.size} served, ${mismatched} fields differing`);
}
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? `${fails.length} FAILED` : 'the feed and the committed files are the same catalogue');
process.exit(fails.length ? 1 : 0);
