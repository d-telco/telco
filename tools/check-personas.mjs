/* The walkthrough's persona table, checked against the operator's own records.
 *
 * A runbook makes claims about live data, so it is checked like one. Names can sit against the
 * wrong keys: Elvin against 2, Rashad against 4, and a persona called Sevda who does not exist.
 * A name against the wrong key is read aloud while the screen shows somebody else.
 *
 * A runbook is a document that makes claims about live data. That makes it the same kind of thing
 * as a page, and it gets the same treatment: the numbers come from the endpoint, and if the two
 * disagree the build fails rather than the presenter.
 *
 * One request per persona with a pause between them. The brief records that seven simultaneous
 * reads trip the rate limit and the seventh comes back 429 every time, so this walks rather than
 * fans out. It reads and writes nothing.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = process.env.DTELCO_FUNCTIONS ||
  'https://raextqlludkagdntyzwn.supabase.co/functions/v1/';

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const walkthrough = await readFile(join(ROOT, 'handoff/WALKTHROUGH.md'), 'utf8');

/* The table rows, read as text. The first cell is the key and the second is the name the presenter
   will say out loud. */
const rows = [...walkthrough.matchAll(/^\|\s*`(DPS-DTELCO-\d+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
  .map((m) => ({ key: m[1], name: m[2], carries: m[3] }));

ok('the walkthrough names its personas in a table', rows.length >= 8,
   `${rows.length} rows`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wrong = [];
const unreachable = [];
for (const row of rows) {
  let body;
  try {
    const r = await fetch(`${BASE}dtelco-profile?key=${encodeURIComponent(row.key)}`);
    body = await r.json();
  } catch {
    unreachable.push(row.key);
    await sleep(400);
    continue;
  }
  /* A rate limited read is not a wrong name. Saying which is the difference between a check that
     is trusted and one that is muted. */
  if (!body || body.error || body.known_to_operator !== true) {
    unreachable.push(`${row.key} (${body?.error ?? 'no record'})`);
    await sleep(900);
    continue;
  }
  if (body.full_name !== row.name) {
    wrong.push(`${row.key} is ${body.full_name} and the runbook says ${row.name}`);
  }
  await sleep(900);
}

ok('every persona in it was readable', unreachable.length === 0,
   unreachable.length ? `${unreachable.join('; ')}` : `${rows.length} read`);

ok('and the name against every key is the name on the record', wrong.length === 0,
   wrong.length ? wrong.join('; ') : `${rows.length - unreachable.length} names match`);

/* The keys are consecutive and complete. A table missing 7 would send a presenter looking for the
   family persona and finding nothing. */
const nums = rows.map((r) => Number(r.key.split('-').pop())).sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i <= 8; i++) if (!nums.includes(i)) gaps.push(i);
ok('and all eight are listed', gaps.length === 0,
   gaps.length ? `missing ${gaps.join(', ')}` : 'one to eight');

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} persona assertions passed`);
process.exit(failed.length ? 1 : 0);
