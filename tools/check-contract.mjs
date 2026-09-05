/* The contract check: what the site sends, against what the backend and Dengage accept.
 *
 * This is the check that was missing, and its absence is why "the website is complete" kept being
 * said and kept not being true. The census compares documents to documents. The browser suite
 * compares the page to itself. Neither could see that js/reco.js had been posting a form the relay
 * did not accept since the day the engine was written, that the relay answered 400 every time, that
 * the browser swallowed it, and that the account page told a prospect the opposite.
 *
 * Ten things are compared, and every one is a seam where two files have to agree:
 *
 *   1. every form the site posts is one the relay accepts
 *   2. every event_type sent is in the vocabulary, and every value in the vocabulary has a writer
 *   3. every SDK call the site makes appears in the supplied Dengage documentation
 *   4. every field the page posts to the relay is read by the relay
 *   5. no sentence shown on screen claims a mechanism the build does not perform
 *   6. the one content that reads the contact cannot reach a transactional send
 *   7. the site's engine and the server's engine name the same rules
 *   8. every custom table column the site writes is one the handoff asks for
 *   9. every custom contact column the backend writes is one the handoff asks for
 *  10. the places the site knows about and the places an outage can be announced for are one list
 *  11. every custom table any function writes to is one the handoff asks somebody to create
 *
 * It reads files. No browser, no network.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(join(ROOT, p), 'utf8');

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const jsFiles = (await readdir(join(ROOT, 'js'))).filter((f) => f.endsWith('.js'));
const js = Object.fromEntries(await Promise.all(
  jsFiles.map(async (f) => [f, await read(`js/${f}`)])));
const allJs = Object.values(js).join('\n');
const relay = await read('supabase/functions/dtelco-lead-relay/index.ts');
const operator = await read('supabase/functions/dtelco-operator/index.ts');
const broadcast = await read('supabase/functions/dtelco-broadcast/index.ts');
const inbox = await read('supabase/functions/dtelco-inbox/index.ts');

/* ---------------------------------------------------------------- 1. forms */

const posted = [...allJs.matchAll(/form:\s*'([a-z_]+)'/g)].map((m) => m[1]);
const accepted = [...(relay.match(/const FORMS = \[([\s\S]*?)\] as const/)?.[1] ?? '')
  .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const refused = [...new Set(posted)].filter((f) => !accepted.includes(f));
ok('every form the site posts is one the relay accepts', refused.length === 0,
   refused.length ? `${refused.join(', ')} would answer 400 unknown form` : `${accepted.length} forms`);

const unused = accepted.filter((f) => !posted.includes(f));
ok('and the relay accepts no form nothing sends', unused.length === 0, unused.join(', '));

/* ---------------------------------------------------------------- 2. event types */

const vocabulary = [...(allJs.match(/var EVENT_TYPES = \[([\s\S]*?)\];/)?.[1] ?? '')
  .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
ok('the event vocabulary is not empty', vocabulary.length > 0, `${vocabulary.length} types`);

/* A writer is one of three things, and missing the last two is how this check first reported four
   false orphans. A literal EV.custom('x'. A signal in the operator's closed list. Or a value the
   page hands to EV.custom through a variable, which the checkout does with its line choice radios:
   the type is the radio's value attribute and never appears beside EV.custom at all. */
const literal = new Set([...allJs.matchAll(/EV\.custom\('([a-z_]+)'/g)].map((m) => m[1]));
const signals = new Set([...(operator.match(/const SIGNALS = \[([\s\S]*?)\] as const/)?.[1] ?? '')
  .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
const asValue = new Set([...allJs.matchAll(/value="([a-z_]+)"/g)].map((m) => m[1]));
/* A fourth, added when the recognition band's impression moved behind the creative engine's cap:
   a type named at a call site that hands it to EV.custom one frame later. report(type, ...) in
   js/creatives.js is that shape, so the type is written where report is called, not where
   EV.custom is. Missing this reported creative_shown as a type no surface sends, on the same day
   the site started sending it more carefully than before. */
const viaReport = new Set([...js['creatives.js'].matchAll(/(?<!\.)\breport\('([a-z_]+)'/g)]
  .map((m) => m[1]));
const viaImpression = new Set([...allJs.matchAll(/impression\('([a-z_]+)'/g)].map((m) => m[1]));

/* Two different questions, and conflating them made this check wrong in both directions. What is
   WRITTEN is what the code names to EV.custom, and every one of those must be in the vocabulary.
   What HAS A WRITER additionally includes a vocabulary entry that appears as a form value, because
   that is a type the page hands over through a variable. A radio value is not itself evidence of an
   event type: the payment method radios carry values that are not events at all. */
const written = new Set([...literal, ...signals, ...viaReport]);
const hasWriter = new Set([...written, ...asValue, ...viaImpression]);

const unknown = [...written].filter((t) => !vocabulary.includes(t));
ok('every event_type written is in the vocabulary', unknown.length === 0, unknown.join(', '));

const orphan = vocabulary.filter((t) => !hasWriter.has(t));
ok('and every value in the vocabulary has a writer', orphan.length === 0,
   orphan.length ? `${orphan.join(', ')} would be a type no surface ever sends` : '');

/* ---------------------------------------------------------------- 3. SDK calls */

/* Every call named in the supplied documentation. A call absent from this list is
   either a typo or a capability nobody has read the contract for; both are worth failing on. */
const DOCUMENTED = new Set([
  // web-push-sdk-setup
  'initialize', 'showCustomPrompt', 'showNativePrompt', 'getNotificationPermission', 'getToken',
  'isPushNotificationsSupported', 'setContactKey', 'getContactKey', 'getDeviceId', 'setDeviceId',
  'setCountry', 'getCountry', 'setTrackingPermission', 'getTrackingPermission',
  'settingLogLevel', 'exportLogs',
  // page-view-events, ecommerce-events, custom-events
  'pageView', 'ec:pageView', 'setCart', 'ec:setCart', 'sendDeviceEvent',
  'ec:addToCart', 'ec:removeFromCart', 'ec:deleteCart', 'ec:beginCheckout',
  'ec:order', 'ec:cancelOrder', 'ec:search', 'ec:addToWishlist', 'ec:removeFromWishlist',
  // tagging-websdk, recommendation-web-sdk, inbox-web-sdk
  'setTags', 'getRecommendation', 'setLanguage', 'setCurrency', 'setLocation',
  'InboxMessageProvider',
]);

const called = new Set([
  ...[...allJs.matchAll(/dengage\('([a-zA-Z:]+)'/g)].map((m) => m[1]),
  ...[...allJs.matchAll(/\bsend\('([a-zA-Z:]+)'/g)].map((m) => m[1]),
]);
const undocumented = [...called].filter((c) => !DOCUMENTED.has(c));
ok('every SDK call the site makes is in the supplied documentation', undocumented.length === 0,
   undocumented.join(', '));

/* ---------------------------------------------------------------- 4. relay fields */

/* Every key the page posts, against every key the relay reads. A field sent and never read is a
   value that reaches Dengage by no route at all, which is how the focus view count was lost. */
const IGNORE = new Set(['form', 'contact_key']);
const sentFields = new Set();
for (const [, block] of allJs.matchAll(/(?:relay|publish)\(\{([\s\S]{0,600}?)\}\)/g)) {
  for (const m of block.matchAll(/(\w+):/g)) sentFields.add(m[1]);
}
const readByRelay = new Set([...relay.matchAll(/body(?:\.(\w+)|\[`(\w+)_\$\{n\}`\])/g)]
  .flatMap((m) => (m[1] ? [m[1]] : [])));
/* The reco columns are read through a template literal, so name them explicitly. */
['reco_product_id_1', 'reco_product_id_2', 'reco_product_id_3'].forEach((k) => readByRelay.add(k));

const ignored = [...sentFields].filter((f) => !IGNORE.has(f) && !readByRelay.has(f));
ok('every field the page posts to the relay is read by the relay', ignored.length === 0,
   ignored.length ? `${ignored.join(', ')} reach Dengage by no route` : `${readByRelay.size} fields read`);

/* ---------------------------------------------------------------- 5. on-screen claims */

/* A sentence shown to a prospect is a promise. Four of six were false when this check was written:
   the site said the recommendation was reused in every channel while the relay rejected it, and
   said an NPS score became a contact tag while no tag was ever written. Each claim below names the
   code that has to exist for the sentence to be true. */
const CLAIMS = [
  { says: /written to the contact/, needs: () => accepted.includes('recommendation'),
    why: 'the relay must accept form recommendation' },
  { says: /becomes a tag|written twice|filter on/, needs: () => /EV\.tags\(/.test(allJs),
    why: 'something must call EV.tags' },
  { says: /custom event table/, needs: () => /EV\.custom\(/.test(allJs),
    why: 'something must call EV.custom' },
  { says: /a segment changes while the room is watching/, needs: () => /count_before/.test(operator),
    why: 'the operator must report a before and after count' },
];
const pages = await readdir(join(ROOT, 'pages'));
const screen = allJs + '\n' + (await Promise.all(
  pages.filter((f) => f.endsWith('.html')).map((f) => read(`pages/${f}`)))).join('\n');

const broken = CLAIMS.filter((c) => c.says.test(screen) && !c.needs());
ok('no sentence on screen claims a mechanism the build does not perform', broken.length === 0,
   broken.map((c) => c.why).join('; '));

/* The claims that must NOT survive, because the documentation says they are wrong however much
   code exists. A transactional send cannot read a contact column, so no page may promise one. */
const FORBIDDEN = [
  { says: /printed by every channel/, why: 'a transactional send cannot read a contact column' },
  { says: /written as a contact tag/, why: 'setTags keys on the device, not the contact' },
  { says: /reused in every channel/, why: 'recommendations reach marketing channels only' },
];
const survives = FORBIDDEN.filter((c) => c.says.test(screen));
ok('and no sentence promises what the documentation rules out', survives.length === 0,
   survives.map((c) => c.why).join('; '));


/* ------------------------------------------------- 6. what a transactional send cannot be given */

/* reference/customization-in-transactional-messages is flat about it: "Contact columns and Device
   data cannot be used for personalization" in a transactional send, and "all dynamic values must
   be provided within the API call". So a body that reads the contact is not merely a bad choice
   for a transactional call, it is a message with holes in it. One body reads the contact on
   purpose. This is the seam that keeps it the only one, and keeps it off that path.
 *
 * Three ways it could go wrong, and all three are checked rather than trusted:
 * a body reads the contact without being marked; a body is marked without reading anything; or
 * the demo's own transactional sender is handed the marked moment. */

const values = Object.fromEntries(await Promise.all(
  (await readdir(join(ROOT, 'panel/values'))).filter((f) => f.endsWith('.json'))
    .map(async (f) => [f.replace(/\.json$/, ''), JSON.parse(await read(`panel/values/${f}`))])));
const bodies = Object.fromEntries(await Promise.all(
  (await readdir(join(ROOT, 'panel/email'))).filter((f) => f.endsWith('.html') && !f.startsWith('_'))
    .map(async (f) => [f.replace(/\.html$/, ''), await read(`panel/email/${f}`)])));

const readsContact = Object.entries(bodies).filter(([, b]) => b.includes('$Contact.')).map(([k]) => k);
const marked = Object.entries(values).filter(([, v]) => v.sends === 'marketing').map(([k]) => k);
ok('every body that reads the contact is recorded as a marketing send',
   readsContact.every((id) => marked.includes(id)),
   readsContact.filter((id) => !marked.includes(id)).join(', '));
ok('and every body recorded as one reads the contact',
   marked.every((id) => readsContact.includes(id)),
   marked.filter((id) => !readsContact.includes(id)).join(', '));

/* The demo's own transactional sender takes a content id from the caller, so the guard has to be
   that nothing in the site or the console names a marketing moment on that path. */
const message = await read('supabase/functions/dtelco-message/index.ts');
const console_ = await read('verify/index.html');
const onTxPath = marked.filter((id) => message.includes(id) || console_.includes(id) ||
                                       allJs.includes(id));
ok('and nothing hands a marketing only moment to the transactional sender', onTxPath.length === 0,
   onTxPath.join(', '));

/* A moment that reads the contact must not carry a push either, and for a second reason:
   reference/advanced-personalization says $Contact "can be null in Push sends". The builder
   refuses to write one; this is the check that the moment file did not quietly gain one. */
const contents = JSON.parse(await read('panel/contents.json'));
const contactMoments = contents.moments.filter((m) => m.reads === 'contact');
ok('a moment that reads the contact carries no push',
   contactMoments.every((m) => !m.push), contactMoments.filter((m) => m.push)
     .map((m) => m.id).join(', '));
ok('and the moment that reads the contact is the one with the marketing body',
   contactMoments.map((m) => m.id).sort().join(',') === marked.slice().sort().join(','),
   `${contactMoments.map((m) => m.id).join(', ')} vs ${marked.join(', ')}`);

/* Every table any content queries, against the feed this repository uploads. A body naming a
   column the product API does not carry renders empty in the panel and nowhere reports why. */
const feedHead = (await read('handoff/dtelco-product.csv')).split('\n')[0]
  .replace(/^﻿/, '').trim().split(',');
const queried = [...Object.values(bodies).join('\n')
  .matchAll(/\$from\("(\w+)"\)(?:\.where\("(\w+)")?/g)];
const badTable = [...new Set(queried.map((m) => m[1]))].filter((t) => t !== 'product');
ok('every content query names the product table the product API defines', badTable.length === 0,
   badTable.join(', '));
const badColumn = [...new Set(queried.map((m) => m[2]).filter(Boolean))]
  .filter((c) => !feedHead.includes(c));
ok('and filters on a column the feed carries', badColumn.length === 0, badColumn.join(', '));


/* ---------------------------------------------- 7. the two recommendation engines, reconciled */

/* The site recommends from the page, the profile endpoint recommends from the operator's data,
 * and the app calls the endpoint. So a rule the endpoint names that the site has never heard of
 * is a readout that says one thing on the phone and another on the laptop, in front of the
 * prospect, with the rule name printed under each card.
 *
 * That is not hypothetical. The endpoint carried a comment claiming "the same priority order the
 * web engine uses" above code that ran device_cross_sell and plan_cross_sell, two names the site
 * does not have, and skipped four rules the comment named. This is the check that keeps the
 * sentence true.
 */
const profileFn = await read('supabase/functions/dtelco-profile/index.ts');
/* Read from the two call shapes the engine uses rather than from any list it keeps, so a rule
   added without being listed is still seen. A rule name can carry a digit, usage_80 being the
   one that matters most, and a character class of [a-z_] silently dropped it from every
   comparison below on the first run of this check. */
const NAME = "[a-z0-9_]+";
const webRules = new Set();
[...js['reco.js'].matchAll(new RegExp(`related\\([^,]+,\\s*'${NAME}',\\s*out,\\s*'(${NAME})'`, 'g'))]
  .forEach((m) => webRules.add(m[1]));
[...js['reco.js'].matchAll(new RegExp(`pushUnique\\(out,\\s*[\\w.]+,\\s*'(${NAME})'`, 'g'))]
  .forEach((m) => webRules.add(m[1]));

const backendRules = [...(profileFn.match(/const RULES = \[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(new RegExp(`'(${NAME})'`, 'g'))].map((m) => m[1]);
const needsPage = [...(profileFn.match(/rules_needing_the_page: \[([\s\S]*?)\]/)?.[1] ?? '')
  .matchAll(new RegExp(`'(${NAME})'`, 'g'))].map((m) => m[1]);

ok('the profile endpoint publishes the rules it runs', backendRules.length > 0,
   backendRules.join(', '));
const invented = backendRules.filter((r) => !webRules.has(r));
ok('and every one of them is a rule the site also runs', invented.length === 0,
   invented.length ? `${invented.join(', ')} exist only on the server` : `${backendRules.length} shared`);

const unexplained = [...webRules].filter((r) => !backendRules.includes(r) && !needsPage.includes(r));
ok('and every site rule it does not run is named as needing the page', unexplained.length === 0,
   unexplained.join(', '));
const phantom = needsPage.filter((r) => !webRules.has(r));
ok('and nothing is excused that the site does not run either', phantom.length === 0,
   phantom.join(', '));

/* Every rule the endpoint runs reads a value the endpoint actually sends, which is how the
   traveller rule was found reading sub.roaming_days when roaming_days is a column on the usage
   table. It had a second condition broad enough to hide it for the life of the build. */
ok('the family rule can fire, because the profile carries lines_at_address',
   profileFn.includes('lines_at_address') && js['reco.js'].includes('lines_at_address'),
   'the site reads it and the endpoint sends it');
ok('and the upgrade creative can fire, because the profile carries contract_days',
   profileFn.includes('contract_days') && allJs.includes('contract_days'));

/* Every creative flag has a writer that is not the launcher. Four of five did not, so a rule
   saying "the line is past 80 percent" only ever fired because somebody pressed a button. */
const creatives = js['creatives.js'];
const flagsRead = [...creatives.matchAll(/flags\(\)\.(\w+)/g)].map((m) => m[1]);
const flagsWritten = new Set([...allJs.matchAll(/setFlag\('(\w+)'/g)].map((m) => m[1]));
[...allJs.matchAll(/SIGNAL_FLAGS = \{([\s\S]*?)\}/g)].forEach((m) => {
  [...m[1].matchAll(/:\s*'(\w+)'/g)].forEach((f) => flagsWritten.add(f[1]));
});
const unwritten = [...new Set(flagsRead)].filter((f) => !flagsWritten.has(f));
ok('every flag a creative rule reads is written by the page or the operator, not only the launcher',
   unwritten.length === 0,
   unwritten.length ? `${unwritten.join(', ')} can only be set by hand` : `${flagsRead.length} flags`);


/* ------------------------------------------- 8. the custom table's columns, against the handoff */

/* A custom Data Space table must exist before rows are stored, and until
 * it does every row is accepted and stored nowhere with no error. The same is true one level down.
 * A column the page writes that the table does not have is a value dropped in silence, and no
 * amount of green in this repository would show it, because the loss happens in the account.
 *
 * So the columns the site writes are read from the code and compared against the table the handoff
 * document tells the account owner to create. Adding a field to a payload without adding it there is
 * the failure this catches.
 */
const contract = await read('handoff/ACCOUNT-SETUP.md');
const REQUIRED = ['event_id', 'event_type', 'is_used'];
const payloadCols = new Set();
for (const m of allJs.matchAll(/EV\.custom\([^,]+,\s*\{([\s\S]{0,400}?)\}\s*\)/g)) {
  for (const k of m[1].matchAll(/(\w+):/g)) payloadCols.add(k[1]);
}
/* The creative engine builds its payload in one place and passes it through report(), so its
   columns are named there rather than beside an EV.custom call. */
for (const m of js['creatives.js'].matchAll(/EV\.custom\(type,\s*\{([\s\S]{0,400}?)\}\s*\)/g)) {
  for (const k of m[1].matchAll(/(\w+):/g)) payloadCols.add(k[1]);
}
const columns = [...new Set([...REQUIRED, ...payloadCols])];
ok('the site writes a knowable set of custom table columns', columns.length > REQUIRED.length,
   `${columns.length} columns`);

const documented = columns.filter((c) => new RegExp(`\\\`${c}\\\``).test(contract));
const undocumentedCols = columns.filter((c) => !documented.includes(c));
ok('and every one of them is in the table the handoff asks for',
   undocumentedCols.length === 0,
   undocumentedCols.length
     ? `${undocumentedCols.join(', ')} would be accepted and stored nowhere`
     : `${columns.length} columns, all named in ACCOUNT-SETUP.md`);


/* ---------------------------------------- 9. the contact's custom columns, against the handoff */

/* The same failure as the custom table, one level up, and it had already happened. Twelve columns
 * declared on master_contact had no writer anywhere: a segment on plan_name or a message
 * printing $Contact.lifecycle finds them empty with no error at either end.
 *
 * Now that two functions write them, the check runs both ways. Every column either writer sends
 * has to be one the handoff asks for, or it is accepted and stored nowhere.
 */
const seed = await read('supabase/functions/dtelco-persona-seed/index.ts');
const STANDARD = new Set(['contact_key', 'name', 'surname', 'email', 'gsm', 'city',
                          'email_permission', 'gsm_permission']);
const contactCols = new Set([
  ...[...relay.matchAll(/put\('(\w+)'/g)].map((m) => m[1]),
  ...[...relay.matchAll(/contact\.(\w+)\s*=/g)].map((m) => m[1]),
  /* Written through a template literal, so named here for the same reason the relay field check
     names them. */
  'reco_product_id_1', 'reco_product_id_2', 'reco_product_id_3',
  ...[...(seed.slice(seed.indexOf('return subs.map'), seed.indexOf('Deno.serve')))
    .matchAll(/^\s+(\w+):/gm)].map((m) => m[1]),
]);
const customCols = [...contactCols].filter((c) => !STANDARD.has(c));
ok('the build writes a knowable set of custom contact columns', customCols.length > 0,
   `${customCols.length} custom, ${contactCols.size} in total`);

const missingCols = customCols.filter((c) => !new RegExp(`\`${c}\``).test(contract));
ok('and every one is in the list the handoff asks for',
   missingCols.length === 0,
   missingCols.length
     ? `${missingCols.join(', ')} would be accepted and stored nowhere`
     : `${customCols.length} columns, all named in ACCOUNT-SETUP.md`);

/* The contact carries only what a mechanism reads from the contact; the rest of the operator's
   record is served relationally. Two invariants keep that decision from rotting. The three card
   columns must keep their writer, or a message printing $Contact.lifecycle goes quietly empty
   again. And every column the old design carried must be either written or explicitly re-homed
   in the setup document's star schema table, so a value can be moved but never silently lost:
   that table is where last_nps, the watch columns and the operator's line facts now point at
   the tag, the view or the subscriber table that serves them. */
const CARD = ['plan_name', 'lifecycle', 'contract_end'];
const REHOMED = ['msisdn', 'plan_id', 'plan_type', 'arpu_band', 'esim', 'device_model',
                 'family_lines', 'preferred_store', 'preferred_channel', 'city', 'last_nps',
                 'last_watch_product_id', 'last_watch_list', 'focus_product_brand',
                 'focus_product_category', 'focus_product_title', 'focus_product_price',
                 'whatsapp_consent', 'reco_at'];
const starTable = contract.slice(contract.indexOf('Served by the star schema instead'));
const lost = REHOMED.filter((c) => !starTable.includes(`\`${c}\``));
ok('every column the contact no longer carries is re-homed, not lost', lost.length === 0,
   lost.length ? `${lost.join(', ')} was dropped and nothing says what serves it now`
               : `${REHOMED.length} re-homed in ACCOUNT-SETUP.md`);
const stillWritten = REHOMED.filter((c) => contactCols.has(c));
ok('and nothing still writes a re-homed column', stillWritten.length === 0,
   stillWritten.length ? `${stillWritten.join(', ')} is written but not in the panel list, so the whole upsert is refused`
                       : 'writers and the panel list agree');
const noWriter = CARD.filter((c) => !contactCols.has(c));
ok('and the contact card columns keep their writer', noWriter.length === 0,
   noWriter.length ? `${noWriter.join(', ')} would be empty on every contact` : 'all three');

/* ------------------------------------------------- 10. the places, one list */

/* The checkout writes a city onto a contact and the outage broadcast puts a city into a push
   title. Two lists that drifted apart would mean a fault announced for a town no customer of this
   operator is recorded in, or a customer in a town no fault can ever be announced for. Neither is
   visible from either file alone, which is what makes it a seam. */

const siteCities = [...(js['config.js'].match(/cities:\s*\[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);
const outageCities = [...(broadcast.match(/const CITIES = \[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1]);

ok('the site names the places it serves in one place', siteCities.length > 0,
   siteCities.length ? `${siteCities.length} in js/config.js` : 'cities is missing from config');

const cityDrift = [
  ...siteCities.filter((c) => !outageCities.includes(c)).map((c) => `${c} has no outage`),
  ...outageCities.filter((c) => !siteCities.includes(c)).map((c) => `${c} has no customers`),
];
ok('and an outage can only be announced for a place the site serves', cityDrift.length === 0,
   cityDrift.length ? cityDrift.join(', ') : `the same ${siteCities.length}, both files`);

/* No page may hardcode the list again. Hoisting it was the fix; this is what keeps it fixed. */
const rehardcoded = Object.entries(js)
  .filter(([f, src]) => f !== 'config.js' && /'Sumqayit'|'Mingachevir'/.test(src))
  .map(([f]) => f);
ok('and no page keeps a second copy of it', rehardcoded.length === 0,
   rehardcoded.length ? `${rehardcoded.join(', ')} would drift silently` : 'config.js only');

/* The one endpoint here that reaches more than one person, and the one that could falsify a
   Dengage report. Both refusals are load bearing and both are one edit from being removed. */
ok('the broadcast refuses to send without an explicit confirmation',
   /body\.confirm !== true/.test(broadcast),
   /body\.confirm !== true/.test(broadcast)
     ? 'confirm: true, and the console spends two presses on it'
     : 'a mis-click would reach everyone');

const inboxCode = inbox.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'[^']*'/g, "''");
const inboxRefuses = /req\.method === 'POST'/.test(inbox);
const inboxWrites = /inbox\/events/.test(inboxCode);
ok('and the agent mailbox reads without ever reporting an event',
   inboxRefuses && !inboxWrites,
   inboxWrites ? 'it names the events endpoint outside a comment'
     : !inboxRefuses ? 'POST is no longer refused'
     : 'POST answers 405: an agent reading is not the customer reading');

/* ------------------------------------------- 11. every table a function writes has a setup step */

/* A custom Data Space table that does not exist accepts every row and stores none of them, with no
   error at either end. That is the quietest failure in the whole build, and it is why every table
   name a function can write to has to appear in the setup checklist somebody works from.
   dtelco_bss_events was written by the operator for weeks and named in no document, so nobody
   would have created it and no count would have moved. Read from the function sources rather than
   from a list here, so a table added tomorrow is held to the same rule. */
const fnDir = 'supabase/functions';
const tableNames = new Set();
for (const name of await readdir(join(ROOT, fnDir))) {
  let src;
  try { src = await read(`${fnDir}/${name}/index.ts`); } catch { continue; }
  for (const m of src.matchAll(/Deno\.env\.get\('DTELCO_\w*EVENT_TABLE'\)\s*\?\?\s*'([\w]+)'/g)) {
    tableNames.add(m[1]);
  }
}
const setupDoc = await read('handoff/ACCOUNT-SETUP.md');
const uncreated = [...tableNames].filter((t) => !setupDoc.includes('`' + t + '`'));
ok('every custom table a function writes to has a setup step',
   tableNames.size > 0 && uncreated.length === 0,
   uncreated.length ? `${uncreated.join(', ')} is written and nobody is asked to create it`
                    : `${[...tableNames].join(', ')}, all in ACCOUNT-SETUP.md`);

/* ---------------------------------------------------------------- report */

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} contract assertions passed`);
process.exit(failed.length ? 1 : 0);
