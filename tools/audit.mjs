/* The everything works census.
 *
 * The browser suite proves that a page works and the phone check proves it works on a phone.
 * Neither can see across the repository, and that is where a demonstration rots quietly: a
 * capability listed in the map with no surface that proves it, a journey with no copy, a page
 * linked from three places and never built, a segment documented and never created.
 *
 * This is a census rather than a browser: it reads the documents, the source and the disk, and
 * counts. Nothing here launches a browser or touches the network, so it runs in a second and can
 * be run before every commit.
 */
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PAGES } from './pages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');
const exists = (p) => access(join(ROOT, p)).then(() => true, () => false);

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const map = await read('handoff/CAPABILITY-MAP.md');
const segments = await read('handoff/SEGMENTS.md');
const contents = JSON.parse(await read('panel/contents.json'));

/* ---------- the capability inventory, and what proves each one ---------- */

/* Part 1 lists every capability as a table row starting with its id. Part 2 marks the one surface
   that exists for it in bold. Part 4 claims each appears as a headline exactly once, and this is
   the assertion that makes that claim checkable rather than a sentence somebody has to believe. */
/* A-L rather than A-J since the mobile section arrived. K is deliberately inside the range and
   deliberately absent from Part 1: K1 and K2 live in Part 5, which describes the recognition
   thread rather than the inventory, and a range that skipped K would be a range somebody widens
   wrongly the next time a section is added. */
const part1 = map.slice(map.indexOf('## Part 1'), map.indexOf('## Part 2'));
const inventory = [...part1.matchAll(/^\|\s*([A-L]\d+)\s*\|/gm)].map(m => m[1]);
/* The number is read from the document's own sentence rather than written here, so the two cannot
   disagree quietly. A census that carries its own copy of a figure is a second place for it to be
   wrong. */
const claimed = Number(part1.match(/\*\*(\d+) capabilities\.\*\*/)?.[1]);
ok('Part 1 states how many capabilities it lists', Number.isFinite(claimed),
   Number.isFinite(claimed) ? `it says ${claimed}` : 'it says nothing, so nothing can be checked');
ok('and lists exactly that many', inventory.length === claimed,
   `${inventory.length} rows against ${claimed} claimed`);
ok('with no capability listed twice', new Set(inventory).size === inventory.length);

/* One count, and only one. A second written out in words sat in the preamble saying fifty five
   while the line above it said sixty seven, and every check passed because no check reads prose.
   A number a checker cannot see is a number that goes stale, so a second one is a failure here
   rather than an embarrassment in the room. */
const WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[ -](?:zero|one|two|three|four|five|six|seven|eight|nine|ten))?/i;
const otherCounts = [...part1.matchAll(/([\w -]+?)\s+capabilit(?:y|ies)/gi)]
  .map(m => m[1].trim())
  .filter(w => WORDS.test(w) || /^\d+$/.test(w))
  .filter(w => w !== String(claimed) && w !== `**${claimed}`);
ok('and states that count once, not again in words', otherCounts.length === 0,
   otherCounts.length ? `${otherCounts.join(', ')} disagrees with ${claimed}` : `only ${claimed}`);

const part2 = map.slice(map.indexOf('## Part 2'), map.indexOf('## Part 3'));
const part3Raw = map.slice(map.indexOf('## Part 3'), map.indexOf('## Part 4'));
const headlines = [...part2.matchAll(/\*\*([A-L]\d+)\*\*/g)].map(m => m[1]);
const headlineCount = headlines.reduce((a, id) => (a[id] = (a[id] ?? 0) + 1, a), {});

/* A capability may be headlined twice only where Part 4 argues for it in writing. The allowance is
   read from that argument, so adding a repeat means writing down why, which is the point. */
const part4 = map.slice(map.indexOf('## Part 4'));
const DELIBERATE_REPEATS = Object.fromEntries(
  [...part4.matchAll(/^- \*\*([A-L]\d+) x(\d+)\.\*\*/gm)].map(m => [m[1], Number(m[2])]));
ok('every argued repeat names its capability and its count',
   Object.keys(DELIBERATE_REPEATS).length > 0,
   Object.entries(DELIBERATE_REPEATS).map(([id, n]) => `${id} x${n}`).join(', ') ||
     'Part 4 argues for none');
const repeated = Object.entries(headlineCount)
  .filter(([id, n]) => n > (DELIBERATE_REPEATS[id] ?? 1));
ok('no capability is headlined by more than one surface, except the one the map argues for',
   repeated.length === 0, repeated.map(([id, n]) => `${id} x${n}`).join(', '));

/* A capability nobody headlines and nobody carries is a capability the demonstration claims and
   never shows. */
const demoLayer = new Set(
  [...map.slice(map.indexOf('### Capabilities carried by the demo layer'), map.indexOf('## Part 3'))
    .matchAll(/^\|\s*([A-L]\d+(?:,\s*[A-L]\d+)*)\s*\|/gm)]
    .flatMap(m => m[1].split(',').map(s => s.trim())));
const alsoCarries = new Set([...part2.matchAll(/\|\s*((?:[A-L]\d+,?\s*)+)\|\s*[^|]*\|\s*$/gm)]
  .flatMap(m => m[1].split(',').map(s => s.trim())));
/* Part 3 proves the orchestration capabilities: a journey's trigger kind is the capability it
   demonstrates, so the matrix counts as coverage exactly as Part 2 does. */
const proven = new RegExp(`\\b(${inventory.join('|')})\\b`, 'g');
const mentioned = new Set([...part2.matchAll(proven)].map(m => m[1])
  .concat([...part3Raw.matchAll(proven)].map(m => m[1])));
const orphans = inventory.filter(id =>
  !headlineCount[id] && !demoLayer.has(id) && !alsoCarries.has(id) && !mentioned.has(id));
ok('every capability is proved by a surface, a journey, or the demo layer',
   orphans.length === 0, orphans.join(', '));

/* ---------- journeys and the copy that fills them ---------- */

const journeys = [...part3Raw.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)]
  .map(m => ({ n: Number(m[1]), title: m[2] }));
/* Not a count. A count passes whichever row went missing so long as another was added, which is
   the same trap that hid a missing form in the backend checker. Contiguous numbering from one is
   the property that actually matters, and it cannot be satisfied by accident. */
const gaps = journeys.map(j => j.n).sort((a, b) => a - b)
  .filter((n, i) => n !== i + 1);
ok('the matrix numbers its journeys from one with no gaps', gaps.length === 0,
   `${journeys.length} rows, first break at ${gaps[0] ?? 'none'}`);

const moments = contents.moments;
const covered = new Set(moments.map(m => m.journey));
const uncovered = journeys.filter(j => !covered.has(j.n));
ok('every journey in the matrix has copy in the content pack', uncovered.length === 0,
   uncovered.map(j => `${j.n} ${j.title}`).join(', '));

const stray = moments.filter(m => !journeys.some(j => j.n === m.journey));
ok('and every moment in the content pack belongs to a journey in the matrix', stray.length === 0,
   stray.map(m => m.id).join(', '));

ok('no two moments claim the same journey',
   new Set(moments.map(m => m.journey)).size === moments.length,
   `${moments.length} moments, ${new Set(moments.map(m => m.journey)).size} journeys`);

/* ---------- segments, documented and created ---------- */

const documented = [...segments.matchAll(/`(v_dtelco_\w+)`/g)].map(m => m[1]);
const uniqueDocumented = [...new Set(documented)];
const migrations = (await readdir(join(ROOT, 'supabase/migrations'))).filter(f => f.endsWith('.sql'));
const migrationSql = (await Promise.all(
  migrations.map(f => read(`supabase/migrations/${f}`)))).join('\n');
const seedSql = (await Promise.all(
  (await readdir(join(ROOT, 'supabase/seed'))).filter(f => f.endsWith('.sql'))
    .map(f => read(`supabase/seed/${f}`)))).join('\n');
const undefined_ = uniqueDocumented.filter(v =>
  !migrationSql.includes(`create or replace view public.${v}`) &&
  !seedSql.includes(`create or replace view public.${v}`));
ok('every segment view the document names is created by a migration or a seed',
   undefined_.length === 0, undefined_.join(', '));

/* ---------- pages: built, linked and reachable ---------- */

const fragments = (await readdir(join(ROOT, 'pages'))).filter(f => f.endsWith('.html'));
const unbuilt = [];
for (const f of fragments) if (!await exists(f)) unbuilt.push(f);
ok('every page fragment produced a built page', unbuilt.length === 0, unbuilt.join(', '));
ok('and the swept list covers every built page',
   fragments.length === new Set(PAGES.map(([p]) => p.split('?')[0])).size,
   `${fragments.length} fragments, ${new Set(PAGES.map(([p]) => p.split('?')[0])).size} swept`);

/* A link to a page nobody built is a dead end a prospect finds before anybody else does. */
const built = fragments.map(f => f.replace(/^/, ''));
const broken = [];
for (const f of built) {
  const html = await read(f);
  for (const m of html.matchAll(/href="([^"#?:]+\.html)/g)) {
    if (!await exists(m[1])) broken.push(`${f} -> ${m[1]}`);
  }
}
ok('every internal link resolves to a page that exists', broken.length === 0,
   [...new Set(broken)].slice(0, 5).join(', '));

/* Same for anything the built pages ask the browser to fetch from disk. */
const missingAssets = new Set();
for (const f of built) {
  const html = await read(f);
  for (const m of html.matchAll(/(?:src|href)="((?:assets|js)\/[^"?]+)/g)) {
    if (!await exists(m[1])) missingAssets.add(`${f} -> ${m[1]}`);
  }
}
ok('every asset a page names is on disk', missingAssets.size === 0,
   [...missingAssets].slice(0, 5).join(', '));

/* A stale script tag is served for ten minutes by Pages, so every module must carry this build's
   stamp rather than an older one. */
const stamps = new Set();
for (const f of built) {
  for (const m of (await read(f)).matchAll(/\.js\?v=(\d+)/g)) stamps.add(m[1]);
}
ok('every page carries one build stamp, not a mixture', stamps.size === 1,
   [...stamps].join(', '));

/* ---------- the content pack, against what it needs on disk ---------- */

const pushMedia = [...new Set(moments.filter(m => m.push?.media).map(m => m.push.media))];
const missingMedia = [];
for (const slug of pushMedia) {
  if (!await exists(`assets/push/${slug}.jpg`)) missingMedia.push(slug);
}
ok('every push image the content pack names is on disk', missingMedia.length === 0,
   missingMedia.join(', '));

const emailFiles = (await readdir(join(ROOT, 'panel/email'))).filter(f => f.endsWith('.html'));
const withEmail = moments.filter(m => m.email).map(m => m.id);
ok('there is one generated body per moment with email copy',
   emailFiles.filter(f => !f.startsWith('_')).length === withEmail.length,
   `${emailFiles.length - 1} bodies, ${withEmail.length} moments`);

/* ---------- personas ---------- */

const everySource = [
  ...(await Promise.all((await readdir(join(ROOT, 'js'))).filter(f => f.endsWith('.js'))
    .map(f => read(`js/${f}`)))),
  ...(await Promise.all(built.map(f => read(f)))),
].join('\n');
const keys = [...new Set([...everySource.matchAll(/DPS-DTELCO-(\w+)/g)].map(m => m[1]))];
const badKeys = keys.filter(k => !/^[1-8]$/.test(k) && k !== 'S01524');
ok('every persona key named in the site is one of the eight', badKeys.length === 0,
   badKeys.map(k => `DPS-DTELCO-${k}`).join(', '));

/* ---------- the report ---------- */

const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`
census: ${inventory.length} capabilities, ${Object.keys(headlineCount).length} headlined,
        ${journeys.length} journeys, ${moments.length} moments, ${uniqueDocumented.length} segment views,
        ${fragments.length} pages, ${emailFiles.length - 1} email bodies, ${pushMedia.length} push images`);
console.log(`${results.length - failed.length}/${results.length} census assertions passed`);
process.exit(failed.length ? 1 : 0);
