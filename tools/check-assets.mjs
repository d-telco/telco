/* A16 layer 1: every image URL in the catalogue resolves on the published origin.
 *
 * This check exists because the two Dengage CSVs carry 245 link URLs and 1476 image URLs that
 * nobody looks at until a dynamic content creative prints a broken one into an email. It reads
 * the feed, so it can never drift from what was uploaded.
 *
 * Reaches the published origin only. It never touches dengage.com, and asserts that it does not.
 */
import { readFileSync } from 'node:fs';

const ORIGIN = 'https://d-telco.github.io/telco/';
// Pages refuses connections under a burst, and a check that reports a live file as missing is
// worse than no check at all: it teaches everyone to ignore it. Four in flight, with a retry on
// anything that is not a clean 404, keeps it honest.
const CONCURRENCY = 4;
const ATTEMPTS = 3;
const feed = JSON.parse(readFileSync(new URL('../data/catalogue.json', import.meta.url)));

const slugs = new Set();
for (const p of feed.products) slugs.add(p.image_slug);
for (const v of feed.variants) slugs.add(v.image_slug);

const targets = [];
for (const s of slugs) for (const size of [400, 1200, 1600])
  targets.push(`${ORIGIN}assets/catalog/${s}-${size}.jpg`);
for (const n of ['hero-ai','hero-esim','hero-roaming','cat-phones','cat-plans','cat-roaming',
                 'cat-home','cat-accessories','cat-support','cat-services','promo-app','promo-family'])
  for (const size of [800, 1600, 2400]) targets.push(`${ORIGIN}assets/editorial/${n}-${size}.jpg`);
for (const n of ['usage-80','back-in-stock','price-drop','roaming','low-balance','cart','upgrade','welcome'])
  targets.push(`${ORIGIN}assets/push/${n}.jpg`);

if (targets.some(u => /dengage\.com/i.test(u))) {
  console.error('FAIL this check must never reach dengage.com');
  process.exit(1);
}

const bad = [];
let done = 0, retried = 0, bytes = 0, smallest = Infinity, largest = 0;
const queue = targets.slice();

async function worker() {
  for (let url = queue.pop(); url; url = queue.pop()) {
    try {
      let r = null, err = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          r = await fetch(url, { method: 'HEAD' });
          err = null;
          // A 404 is a missing file and is believed at once. Anything else that is not ok, and
          // any thrown connection error, is the CDN under load and earns another go.
          if (r.ok || r.status === 404) break;
        } catch (e) { err = e; r = null; }
        if (attempt < ATTEMPTS) { await new Promise(res => setTimeout(res, 400 * attempt)); retried++; }
      }
      if (err) { bad.push(`${err.message} ${url}`); continue; }
      const len = Number(r.headers.get('content-length') || 0);
      if (!r.ok) bad.push(`${r.status} ${url}`);
      else if (len < 1500) bad.push(`suspiciously small (${len}B) ${url}`);
      else { bytes += len; smallest = Math.min(smallest, len); largest = Math.max(largest, len); }
    } catch (e) { bad.push(`${e.message} ${url}`); }
    if (++done % 250 === 0) process.stdout.write(`  ${done}/${targets.length}\n`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`checked ${targets.length} URLs on ${ORIGIN}`);
console.log(`  catalogue slugs ${slugs.size}, sizes 3`);
console.log(`  total ${(bytes / 1048576).toFixed(1)} MB, smallest ${(smallest/1024).toFixed(1)} KB, largest ${(largest/1024).toFixed(0)} KB`);
for (const b of bad.slice(0, 20)) console.log('FAIL', b);
if (retried) console.log(`  ${retried} retried after a transient 5xx from Pages`);
console.log(bad.length ? `${bad.length} FAILED` : 'all resolved');
process.exit(bad.length ? 1 : 0);
