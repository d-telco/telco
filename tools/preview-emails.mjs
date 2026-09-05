/* The email renderer, the template model.
 *
 * The panel's preview cannot resolve $Current, so a template that looks right in the panel can
 * still send with a hole in it. This substitutes the two constructs the panel's template language
 * uses, renders every body twice, and reports any tag it could not resolve.
 *
 * Twice is the point. Once with every value given, which proves the detail rows draw. Once with
 * only the values marked always in panel/values, which is what a real transactional call carries
 * on its worst day, and proves that what is left still reads as a message rather than a form with
 * blanks in it. A subject line, a headline, a hero and a button that survive the second pass are
 * the whole guarantee.
 *
 * Nothing here sends. It writes the two renderings to panel/preview so a person can look at them.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/* The pack is laid out by lane, transactional or campaign, so the folder answers which message
   goes which way. The renderer reads both sides and keeps a map from body file to its home. */
const LANES = ['transactional', 'campaign'];
const EMAIL_OF = new Map();
for (const lane of LANES) {
  const dir = join(ROOT, 'panel', lane, 'email');
  for (const f of readdirSync(dir)) { if (f.endsWith('.html')) EMAIL_OF.set(f, dir); }
}
const emailPath = (f) => join(EMAIL_OF.get(f), f);
const VALUES = join(ROOT, 'panel/values');
const PREVIEW = join(ROOT, 'panel/preview');

/* Demo values, and every figure here is demo data. They exist to prove a template resolves, not
   to be quoted: the real values travel in the call. */
const DEMO = {
  hero_image: 'https://d-telco.github.io/telco/assets/catalog/dev-iphone-17-pro-1200.jpg',
  link: 'https://d-telco.github.io/telco/product.html?id=dev-iphone-17-pro',
  product: 'iPhone 17 Pro',
  price: '$1,199.00',
  amount: '$1,399.00',
  saving: '$200.00',
  balance: '$18.40',
  reward: '$10.00',
  order_id: 'DPS-dtelco-order-1788490000',
  msisdn: '+994 55 555 0001',
  plan_name: 'GO 11.99',
  next_data: '18 GB',
  next_plan: 'GO 29.99',
  next_price: '$29.99',
  due_date: '18 September 2026',
  destination: 'Istanbul',
  pack: 'Roaming 5 GB for 7 days',
  days: '14',
  lines: '3',
  /* Coupon shaped, because that is what a recipient actually gets. docs/coupon: a generated
     code is an optional prefix plus 8 random letters and numbers, so a preview showing a
     shared word would show the one thing the journey no longer does. */
  code: 'DTELCO-7K2M4Q9X',
  campaign: 'Back to school',
  downsell: 'GO 17.99 at the GO 11.99 price for six months',
};

/* The two constructs, and only those two. A third would mean the generator emitted something the
   panel cannot read, so this deliberately does not try to be a JavaScript engine. */
const IF_BLOCK = /\{%\s*if\s*\(\s*\$Current\.(\w+)\s*\)\s*\{\s*%\}([\s\S]*?)\{%\s*\}\s*(?:else\s*\{\s*%\}([\s\S]*?)\{%\s*\}\s*)?%\}/g;
const PRINT = /\{%=\s*\$Current\.(\w+)(?:\s*\|\|\s*'([^']*)')?\s*%\}/g;
const CONTACT = /\{%=\s*\$Contact\.(\w+)\s*%\}/g;

function render(html, values) {
  let out = html;
  let guard = 0;
  /* Conditions first, so a tag inside a block that did not draw is never counted as a hole. What
     survives this pass is what a visitor would actually be sent. */
  while (IF_BLOCK.test(out) && guard++ < 12) {
    IF_BLOCK.lastIndex = 0;
    out = out.replace(IF_BLOCK, (_, token, yes, no) =>
      (values[token] !== undefined && values[token] !== '' ? yes : (no ?? '')));
  }
  /* A tag with no value and no fallback is the failure this file exists to catch. Substituting it
     with an empty string, which the first version of this renderer did, makes every template look
     perfect and reports nothing: the hole simply becomes invisible, here and in the inbox. */
  const missing = new Set();
  out = out.replace(PRINT, (_, token, fallback) => {
    const v = values[token];
    if (v !== undefined && v !== '') return String(v);
    if (fallback !== undefined) return fallback;
    missing.add(token);
    return `[[unresolved:${token}]]`;
  });
  /* $Contact is empty on a transactional send. Rendering it empty is the behaviour rather than a
     fault, and the check below is that no template depends on it. */
  out = out.replace(CONTACT, '');
  return { html: out, missing: [...missing] };
}

function unresolved(r) {
  return [...r.missing, ...[...r.html.matchAll(/\{%[^}]*%\}/g)].map(m => m[0])];
}

mkdirSync(PREVIEW, { recursive: true });
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

/* ------------------------------------------------------------------ the recommendation body
 *
 * Nineteen bodies print $Current and are checked by substitution above, because substitution is
 * all Dengage does to them. The twentieth is different in kind: Dengage runs it. It queries the
 * product table for each id held on the contact and draws a card per row that comes back, so a
 * regex cannot tell whether it works. Only running it can.
 *
 * So this runs it. The two constructs the panel's template language uses, {% code %} and
 * {%= value %}, compile to a JavaScript function exactly as reference/advanced-personalization
 * describes them, and $from is backed by the catalogue this repository commits and uploads. What
 * that proves is the thing the demo claims out loud: the three ids the website's own engine chose
 * and wrote to the contact are the three products the email prints, with the same titles, the
 * same prices and the same links as the rail the visitor saw.
 */

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, '').trim());
  return rows.filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const CATALOGUE = parseCsv(readFileSync(join(ROOT, 'handoff/dtelco-product.csv'), 'utf8'));

/* $from, as reference/advanced-personalization defines it, over the committed catalogue. Table and
   column names are compared case sensitively because that page says they are: "db_table_name:
   Case-sensitive table name on the database". A body naming a table this account does not have is
   the failure this reproduces rather than hides. */
const TABLES = { product: CATALOGUE };

function makeFrom(seen) {
  return function $from(table) {
    seen.tables.add(table);
    const rows = TABLES[table];
    if (!rows) throw new Error(`$from("${table}") names a table the catalogue does not have`);
    let set = rows.slice();
    const q = {
      where(col, op, val) {
        seen.columns.add(col);
        if (!(col in rows[0])) throw new Error(`${table} has no column ${col}`);
        const cmp = { '=': (a, b) => a === b, '<>': (a, b) => a !== b,
                      '>': (a, b) => a > b, '<': (a, b) => a < b };
        if (!cmp[op]) throw new Error(`$from does not document the operator ${op}`);
        set = set.filter((r) => cmp[op](r[col], String(val)));
        return q;
      },
      order(col, dir) {
        set.sort((a, b) => (dir === 'DESC' ? -1 : 1) * String(a[col]).localeCompare(String(b[col])));
        return q;
      },
      take(n) { set = set.slice(0, n); return q; },
      skip(n) { set = set.slice(n); return q; },
      random() { return q; },
      get() { return set; },
      first() { return set[0] ?? null; },
      value(col) { seen.columns.add(col); return set[0] ? set[0][col] : null; },
    };
    return q;
  };
}

/* {% code %} and {%= value %} compiled to one function, which is what running the template means.
   Nothing here is a Dengage internal: the two delimiters are the whole language the panel's Code
   Editor takes, and everything between them is JavaScript. */
function compile(template) {
  let src = 'let __out = "";\n';
  const re = /\{%(=)?([\s\S]*?)%\}/g;
  let at = 0, m;
  while ((m = re.exec(template))) {
    src += `__out += ${JSON.stringify(template.slice(at, m.index))};\n`;
    src += m[1] ? `__out += __print(${m[2]});\n` : `${m[2]}\n`;
    at = re.lastIndex;
  }
  src += `__out += ${JSON.stringify(template.slice(at))};\nreturn __out;`;
  return new Function('$Contact', '$Current', '$from', '$blockSend', '__print', src);
}

function runTemplate(template, { contact = {}, current = {} } = {}) {
  const seen = { tables: new Set(), columns: new Set() };
  const blocked = [];
  const print = (v) => (v === undefined || v === null ? '' : String(v));
  /* A template that names a table or a column the account has not got throws here rather than
     rendering. Reporting it as a failure instead of letting it end the process is the difference
     between a run that says which body is wrong and a stack trace that says which line of this
     file noticed. */
  try {
    const html = compile(template)(contact, current, makeFrom(seen),
                                   (why) => blocked.push(why), print);
    return { html, blocked, seen, threw: null };
  } catch (e) {
    return { html: '', blocked, seen, threw: e.message };
  }
}

/* Distinct demo values, so a rendering that shows the wrong value somewhere is visible to a person
   reading panel/preview rather than hidden behind two fields that happen to say the same thing. */
const seen = new Map();
for (const [k, v] of Object.entries(DEMO)) {
  if (seen.has(v)) throw new Error(`demo values must be distinct: ${k} and ${seen.get(v)} are both ${v}`);
  seen.set(v, k);
}

const bodies = [...EMAIL_OF.keys()].filter(f => !f.startsWith('_')).sort()
  .map(f => f.replace(/\.html$/, ''));

/* A count here was a trap waiting to be sprung: it passes whichever body is missing so long as
   another was added. The seam is contents.json, so compare against it by name. */
const contents = JSON.parse(readFileSync(join(ROOT, 'panel/contents.json'), 'utf8'));
const withEmail = contents.moments.filter(m => m.email).map(m => m.id).sort();
ok('there is one email body per moment that has email copy',
   JSON.stringify(bodies) === JSON.stringify(withEmail),
   `bodies without a moment: ${bodies.filter(b => !withEmail.includes(b)).join(', ') || 'none'}; ` +
   `moments without a body: ${withEmail.filter(b => !bodies.includes(b)).join(', ') || 'none'}`);

const spec_of = id => JSON.parse(readFileSync(join(VALUES, `${id}.json`), 'utf8'));
const marketing = bodies.filter(id => spec_of(id).sends === 'marketing');
const files = bodies.filter(id => !marketing.includes(id)).map(id => `${id}.html`);

for (const file of files) {
  const id = file.replace(/\.html$/, '');
  const html = readFileSync(emailPath(file), 'utf8');
  const spec = JSON.parse(readFileSync(join(VALUES, `${id}.json`), 'utf8'));

  const all = Object.fromEntries([...spec.always, ...spec.optional]
    .map(t => [t, DEMO[t]]));
  const missing = Object.entries(all).filter(([, v]) => v === undefined).map(([k]) => k);
  ok(`${id}: every value it names has a demo value`, missing.length === 0, missing.join(', '));

  const fullPass = render(html, all);
  const minPass = render(html, Object.fromEntries(spec.always.map(t => [t, DEMO[t]])));
  const withAll = fullPass.html, onlyAlways = minPass.html;

  ok(`${id}: resolves with every value given`, unresolved(fullPass).length === 0,
     unresolved(fullPass).join(' '));
  ok(`${id}: resolves with only the always sent values`, unresolved(minPass).length === 0,
     unresolved(minPass).join(' '));

  /* The guarantee that matters. On the minimal pass the parts a visitor reads first must still
     carry text: an empty subject, headline or button is what an always sent value is for. */
  const headline = onlyAlways.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].trim() ?? '';
  const cta = onlyAlways.match(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  const hero = onlyAlways.match(/<img src="([^"]*)" width="520"/)?.[1] ?? '';
  ok(`${id}: the headline still reads on the minimal pass`, headline.length > 3, headline);
  ok(`${id}: the button still points somewhere`, !!cta && /^https?:\/\//.test(cta[1]),
     cta?.[1] ?? 'no button');
  ok(`${id}: the hero still has an address`, /^https?:\/\//.test(hero), hero);

  /* Each optional value draws on the full pass and is gone on the minimal one. Counting rows was
     not enough: dropping the condition from one row still left the totals different, because the
     other rows were still conditional, and the check passed on a template that would send a
     label with nothing after it. Naming each value is the check that bites. */
  const cell = (label) => `>${label}</td>`;
  const optionalRows = spec.rows.filter(([, t]) => spec.optional.includes(t));
  const absent = optionalRows.filter(([label]) => !withAll.includes(cell(label)));
  const leaked = optionalRows.filter(([label]) => onlyAlways.includes(cell(label)));
  ok(`${id}: every optional row draws when its value is sent`, absent.length === 0,
     absent.map(([l]) => l).join(', '));
  ok(`${id}: and none of them draws when it is not`, leaked.length === 0,
     leaked.map(([l]) => l).join(', '));
  const alwaysRows = spec.rows.filter(([, t]) => spec.always.includes(t));
  ok(`${id}: the rows whose value is always sent always draw`,
     alwaysRows.every(([label]) => onlyAlways.includes(cell(label))),
     alwaysRows.filter(([l]) => !onlyAlways.includes(cell(l))).map(([l]) => l).join(', '));

  ok(`${id}: the unsubscribe link is left for Dengage to fill`,
     withAll.includes('{{unsubscribe-link}}'));
  ok(`${id}: nothing in it depends on a contact column`, !html.includes('$Contact'));

  writeFileSync(join(PREVIEW, `${id}.all.html`), withAll);
  writeFileSync(join(PREVIEW, `${id}.minimal.html`), onlyAlways);
}

/* The tag check is a diagnostic rather than a message, so it is allowed to print $Contact, and it
   is the one file that must. */
const tagCheck = readFileSync(emailPath('_tag-check.html'), 'utf8');
ok('the tag check prints $Contact, which is what it is for', tagCheck.includes('$Contact.name'));
ok('and covers every value any body names',
   [...new Set(files.flatMap(f => JSON.parse(
     readFileSync(join(VALUES, f.replace(/\.html$/, '.json')), 'utf8')).always))]
     .every(t => tagCheck.includes(`$Current.${t}`)));


/* ---------------------------------------------- the recommendation body, run rather than matched
 *
 * Four passes, and each one is a state a real contact is in. Three ids stored, which is the
 * ordinary case and the claim the demo makes out loud. One id, because a session that saw one
 * product still deserves a message. An id the catalogue no longer carries, because a product goes
 * out of the feed and the message must lose one card rather than print a broken image. And none
 * at all, which must cancel the send rather than deliver an empty rail.
 */
ok('exactly one email body reads the contact', marketing.length === 1, marketing.join(', '));

for (const id of marketing) {
  const template = readFileSync(emailPath(`${id}.html`), 'utf8');
  const spec = spec_of(id);

  /* Three real catalogue rows, taken from the feed this repository uploads to Dengage rather than
     typed in here. A handset, an accessory and a plan, which is the shape the site's own rules
     produce: one product in front of the visitor, one that goes with it, one that changes the
     bill. Picking them by category rather than by id means a renamed product fails this check
     instead of slipping past it. */
  const firstIn = (path) => CATALOGUE.find(r => r.category_path === path &&
    r.is_active === 'TRUE' && Number(r.stock_count) > 0);
  const wanted = ['Shop>Phones', 'Shop>Accessories', 'Mobile>Plans>Prepaid GO'];
  const picks = wanted.map(firstIn);
  ok(`${id}: the three products this check uses are in the committed catalogue`,
     picks.every(Boolean),
     wanted.filter((_, i) => !picks[i]).join(', '));
  if (!picks.every(Boolean)) break;

  const contactWith = (...ids) => Object.fromEntries(
    ids.map((v, i) => [`reco_product_id_${i + 1}`, v]));
  const cards = html => [...html.matchAll(/<a href="([^"]*)"\s*\n?\s*style="font-size:14px/g)]
    .map(m => m[1]);

  const three = runTemplate(template, { contact: contactWith(...picks.map(p => p.product_id)) });
  ok(`${id}: it runs against the tables and columns the catalogue has`, three.threw === null,
     three.threw ?? '');
  ok(`${id}: three stored ids draw three cards`, cards(three.html).length === 3,
     `${cards(three.html).length} cards`);
  ok(`${id}: and nothing is left unresolved`, !/\{%/.test(three.html),
     (three.html.match(/\{%[^%]*%\}/) ?? [''])[0]);
  ok(`${id}: nothing is blocked when the contact has ids`, three.blocked.length === 0,
     three.blocked.join('; '));

  /* The claim itself. Every value the email prints for a pick is the value the catalogue holds for
     that id, which is the same catalogue the storefront reads. Same three, same order, same
     titles, same prices, same links. */
  const order = picks.map(p => p.link);
  ok(`${id}: the cards are the same three products, in the order the site chose`,
     JSON.stringify(cards(three.html)) === JSON.stringify(order),
     cards(three.html).join(' | '));
  /* The price the storefront prints, not the list price. js/site.js draws every card from
     discounted_price, so a message quoting price would show a higher number than the rail the
     visitor just read. Where the two differ the check bites; where they agree it still proves the
     figure came from the catalogue rather than from this file. */
  for (const p of picks) {
    ok(`${id}: it prints the catalogue title and the price the shop shows for ${p.product_id}`,
       three.html.includes(p.title) && three.html.includes(`$${p.discounted_price}`) &&
       three.html.includes(p.image_link),
       `${p.title} / $${p.discounted_price}`);
    if (p.price !== p.discounted_price) {
      ok(`${id}: and not the list price for ${p.product_id}`,
         !three.html.includes(`$${p.price}`), `list ${p.price}, shop ${p.discounted_price}`);
    }
  }

  const one = runTemplate(template, { contact: contactWith(picks[0].product_id) });
  ok(`${id}: one stored id draws one card`, cards(one.html).length === 1,
     `${cards(one.html).length} cards`);

  const stale = runTemplate(template, {
    contact: contactWith(picks[0].product_id, 'dev-withdrawn-from-the-feed', picks[2].product_id) });
  ok(`${id}: an id the catalogue dropped costs one card and not the message`,
     cards(stale.html).length === 2 && !stale.html.includes('dev-withdrawn-from-the-feed'),
     `${cards(stale.html).length} cards`);

  const none = runTemplate(template, { contact: {} });
  ok(`${id}: no stored id cancels the send`, none.blocked.length === 1, none.blocked.join('; '));
  ok(`${id}: and says why, in the words the values file records`,
     none.blocked[0] === spec.blocks_when, `${none.blocked[0]} vs ${spec.blocks_when}`);
  ok(`${id}: and draws no card`, cards(none.html).length === 0, `${cards(none.html).length} cards`);

  /* The table and the columns it queries, compared against the feed this repository uploads. A
     body naming a column the product feed does not carry would render here and print nothing in
     the panel, which is the failure mode that is impossible to see from a screenshot. */
  ok(`${id}: it queries the table the product API names`,
     [...three.seen.tables].join(',') === spec.resolves_from, [...three.seen.tables].join(', '));
  const head = Object.keys(CATALOGUE[0]);
  const strange = spec.resolves_columns.filter(c => !head.includes(c));
  ok(`${id}: every column it names is in the product feed`, strange.length === 0,
     strange.join(', '));

  /* Marketing only, and structurally so. reference/customization-in-transactional-messages is
     explicit that a transactional send cannot read a contact column, so a body that reads one has
     to be unreachable from a transactional call rather than merely discouraged from one. */
  ok(`${id}: it is recorded as a marketing send`, spec.sends === 'marketing', spec.sends);
  ok(`${id}: it carries no always list, because nothing travels in a call`,
     spec.always.length === 0 && spec.optional.length === 0);
  ok(`${id}: it reads the contact, which is why`, template.includes('$Contact.reco_product_id_1'));

  writeFileSync(join(PREVIEW, `${id}.three.html`), three.html);
  writeFileSync(join(PREVIEW, `${id}.one.html`), one.html);
  writeFileSync(join(PREVIEW, `${id}.blocked.html`), none.html);
}

/* And the other nineteen still cannot read the contact. Splitting the list is what makes the
   assertion above possible, and this is the guard against the split quietly widening. */
for (const file of files) {
  ok(`${file.replace(/\.html$/, '')}: is not a marketing only body`,
     !readFileSync(emailPath(file), 'utf8').includes('$from('));
}

const failed = results.filter(r => !r.pass);
for (const r of failed) console.log(`FAIL  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`${results.length - failed.length}/${results.length} email assertions passed`);
console.log(`renderings written to panel/preview, two per body`);
process.exit(failed.length ? 1 : 0);
