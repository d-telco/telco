/* The coverage check: every rule and creative the site performs, against the platform mechanism
 * that performs the same thing.
 *
 * This is the check the others cannot do. tools/check-contract.mjs compares the site to the
 * backend. tools/audit.mjs compares one document to another. Neither can answer the question that
 * decides whether this build is honest: for each rule the engine runs and each creative it draws,
 * is there a documented mechanism that produces the same ordering or the same experience, and has
 * somebody named it.
 *
 * The annotations live next to the code rather than in a document, as `@maps` lines in the header
 * of js/reco.js and js/creatives.js. A document drifts from the code it describes; a comment three
 * lines above the array does not, and the person adding a rule is looking straight at it.
 *
 * Four ways the mapping could quietly become false, and all four fail here:
 *
 *   1. the code performs a rule or draws a creative that no line accounts for
 *   2. a line accounts for something the code no longer performs
 *   3. a line names no documentation page
 *   4. a line says verify and nobody put it on the panel confirm list in ACCOUNT-SETUP.md
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

const reco = await read('js/reco.js');
const creatives = await read('js/creatives.js');
const site = await read('js/site.js');
const setup = await read('handoff/ACCOUNT-SETUP.md');

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

/* The creative ids, from the array the engine iterates, plus the recognition band, which
   js/site.js draws and reports through the engine's own cap. */
const creativeIds = new Set([...creatives.matchAll(/id: '(\w+)',\n\s*kind:/g)].map((m) => m[1]));
[...site.matchAll(/impression\('(\w+)'/g)].forEach((m) => creativeIds.add(m[1]));

const behaviours = [...rules, ...creativeIds];
ok('the code performs a knowable set of behaviours', behaviours.length >= 15,
   `${rules.size} recommendation rules, ${creativeIds.size} creatives`);

/* ------------------------------------------------------------------ the annotations */

/* name :: mechanism :: documentation page :: mark. Four fields, and the parser refuses a line that
   does not carry all four rather than reading a short line as a long one. */
const maps = new Map();
const malformed = [];
for (const src of [reco, creatives]) {
  for (const m of src.matchAll(/^\s*\*\s*@maps\s+(.+)$/gm)) {
    const parts = m[1].split('::').map((p) => p.trim());
    if (parts.length !== 4 || !parts.every(Boolean)) { malformed.push(m[1].slice(0, 40)); continue; }
    maps.set(parts[0], { mechanism: parts[1], source: parts[2], mark: parts[3] });
  }
}
ok('the source carries annotations a checker can read', maps.size > 0, `${maps.size} lines`);
ok('and every one names all four fields', malformed.length === 0, malformed.join('; '));

const unmapped = behaviours.filter((b) => !maps.has(b));
ok('every behaviour the code performs is accounted for', unmapped.length === 0,
   unmapped.length ? `${unmapped.join(', ')} runs and is traced to nothing` : '');

const stale = [...maps.keys()].filter((b) => !behaviours.includes(b));
ok('and nothing is accounted for that the code no longer performs', stale.length === 0,
   stale.join(', '));

/* ------------------------------------------------------------------ what each line names */

const sourceless = [...maps.entries()].filter(([, r]) => !/(?:reference|docs)\//.test(r.source));
ok('every line names the page that proves it', sourceless.length === 0,
   sourceless.map(([b]) => b).join(', '));

const marks = [...new Set([...maps.values()].map((r) => r.mark))];
const strange = marks.filter((m) => !['yes', 'verify', 'telco'].includes(m));
ok('and every line is marked yes, verify or telco, with nothing in between',
   strange.length === 0, strange.join(', '));

/* telco means Dengage builds this for an operator as a custom rule rather than shipping it as a
   model. It is a different claim from a model the engine already has, so it is marked differently
   and can never be printed as though it were one. */
const telco = [...maps.entries()].filter(([, r]) => r.mark === 'telco').map(([b]) => b);
ok('the rules built for an operator are named as such', telco.length > 0, telco.join(', '));

/* ------------------------------------------------------------------ verify means verify */

const confirm = setup.slice(setup.indexOf('## Confirm in the panel'));
ok('the panel confirm list exists', confirm.length > 0);
const confirmRows = [...confirm.matchAll(/^\|\s*\d+\s*\|/gm)].length;
ok('and it has entries', confirmRows > 0, `${confirmRows} entries`);

const unverified = [...maps.entries()].filter(([, r]) => r.mark === 'verify').map(([b]) => b);
/* Each one has to be named there, so verify is a commitment to confirm something specific rather
   than a word that makes a claim safe to print. */
const unchecked = unverified.filter((b) => !confirm.includes(`\`${b}\``));
ok('every line marked verify names what to confirm in the account', unchecked.length === 0,
   unchecked.length ? `${unchecked.join(', ')} says verify and the confirm list says nothing`
                    : `${unverified.length} marked verify`);

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} coverage assertions passed`);
console.log(`${behaviours.length} behaviours, ${maps.size} traced, ${unverified.length} to verify, ${telco.length} built for an operator`);
process.exit(failed.length ? 1 : 0);
