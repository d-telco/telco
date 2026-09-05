/* The backend assertions, run without a browser.
 *
 * The verification console at verify/index.html runs these same assertions in front of a
 * prospect. This file runs them in CI, and it exists for a second reason: Chromium in the build
 * sandbox cannot reach Supabase through the egress proxy, so the console's network path cannot be
 * exercised there. Node can. The console is checked structurally by tools/verify.mjs and its
 * assertions are checked for truth here, and tools/verify.mjs asserts the two lists carry the same
 * names, so neither can drift away from the other unnoticed.
 *
 * Nothing here writes into the Dengage account, and that sentence used to be wrong.
 *
 * It said "every call is a GET", which was true when it was written and stopped being true as
 * assertions were added. Two of them posted a body whose behaviour depended on whether an API user
 * was configured somewhere else: with none they previewed a payload, and the day credentials
 * arrived the same body upserted 245 products into the account's catalogue and wrote an order, on
 * every run. The endpoints now preview by default and take the write by name, every caller here
 * asks for the preview, and tools/verify.mjs reads this file's source and fails if one stops.
 *
 * Some calls do write into this demonstration's own Postgres, and one of them adopts a subscriber
 * and then restores the base with dtelco-reset. That is deliberate, reversible and named where it
 * happens.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.DTELCO_FUNCTIONS ||
  'https://raextqlludkagdntyzwn.supabase.co/functions/v1/';

/* The documented counts, parsed from handoff/SEGMENTS.md rather than retyped here. The document
   is what a presenter reads, so it is the one place a number may live; a copy in this file would
   agree with it right up until somebody edited one of them. */
export function seededCounts() {
  const md = readFileSync(fileURLToPath(new URL('../handoff/SEGMENTS.md', import.meta.url)), 'utf8');
  const out = {};
  for (const m of md.matchAll(/^\|\s*`v_dtelco_(\w+)`\s*\|\s*(\d+)\s*\|/gm)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

async function j(path) {
  const r = await fetch(BASE + path);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON, the caller decides whether that matters */ }
  return { status: r.status, ok: r.ok, json, text };
}

export const CHECKS = [
  {
    name: 'dtelco-profile answers its health line',
    async run() {
      const r = await j('dtelco-profile');
      return { ok: r.status === 200 && r.json?.function === 'dtelco-profile',
               detail: `HTTP ${r.status}, function ${r.json?.function ?? 'not named'}` };
    },
  },
  {
    name: 'dtelco-profile refuses a key of the wrong shape',
    async run() {
      const r = await j('dtelco-profile?key=' + encodeURIComponent('not a key'));
      const refused = r.status !== 200 || !!(r.json && (r.json.error || r.json.ok === false));
      return { ok: refused, detail: `HTTP ${r.status}, ${refused ? 'refused' : 'accepted, which is the fault'}` };
    },
  },
  {
    name: 'dtelco-profile returns a plan and usage for DPS-DTELCO-1',
    async run() {
      const r = await j('dtelco-profile?key=DPS-DTELCO-1');
      const p = r.json ?? {};
      const has = p.known_to_operator === true && !!p.plan_id && p.data_used_gb !== undefined;
      return { ok: r.status === 200 && has,
               detail: has ? `${p.plan_name}, ${p.data_used_gb} of ${p.data_cap_gb} GB used`
                           : `HTTP ${r.status}, ${Object.keys(p).length} fields` };
    },
  },
  {
    name: 'dtelco-profile answers recommendations when asked for them',
    async run() {
      const r = await j('dtelco-profile?key=DPS-DTELCO-1&reco=1');
      const recs = r.json?.recommendations ?? [];
      return { ok: r.status === 200 && recs.length > 0,
               detail: `${recs.length} item(s)${recs.length ? ', rule ' + (recs[0].rule ?? 'unnamed') : ''}` };
    },
  },
  {
    name: 'dtelco-product-feed counts 245 products and 496 variants',
    async run() {
      const r = await j('dtelco-product-feed');
      const c = r.json?.counts ?? {};
      return { ok: c.products === 245 && c.variants === 496,
               detail: `products ${c.products}, variants ${c.variants}, relations ${c.relations}, bundle items ${c.bundle_items}` };
    },
  },
  {
    name: 'dtelco-product-feed serves CSV with a byte order mark and CRLF',
    async run() {
      const r = await fetch(BASE + 'dtelco-product-feed?table=product');
      const buf = new Uint8Array(await r.arrayBuffer());
      const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
      const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
      const crlf = text.includes('\r\n');
      const lines = text.split('\r\n').filter(Boolean).length;
      return { ok: bom && crlf && lines === 246,
               detail: `${bom ? 'BOM present' : 'BOM missing'}, ${crlf ? 'CRLF present' : 'CRLF missing'}, ${lines} lines` };
    },
  },
  {
    name: 'every signal the operator accepts is one the site can send to Dengage',
    async run() {
      /* A count sat here and it was the fourth in this repository to go stale the moment a
         signal was added, failing for the one reason that says nothing about the operator.
         The seam that matters is the other one: the simulator writes a row to Postgres and the
         browser sends the matching event to Dengage, so a signal the site's vocabulary does not
         carry is a row in one system and nothing at all in the other. */
      const r = await j('dtelco-operator');
      const signals = r.json?.signals ?? [];
      const src = readFileSync(
        fileURLToPath(new URL('../js/dengageEvents.js', import.meta.url)), 'utf8');
      const vocabulary = [...(src.match(/var EVENT_TYPES = \[([\s\S]*?)\];/)?.[1] ?? '')
        .matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
      const missing = signals.filter((s) => !vocabulary.includes(s));
      return { ok: signals.length > 0 && missing.length === 0,
               detail: missing.length
                 ? `${missing.join(', ')} would reach Postgres and never reach Dengage`
                 : `${signals.length} signals, all in the site's vocabulary, ` +
                   `${Object.keys(r.json?.moves ?? {}).length} of them move a segment` };
    },
  },
  {
    name: 'dtelco-reset holds a snapshot and reports all fourteen segments',
    async run() {
      const r = await j('dtelco-reset');
      const n = Object.keys(r.json?.segments_now ?? {}).length;
      return { ok: n === 14 && r.json?.snapshot_rows > 0,
               detail: `${r.json?.snapshot_rows} snapshot rows, ${n} segments reported` };
    },
  },
  {
    name: 'the seeded data represents today, so the documented counts hold',
    async run() {
      const r = await j('dtelco-reset');
      const c = r.json?.clock ?? {};
      return { ok: c.aligned === true,
               detail: c.aligned
                 ? `anchored on ${c.anchor_date}, rolled ${c.rolled_days_total} day(s) in total`
                 : `the data represents ${c.anchor_date} and today is ${c.today}, ${c.days_behind} ` +
                   'day(s) behind. POST {"roll": true} to dtelco-reset before a session.' };
    },
  },
  {
    name: 'every segment count matches handoff/SEGMENTS.md',
    async run() {
      const r = await j('dtelco-reset');
      const live = r.json?.segments_now ?? {};
      const doc = seededCounts();
      const names = Object.keys(doc);
      const off = names.filter((k) => live[k] !== doc[k]);
      return { ok: names.length === 14 && off.length === 0,
               detail: off.length === 0
                 ? `all ${names.length} match`
                 : off.map((k) => `${k} doc ${doc[k]} live ${live[k]}`).join('; ') };
    },
  },
  {
    name: 'dtelco-lead-relay stores the lead before it calls Dengage',
    async run() {
      const r = await j('dtelco-lead-relay');
      const b = r.json ?? {};
      /* No count. A number here is a third place to update when a form is added, and it broke the
         moment `recommendation` was added, which is exactly the form whose absence started all
         this. tools/check-contract.mjs holds the list against what the site posts. */
      const forms = Array.isArray(b.forms) ? b.forms : [];
      return { ok: r.status === 200 && b.function === 'dtelco-lead-relay' &&
                   forms.includes('recommendation') && forms.includes('recognition'),
               detail: `${forms.length} forms, Dengage ${b.dengage_configured ? 'configured' : 'pending an API user'}` };
    },
  },
  {
    name: 'and refuses a contact key of the wrong shape before it stores anything',
    async run() {
      const r = await fetch(BASE + 'dtelco-lead-relay', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: 'not a key', form: 'newsletter' }),
      });
      const body = await r.text();
      return { ok: r.status === 400 && body.includes('shape'),
               detail: `HTTP ${r.status}, ${body.slice(0, 60)}` };
    },
  },
  {
    name: 'and refuses a form name outside its closed vocabulary',
    async run() {
      const r = await fetch(BASE + 'dtelco-lead-relay', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: 'DPS-DTELCO-1', form: 'whatever' }),
      });
      return { ok: r.status === 400, detail: `HTTP ${r.status}` };
    },
  },
  {
    name: 'dtelco-message reads the outcome code rather than the HTTP status',
    async run() {
      const r = await j('dtelco-message');
      const b = r.json ?? {};
      return { ok: r.status === 200 && b.reads_the_code_not_the_status === true &&
                   Array.isArray(b.channels_suppressed) && b.channels_suppressed.length === 2,
               detail: `sends ${b.channels_available?.join(' and ')}, refuses ${b.channels_suppressed?.join(' and ')} by name` };
    },
  },
  {
    name: 'and refuses SMS and WhatsApp by name rather than by silence',
    async run() {
      const r = await fetch(BASE + 'dtelco-message', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: 'DPS-DTELCO-1', content_id: 'x', channel: 'sms' }),
      });
      const b = await r.json();
      return { ok: b.sent === false && /never sent/.test(b.why ?? ''),
               detail: (b.why ?? '').slice(0, 70) };
    },
  },
  {
    name: 'the contact card columns have a writer, and the rest of the line stays relational',
    async run() {
      /* Three columns, not the whole line: a column earns a place on master_contact only when a
         mechanism reads it from the contact, and the card and the messages read these three. The
         rest of the operator's record is served to segments live by the remote views, so a seeder
         that started writing plan_type or arpu_band again would be flattening the relational
         model back onto the contact, and this fails on extras as firmly as on absences. */
      const r = await j('dtelco-persona-seed');
      const b = r.json ?? {};
      const want = ['plan_name', 'lifecycle', 'contract_end'];
      const cols = b.columns ?? [];
      const extras = cols.filter((c) => !want.includes(c));
      return { ok: want.every((c) => cols.includes(c)) && extras.length === 0 &&
                   b.personas === 8 && b.writes_email === false && b.gsm_permission === false &&
                   b.whatsapp_permission === false && b.writes_gsm === false,
               detail: extras.length ? `writes ${extras.join(', ')} beyond the card three`
                 : `${cols.length} columns for ${b.personas} personas, no email, no gsm and no ` +
                       'send permission on invented numbers' };
    },
  
  },
  {
    name: 'the catalogue the product API would send carries every required field',
    async run() {
      /* reference/upsertproduct requires product_id, title, category_path, price,
         discounted_price, link and image_link. The first version of this read dtelco_product,
         which holds link_path and image_slug and neither of the two URLs, so every batch would
         have been refused. It reads the same views the CSV feed serves now, and this asserts the
         shape rather than the intention. */
      const r = await fetch(BASE + 'dtelco-ecomm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'products' }),   // a preview; the write is asked for by name
      });
      const b = await r.json();
      const s = b.sample ?? {};
      /* The endpoint refuses a price of 0 as empty, measured 5 September 2026, and one free row
         refused the whole batch. So the preview must name every free row it will skip, and the
         number has to reconcile with the catalogue the feed serves: a skip list that drifted
         from the data would either hold the batch hostage again or quietly drop a priced
         product. */
      const feed = await (await fetch(BASE + 'dtelco-product-feed')).json();
      const free = (feed.products ?? []).filter((p) => !(Number(p.price) > 0)).length;
      return { ok: b.missing_required === 0 && b.products > 0 && b.variants > 0 &&
                   b.skipped_products_no_price === free &&
                   b.would_send === b.products - b.skipped_products_no_price &&
                   /^https:\/\//.test(s.link ?? '') && /^https:\/\//.test(s.image_link ?? '') &&
                   typeof s.price === 'number' && typeof s.is_active === 'boolean',
               detail: `${b.products} products, ${b.variants} variants, ${b.missing_required} ` +
                       `missing a required field, ${b.skipped_products_no_price} free and skipped by name` };
    },
  },
  {
    name: 'and an order is totalled server side, with a status the order API allows',
    async run() {
      /* item_count must be the sum of the quantities and total_amount the sum of the paid prices,
         both validated by the endpoint. Two of one product and one of another is three items, and
         the totals are looked up rather than passed. */
      const id = `DPS-dtelco-order-${Date.now()}`;
      const r = await fetch(BASE + 'dtelco-ecomm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'order', preview: true,
          contact_key: 'DPS-DTELCO-1', order_id: id,
          items: [{ product_id: 'dev-galaxy-a16', quantity: 2 },
                  { product_id: 'acc-buds-airpods-4', quantity: 1 }] }),
      });
      const b = await r.json();
      const bad = await fetch(BASE + 'dtelco-ecomm', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'order', contact_key: 'DPS-DTELCO-1',
          order_id: `DPS-dtelco-order-${Date.now() + 1}`, order_status: 'shipped',
          items: [{ product_id: 'dev-galaxy-a16' }] }),
      });
      const badBody = await bad.json();
      return { ok: b.would_store === true && b.sent === false &&
                   b.item_count === 3 && b.total_amount === 507 &&
                   bad.status === 400 && /success and refund/.test(badBody.why ?? ''),
               detail: `${b.item_count} items totalling ${b.total_amount}, and shipped refused` };
    },
  },
  {
    name: 'the send list that gets the recommendation into a push exists and is described',
    async run() {
      const r = await j('dtelco-dataspace');
      const b = r.json ?? {};
      return { ok: b.table === 'dtelco_reco_list' && (b.columns ?? []).length === 6 &&
                   b.contact_key_column === 'contact_key' && /Push sends/.test(b.why ?? ''),
               detail: `${b.table}, ${b.rows_ready} rows ready` };
    },
  },
  {
    name: 'the operator tells Dengage from the server, not only from an open browser',
    async run() {
      /* reference/sendevent needs no login token and no browser, which is the whole reason it is
         here: a real BSS has neither. Until this existed a pressed signal reached Dengage only
         because a tab happened to be open. */
      const r = await j('dtelco-operator');
      const b = r.json ?? {};
      return { ok: b.tells_dengage === true && /event\.dengage\.com/.test(b.how ?? '') &&
                   typeof b.event_table === 'string',
               detail: `${b.event_table}, account id configured ${b.event_api_configured}` };
    },
  },
  {
    name: 'and a visitor can take a line of their own instead of becoming a persona',
    async run() {
      /* A walk in visitor has no operator history and cannot browse
         one into existence; adopting a line gives them one without taking away their real
         behaviour. The line is marked and the reset clears it, which is the part that matters:
         without the mark, adopted lines would drift every segment count upward for good. */
      const key = `DPS-DTELCO-CHECK${Date.now()}`;
      const refused = await fetch(BASE + 'dtelco-operator', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: key, signal: 'usage_80', preview: true }),
      });
      const refusedBody = await refused.json();
      const taken = await fetch(BASE + 'dtelco-operator', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: key, signal: 'usage_80', adopt: true,
                               preview: true }),
      });
      const b = await taken.json();
      /* Put the base back, so a check never leaves a subscriber behind. */
      await fetch(BASE + 'dtelco-reset', { method: 'POST' });
      return { ok: refused.status === 404 && /adopt: true/.test(refusedBody.adopt ?? '') &&
                   b.adopted_line === true && b.segment?.entered === true,
               detail: `refused without adopt, then entered ${b.segment?.view} at ` +
                       `${b.segment?.count_after}` };
    },
  },
  {
    name: 'the operator carries fulfilment as custom events, since the order API cannot',
    async run() {
      /* reference/upsertorders closes it: order_status = success / refund. There is no shipped
         and no delivered, so journey 7's status advances as custom events. Both are in the
         closed vocabulary and neither claims to move a segment. */
      const r = await j('dtelco-operator');
      const b = r.json ?? {};
      const signals = b.signals ?? [];
      const moves = b.moves ?? {};
      return { ok: signals.includes('order_shipped') && signals.includes('order_delivered') &&
                   !moves.order_shipped && !moves.order_delivered,
               detail: `${signals.length} signals, fulfilment moves no segment` };
    },
  },
  {
    name: 'the profile carries the two fields a rule needs and nothing else could supply',
    async run() {
      /* lines_at_address is not family_lines: one is how many lines exist at the address, the
         other is how many this person is billed for, and the family rule is the gap between
         them. Without the first the site's family rule could never fire. contract_days is the
         same story for the upgrade creative. */
      const r = await j('dtelco-profile?key=DPS-DTELCO-7');
      const b = r.json ?? {};
      return { ok: typeof b.lines_at_address === 'number' && b.lines_at_address >= 2 &&
                   b.family_lines === 1 && b.contract_days !== undefined,
               detail: `${b.lines_at_address} lines at the address, billed for ${b.family_lines}` };
    },
  },
  {
    name: 'and every persona is recommended by the rule their own story turns on',
    async run() {
      /* The check that keeps the two engines honest against real data rather than against each
         other's source. Persona 1 is at 92 percent of a small allowance, persona 3 has roaming
         days recorded, persona 7 has three lines at one address billed as singles. If the rule
         that fires is not the one their data names, the engine is reading the wrong column,
         which is exactly how the traveller rule was found reading roaming_days off the
         subscriber table when it lives on the usage table. */
      const want = { 'DPS-DTELCO-1': 'usage_80', 'DPS-DTELCO-3': 'traveller',
                     'DPS-DTELCO-7': 'family' };
      const got = {};
      for (const key of Object.keys(want)) {
        const r = await j(`dtelco-profile?key=${key}&reco=1`);
        got[key] = (r.json?.recommendations ?? [])[0]?.rule ?? 'none';
      }
      const wrong = Object.keys(want).filter((k) => got[k] !== want[k]);
      return { ok: wrong.length === 0,
               detail: Object.entries(got).map(([k, v]) => `${k.slice(-1)}:${v}`).join(' ') };
    },
  },
  {
    name: 'and it names only rules the site also runs, saying which need the page',
    async run() {
      const r = await j('dtelco-profile');
      const b = r.json ?? {};
      const rules = b.recommendation_rules ?? [];
      const page = b.rules_needing_the_page ?? [];
      return { ok: rules.length === 5 && page.length === 5 &&
                   rules.includes('usage_80') && rules.includes('family') &&
                   page.includes('cart_bundle') && !rules.includes('device_cross_sell'),
               detail: `${rules.join(', ')} | needs the page: ${page.join(', ')}` };
    },
  },
  {
    name: 'dtelco-coupons reads a coupon list and names who applies the discount',
    async run() {
      const r = await j('dtelco-coupons');
      const b = r.json ?? {};
      return { ok: r.status === 200 && b.function === 'dtelco-coupons' &&
                   /never imports, takes or redeems/.test(b.note ?? ''),
               detail: `prefix ${b.prefix}, list configured ${b.list_id_configured}` };
    },
  },
  {
    name: 'and recognises a generated code by its shape, refusing anything else',
    async run() {
      /* The seam. js/config.js decides what the checkout accepts and the function decides what it
         reports; a demonstration where the page accepts a code the backend calls unrecognised is
         worse than one that accepts nothing. Both are read here rather than trusted. */
      const src = readFileSync(fileURLToPath(new URL('../js/config.js', import.meta.url)), 'utf8');
      const prefix = src.match(/coupon:\s*\{[\s\S]{0,200}?prefix:\s*'([^']+)'/)?.[1];
      const good = await j(`dtelco-coupons?check=${prefix}7K2M4Q9X`);
      const bad = await j('dtelco-coupons?check=BACK10');
      return { ok: good.json?.recognised === true && bad.json?.recognised === false &&
                   good.json?.shape?.startsWith(prefix) && prefix === (good.json?.code ?? '').slice(0, prefix.length),
               detail: `${prefix} recognised ${good.json?.recognised}, shared word ${bad.json?.recognised}` };
    },
  },
  {
    name: 'dtelco-dengage-tables counts the standard tables and both custom ones',
    async run() {
      /* Named rather than counted. This asserted a length of seven, and adding the operator's own
         table broke it for the right reason and the wrong one: a count cannot say which table went
         missing, and it would have passed just as happily if one had been swapped for another. */
      const want = ['page_view_events', 'shopping_cart_events', 'order_events',
                    'order_events_detail', 'wishlist_events', 'search_events',
                    'dtelco_events', 'dtelco_bss_events'];
      const r = await j('dtelco-dengage-tables');
      const b = r.json ?? {};
      const list = b.tables_it_will_count ?? Object.keys(b.counts ?? {});
      const missing = want.filter((t) => !list.includes(t));
      return { ok: missing.length === 0 && b.storage_lag_seconds === 120,
               detail: missing.length ? `${missing.join(', ')} is not counted`
                 : `${list.length} tables, storage lags ${b.storage_lag_seconds} seconds` };
    },
  },
  {
    name: 'dtelco-broadcast names the places it can announce a fault for',
    async run() {
      /* The site's list and the function's list are compared offline by check-contract. This
         asserts the deployed function agrees with the committed source, which is the only way to
         catch a deploy that never happened. */
      const src = readFileSync(fileURLToPath(new URL('../js/config.js', import.meta.url)), 'utf8');
      const want = [...(src.match(/cities:\s*\[([^\]]*)\]/)?.[1] ?? '')
        .matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const r = await j('dtelco-broadcast');
      const got = r.json?.cities ?? [];
      return { ok: r.status === 200 && want.length > 0 && got.join('|') === want.join('|'),
               detail: `${got.length} deployed, ${want.length} committed` };
    },
  },
  {
    name: 'and sends nothing until it is told twice',
    async run() {
      /* The one endpoint here that reaches more than one person. A POST without confirm must come
         back with the words it would use and sent: false, which is what the console's first press
         relies on. Asserted against the live function rather than the source, because the guard
         being in the file is not the same as the guard being deployed. */
      const r = await fetch(BASE + 'dtelco-broadcast', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city: 'Ganja' }),
      });
      const b = await r.json();
      return { ok: b.sent === false && /confirm: true/.test(b.why ?? '') &&
                   /Ganja/.test(b.title ?? '') && typeof b.would_reach === 'string',
               detail: `sent ${b.sent}, and it says who it would reach` };
    },
  },
  {
    name: 'and refuses a place no customer of this operator lives in',
    async run() {
      const r = await fetch(BASE + 'dtelco-broadcast', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ city: 'Tbilisi', confirm: true }),
      });
      const b = await r.json();
      return { ok: r.status === 400 && b.error === 'unknown city',
               detail: 'the title of a push is not the place for an unchecked string' };
    },
  },
  {
    name: 'dtelco-inbox reads a mailbox for a screen that has no SDK',
    async run() {
      const r = await j('dtelco-inbox');
      const b = r.json ?? {};
      return { ok: r.status === 200 && b.function === 'dtelco-inbox' &&
                   b.writes === 'nothing, ever' && /counter/.test(b.for ?? ''),
               detail: `account ${b.needs?.account_id}, custom inbox app ${b.needs?.custom_inbox_app_guid}` };
    },
  },
  {
    name: 'and will not report an event that no customer caused',
    async run() {
      /* An agent glancing at a customer's messages has not read them. If this ever answers
         anything but a refusal, every inbox statistic in the account stops being trustworthy. */
      const r = await fetch(BASE + 'dtelco-inbox', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [{ eventType: 'OP', msgid: 'x' }] }),
      });
      const b = await r.json();
      return { ok: r.status === 405 && /reads and will not write/.test(b.error ?? '') &&
                   /never report impressions/.test(b.rule ?? ''),
               detail: `POST answers ${r.status}` };
    },
  },
  {
    name: 'every remote view resolves for the role Dengage connects with',
    async run() {
      /* The check that did not exist. Every other assertion here reads Postgres as the service
         role, which bypasses RLS and holds every grant. Dengage connects as dengage_reader, and
         two views resolved for one and errored for the other. */
      const r = await j('dtelco-remote');
      const b = r.json ?? {};
      return { ok: r.status === 200 && b.views_broken === 0 && b.views_resolving > 0,
               detail: b.views_broken
                 ? (b.broken ?? []).map((x) => `${x.view}: ${x.why}`).join('; ')
                 : `${b.views_resolving} views resolve, ${(b.not_offered ?? []).length} deliberately not offered` };
    },
  },
  {
    name: 'and the remote source picker offers nothing it should not',
    async run() {
      /* Reference tables about products or places are never offered as remote sources, and a
         remote table must relate to master_contact or master_device. Both rules were enforced by
         nothing until this endpoint existed. */
      const r = await j('dtelco-remote');
      const b = r.json ?? {};
      const ref = b.reference_tables_offered ?? [];
      const keyless = b.offered_without_a_contact_key ?? [];
      return { ok: ref.length === 0 && keyless.length === 0,
               detail: ref.length || keyless.length
                 ? `reference: ${ref.join(', ') || 'none'}; keyless: ${keyless.join(', ') || 'none'}`
                 : `${b.offered_count} objects offered, every one contact keyed` };
    },
  },
];

/* Run only when invoked directly, so tools/verify.mjs can import CHECKS without firing requests. */
if (import.meta.url === `file://${process.argv[1]}`) {
  let pass = 0;
  for (const c of CHECKS) {
    let r;
    try { r = await c.run(); }
    catch (e) { r = { ok: false, detail: `threw: ${e.message}` }; }
    if (r.ok) pass++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${r.detail}`);
  }
  console.log(`\n${pass} of ${CHECKS.length} backend assertions passed`);
  process.exit(pass === CHECKS.length ? 0 : 1);
}
