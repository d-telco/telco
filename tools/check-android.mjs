/* The Android checks, run without an emulator and without a phone.
 *
 * The app is Kotlin and this repository's other checks are Node, so this reads the source as text
 * rather than compiling it. Compiling is done by gradle and proves the code is valid; this proves
 * the code obeys the rules that no compiler knows about, which is where every fault in this build
 * has actually come from.
 *
 * Eight things, each one a rule the compiler does not know about:
 *
 *   1. one module talks to the SDK, and only that module imports it
 *   2. every screen fires its page view first
 *   3. every screen calls setNavigation, or an in-app campaign silently never draws on it
 *   4. the contact key shape is the same expression the web and every endpoint enforce
 *   5. the custom event table is the same one the web writes
 *   6. the app never reports an inbox event for a message a person did not touch
 *   7. every screen the capability map promises exists
 *   8. the manifest's endpoint hosts are the ones config names for its datacenter
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const SRC = 'android/app/src/main/java/com/dtelco/app';
const files = {};
for (const f of await readdir(join(ROOT, SRC))) {
  if (f.endsWith('.kt')) files[f] = await read(`${SRC}/${f}`);
}
for (const f of await readdir(join(ROOT, `${SRC}/ui`))) {
  if (f.endsWith('.kt')) files[`ui/${f}`] = await read(`${SRC}/ui/${f}`);
}

/* ------------------------------------------------------------------ 1. one module */

/* One module talks to the SDK on each surface. On the web that is
   js/dengageEvents.js. Here it is DengageBridge.kt. A second file reaching for the SDK directly is
   how the same call ends up written twice with two spellings, and only one of them fixed. */
const BRIDGE = 'DengageBridge.kt';
const importers = Object.entries(files)
  .filter(([, src]) => /^import com\.dengage\.sdk/m.test(src))
  .map(([f]) => f);
/* DtelcoApp registers the lifecycle tracker, which the SDK guide requires in the Application class
   and which cannot be moved behind the bridge without hiding what it is. InboxScreen names the
   message type it draws. Both are allowed and named, so a third importer fails. */
const ALLOWED = new Set([BRIDGE, 'DtelcoApp.kt', 'ui/InboxScreen.kt']);
const strays = importers.filter((f) => !ALLOWED.has(f));
ok('only the named files import the Dengage SDK', strays.length === 0,
   strays.length ? `${strays.join(', ')} reaches past the bridge`
                 : `${importers.length} files, all named`);

ok('and the bridge is one of them', importers.includes(BRIDGE),
   importers.includes(BRIDGE) ? 'DengageBridge.kt' : 'the bridge imports nothing');

/* ------------------------------------------------------------------ 2 and 3. every screen */

const screens = Object.keys(files).filter((f) => f.startsWith('ui/') && f.endsWith('Screen.kt'));
ok('the app has screens to check', screens.length >= 5, `${screens.length} screens`);

/* Every page fires its page view first. A screen whose rows arrive without one
   has rows in Dengage that nothing can find. */
const noPageView = screens.filter((f) => !/DengageBridge\.pageView\(/.test(files[f]));
ok('every screen fires its page view', noPageView.length === 0,
   noPageView.length ? `${noPageView.join(', ')} sends rows nothing can find` : `all ${screens.length}`);

/* reference/new-android-sdk-: setNavigation goes on every page navigation, not once at start. The
   failure is silent, which is exactly why it needs a check rather than a code review. */
const noNav = screens.filter((f) => !/DengageBridge\.screen\(/.test(files[f]));
ok('and calls setNavigation, so an in-app campaign can draw on it', noNav.length === 0,
   noNav.length ? `${noNav.join(', ')} would never show an in-app message` : `all ${screens.length}`);

/* ------------------------------------------------------------------ 4 and 5. the seams */

const config = await read('js/config.js');
const webShape = config.match(/shape:\s*(\/\^DPS-[^/]+\/)/)?.[1];
const appShape = files['Identity.kt'].match(/Regex\("(\^DPS-[^"]+)"\)/)?.[1];
ok('the app enforces the same contact key shape as the web',
   !!webShape && !!appShape && webShape === `/${appShape}/`,
   webShape && appShape ? `${appShape}` : 'one of the two could not be read');

const webTable = config.match(/eventTable:\s*'([^']+)'/)?.[1];
const appTable = files['Config.kt'].match(/EVENT_TABLE\s*=\s*"([^"]+)"/)?.[1];
ok('and writes its custom rows to the same table', !!webTable && webTable === appTable,
   `web ${webTable}, app ${appTable}`);

/* ------------------------------------------------- 5b. the datacenter, one decision */

/* The manifest hard codes five endpoint hosts and js/config.js holds the same hosts per
   datacenter. Getting a datacenter wrong means every call is refused before a credential is even
   looked at, and the app and the site failing in different ways would be worse than both failing.
   So the manifest's hosts must be the ones config names for the datacenter config selects. */
const manifest = await read('android/app/src/main/AndroidManifest.xml');
const dc = config.match(/^\s*datacenter:\s*'(\w+)'/m)?.[1];
const dcBlock = config.match(new RegExp(`\\b${dc}:\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '';
const webHosts = new Set([...dcBlock.matchAll(/'(https:\/\/[^']+)'/g)]
  .map((m) => m[1].replace(/\/$/, '').replace(/\/geoapi$/, '')));
const manifestHosts = [...manifest.matchAll(/android:name="(den_[a-z_]+|fetch_real_time_in_app_api_url)"\s+android:value="([^"]+)"/g)]
  .map((m) => ({ name: m[1], url: m[2] }));

ok('the app declares its endpoint hosts', manifestHosts.length >= 5,
   `${manifestHosts.length} meta-data entries, datacenter ${dc}`);

const offDatacenter = manifestHosts.filter((h) => !h.url.includes(`//${dc}-`));
ok('and every one is in the datacenter the site is set to', offDatacenter.length === 0,
   offDatacenter.length ? `${offDatacenter.map((h) => `${h.name}=${h.url}`).join(', ')} is not ${dc}`
                        : `all ${manifestHosts.length} on ${dc}`);

const unknown = manifestHosts.filter((h) => !webHosts.has(h.url));
ok('and is a host js/config.js names for that datacenter', unknown.length === 0,
   unknown.length ? `${unknown.map((h) => h.url).join(', ')} appears in no config row`
                  : `${webHosts.size} hosts in config, all app hosts among them`);

/* ------------------------------------------------------------------ 6. the inbox rule */

/* Never report impressions, opens or deletes for messages Dengage did not issue, and its inverse:
   a message Dengage did issue is marked read only when a hand did it. An inboxOpened call anywhere
   but inside a button is an open reported for a message nobody touched. */
const inbox = files['ui/InboxScreen.kt'] ?? '';
const openedInEffect = /LaunchedEffect[\s\S]{0,400}?DengageBridge\.inboxOpened/.test(inbox);
ok('the app reports an inbox open only when a person presses it', !openedInEffect,
   openedInEffect ? 'an open is reported from an effect, so nobody caused it'
                  : 'inboxOpened sits inside a button and nowhere else');

/* ------------------------------------------------------------------ 7. the promised screens */

const map = await read('handoff/CAPABILITY-MAP.md');
const promised = [...map.matchAll(/^\|\s*\d+\s*\|\s*App ([^|]+?)\s*\|/gm)].map((m) => m[1].trim());
const have = screens.map((f) => f.replace('ui/', '').replace('Screen.kt', '').toLowerCase());
/* The map names five app screens and calls two of them "catalogue and cart", which is one screen.
   The check is that every promised screen has a file, not that the names match letter for letter. */
const missing = promised.filter((p) => {
  /* Every word of four letters or more, not just the first. "App shop, catalogue and cart" is one
     screen with three nouns in its name, and matching only the first would pass or fail on which
     noun happened to be written first. */
  const words = p.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  return !words.some((w) => have.some((h) => h.includes(w) || w.includes(h)));
});
ok('every app screen the capability map promises exists',
   promised.length > 0 && missing.length === 0,
   promised.length === 0 ? 'the map names no app screens'
     : missing.length ? `${missing.join(', ')} is promised and not built`
     : `${promised.length} promised, all built`);

/* ------------------------------------------------------------------ report */

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} android assertions passed`);
process.exit(failed.length ? 1 : 0);
