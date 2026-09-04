/* Every function is pinned in supabase/config.toml, and every pin is honoured live.
 *
 * These endpoints are called from the browser and from a terminal with no Supabase JWT. The CLI
 * defaults verify_jwt to true, so a deploy from a machine without this pinning would turn the
 * whole storefront into a wall of 401s, and the browser console would say only that the fetch
 * failed. That is the kind of fault that is expensive precisely because it explains itself badly.
 *
 * Three assertions:
 *
 *   1. every function directory has an entry in config.toml
 *   2. every entry pins verify_jwt = false, since that is what these endpoints need
 *   3. every function that answers a health line is actually reachable without a token
 *
 * The third is the one that catches a deploy that ignored the file.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = process.env.DTELCO_FUNCTIONS ||
  'https://raextqlludkagdntyzwn.supabase.co/functions/v1/';

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const dirs = (await readdir(join(ROOT, 'supabase/functions'), { withFileTypes: true }))
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const toml = await readFile(join(ROOT, 'supabase/config.toml'), 'utf8');

ok('there are functions to check', dirs.length > 0, `${dirs.length} on disk`);

const pinned = [...toml.matchAll(/^\[functions\.([\w-]+)\]\s*\nverify_jwt\s*=\s*(\w+)/gm)]
  .map((m) => ({ name: m[1], verify: m[2] }));
const byName = new Map(pinned.map((p) => [p.name, p.verify]));

const unpinned = dirs.filter((d) => !byName.has(d));
ok('every function is pinned in supabase/config.toml', unpinned.length === 0,
   unpinned.length ? `${unpinned.join(', ')} would deploy with the CLI default`
                   : `${pinned.length} pinned`);

const wrong = pinned.filter((p) => p.verify !== 'false').map((p) => p.name);
ok('and every pin is verify_jwt = false', wrong.length === 0,
   wrong.length ? `${wrong.join(', ')} would refuse the browser` : 'all of them');

const stale = pinned.filter((p) => !dirs.includes(p.name)).map((p) => p.name);
ok('and nothing is pinned that no longer exists', stale.length === 0,
   stale.length ? `${stale.join(', ')} is in the file and not on disk` : '');

/* The live half. A pin in a file proves nothing about what is running, and it is what is running
   that a demonstration depends on. A function that answers without a token is doing so because it
   was deployed that way. */
const unreachable = [];
for (const name of dirs) {
  try {
    const r = await fetch(BASE + name, { method: 'GET' });
    /* 401 is the failure this check exists for: it means JWT verification is on. Anything else,
       including a 404 or a 405, means the request reached the function's own code. */
    if (r.status === 401) unreachable.push(`${name} answers 401`);
  } catch (e) {
    unreachable.push(`${name} did not answer: ${String(e).slice(0, 60)}`);
  }
  await new Promise((res) => setTimeout(res, 150));
}
ok('and every deployed function answers without a Supabase token', unreachable.length === 0,
   unreachable.length ? unreachable.join('; ') : `${dirs.length} reachable`);

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} function assertions passed`);
process.exit(failed.length ? 1 : 0);
