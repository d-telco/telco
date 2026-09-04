/* The coverage check: every behaviour the site performs itself, against the Dengage mechanism
 * that would perform it instead.
 *
 * This is the check that maps behaviour to mechanism, and it is the one the other checks cannot
 * do. tools/check-contract.mjs compares the site to the backend. tools/audit.mjs compares one
 * document to another. Neither can answer the question that decides whether this demonstration is
 * honest: for each thing the page draws by itself, is there a documented Dengage mechanism that
 * does the same, and has somebody actually cited it.
 *
 * Three ways handoff/MECHANISM-MAP.md could quietly become false, and all three fail here:
 *
 *   1. the code performs a behaviour the document has no row for
 *   2. a row cites a document outside the supplied set, undeclared
 *   3. a row says verify and nothing in the verify list says what to check
 *
 * It reads files. No browser, no network.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const audit = await read('handoff/MECHANISM-MAP.md');
const reco = await read('js/reco.js');
const creatives = await read('js/creatives.js');
const site = await read('js/site.js');

/* ------------------------------------------------------------------ what the code performs */

/* Read from the call sites rather than from any list, so a rule added without being listed is
   still counted. A rule name can carry a digit: usage_80 is the one that matters most and a
   character class without 0-9 drops it, which is exactly what happened the first time a check in
   this repository compared rule names. */
const NAME = '[a-z0-9_]+';
const rules = new Set();
[...reco.matchAll(new RegExp(`related\\([^,]+,\\s*'${NAME}',\\s*out,\\s*'(${NAME})'`, 'g'))]
  .forEach((m) => rules.add(m[1]));
[...reco.matchAll(new RegExp(`pushUnique\\(out,\\s*[\\w.]+,\\s*'(${NAME})'`, 'g'))]
  .forEach((m) => rules.add(m[1]));

/* The creative ids, from the array the engine iterates, plus the recognition band, which js/site.js
   draws and reports through the engine's own cap. */
const creativeIds = new Set([...creatives.matchAll(/id: '(\w+)',\n\s*kind:/g)].map((m) => m[1]));
[...site.matchAll(/impression\('(\w+)'/g)].forEach((m) => creativeIds.add(m[1]));

const behaviours = [...rules, ...creativeIds];
ok('the code performs a knowable set of local behaviours', behaviours.length >= 15,
   `${rules.size} recommendation rules, ${creativeIds.size} creatives`);

/* ------------------------------------------------------------------ the rows */

/* A row is a table line whose first cell is a backticked behaviour name. The last two cells are
   the source and whether it is verified, which is the whole point of the row. */
const rows = new Map();
for (const m of audit.matchAll(/^\|\s*`(\w+)`\s*\|\s*(rule|creative)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/gm)) {
  rows.set(m[1], { kind: m[2], mechanism: m[3].trim(), source: m[4].trim(), verified: m[5].trim() });
}
ok('the audit carries rows a checker can read', rows.size > 0, `${rows.size} rows`);

const noRow = behaviours.filter((b) => !rows.has(b));
ok('every behaviour the code performs has a row in the audit', noRow.length === 0,
   noRow.length ? `${noRow.join(', ')} render locally and are traced to nothing` : '');

const noBehaviour = [...rows.keys()].filter((b) => !behaviours.includes(b));
ok('and the audit traces nothing the code no longer performs', noBehaviour.length === 0,
   noBehaviour.join(', '));

/* ------------------------------------------------------------------ what may be cited */

const supplied = new Set([...(audit.match(/```\n([\s\S]*?)```/)?.[1] ?? '')
  .matchAll(/((?:reference|docs)\/[\w-]+)/g)].map((m) => m[1]));
ok('the supplied documentation set is listed', supplied.size >= 30, `${supplied.size} pages`);

/* Everything cited anywhere in the document, so a citation in prose is held to the same rule as a
   citation in a table. A page beyond the supplied set has to be named in section 0 with a reason,
   which is what the declared list is. */
/* The first column only. A reason may name a supplied page to explain why the declared one was
   needed, and reading the whole row counted those too: reference/getcouponlist sat in the
   declared set purely because docs/coupon's reason mentions it. */
const declared = new Set([...(audit.slice(audit.indexOf('**Beyond the supplied set.**'),
                                          audit.indexOf('## 1.'))
  .matchAll(/^\|\s*`((?:reference|docs)\/[\w-]+)`\s*\|/gm))].map((m) => m[1]));
ok('and the pages read beyond it are declared with a reason', declared.size > 0,
   `${declared.size} declared`);

/* The sentence introducing that table said five while the table listed nineteen, and stayed wrong
   long enough to be quoted back. A number written in prose beside a list it describes is a number
   that will drift, so it is read from the prose and compared to the list. */
const WORDS = { Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10, Eleven: 11, Twelve: 12,
                Thirteen: 13, Fourteen: 14, Fifteen: 15, Sixteen: 16, Seventeen: 17,
                Eighteen: 18, Nineteen: 19, Twenty: 20, 'Twenty one': 21, 'Twenty two': 22,
                'Twenty three': 23, 'Twenty four': 24, 'Twenty five': 25 };
/* Two words, because the list passed twenty. A single word class read "Twenty one" as twenty and
   the sentence would have gone on agreeing with itself while the table grew. */
const claimedBeyond = audit.match(/\*\*Beyond the supplied set\.\*\*\s+([A-Za-z]+(?: [a-z]+)?|\d+)\s+pages/)?.[1];
const claimedN = WORDS[claimedBeyond] ?? Number(claimedBeyond);
ok('and says how many of them there are, correctly', claimedN === declared.size,
   claimedN === declared.size
     ? `${declared.size} claimed and listed`
     : `the sentence says ${claimedBeyond} and the table lists ${declared.size}`);

const cited = new Set([...audit.matchAll(/(?:^|[\s`|])((?:reference|docs)\/[\w-]+)/gm)]
  .map((m) => m[1]));
const undeclared = [...cited].filter((c) => !supplied.has(c) && !declared.has(c));
ok('every page the audit cites is supplied or declared', undeclared.length === 0,
   undeclared.length ? `${undeclared.join(', ')} is cited and appears in neither list` : '');

const sourceless = [...rows.entries()].filter(([, r]) => !/(?:reference|docs)\//.test(r.source));
ok('and every row names the page that proves it', sourceless.length === 0,
   sourceless.map(([b]) => b).join(', '));

/* ------------------------------------------------------------------ verify means verify */

const verifySection = audit.slice(audit.indexOf('## 7. Confirmed in the account'));
ok('the verify list exists', verifySection.length > 0);
const verifyRows = [...verifySection.matchAll(/^\|\s*\d+\s*\|/gm)].length;
ok('and it has entries', verifyRows > 0, `${verifyRows} entries`);

const unverified = [...rows.entries()].filter(([, r]) => r.verified === 'verify').map(([b]) => b);
/* Each one has to be named in section 7, so "verify" is a commitment to confirm something
   specific rather than a word that makes a claim safe to print. */
const unchecked = unverified.filter((b) => !verifySection.includes(`\`${b}\``));
ok('every row marked verify names what to confirm in the account', unchecked.length === 0,
   unchecked.length ? `${unchecked.join(', ')} says verify and section 7 says nothing` : `${unverified.length} marked verify`);

const marks = [...new Set([...rows.values()].map((r) => r.verified))];
const strange = marks.filter((m) => !['yes', 'verify', 'telco'].includes(m));
ok('and every row is marked yes, verify or telco, with nothing in between',
   strange.length === 0, strange.join(', '));

/* telco means Dengage would build this for an operator rather than ship it as a model, which is
   a commitment this build makes. It is a claim about a commitment, so it must never be printed as
   though the platform already does it. */
const telco = [...rows.entries()].filter(([, r]) => r.verified === 'telco').map(([b]) => b);
ok('the rules Dengage would build rather than ship are named as such', telco.length > 0,
   telco.join(', '));

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} coverage assertions passed`);
console.log(`${behaviours.length} local behaviours, ${rows.size} traced, ${unverified.length} to verify, ${telco.length} telco specific`);
process.exit(failed.length ? 1 : 0);
