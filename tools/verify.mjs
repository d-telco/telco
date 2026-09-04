/* The repository's own browser suite.
 *
 * Runs every page in a real Chromium against a local server, and REFUSES every request to
 * dengage.com, then asserts that it refused. That assertion is the point: a check that can
 * write into the Dengage account is a check nobody can run twice, and one that quietly wrote
 * test rows into a shared account would be worse than no check at all.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

/* This image ships a Chromium that the npm Playwright does not expect, and downloading another
   one is both slow and pointless. Point at the bundled binary when it is there, fall back to
   whatever Playwright resolves on a normal machine. */
const BUNDLED = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                 '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => existsSync(p));
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8101;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = join(ROOT, normalize(rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(PORT, r));

const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch(BUNDLED ? { executablePath: BUNDLED } : {});

let dengageAttempts = 0, refused = 0;
const BLOCKED = /dengage\.com|supabase\.co/i;

async function freshContext() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (BLOCKED.test(url)) { dengageAttempts++; refused++; return route.abort(); }
    return route.continue();
  });
  return ctx;
}

async function open(path, keepContext) {
  const ctx = keepContext || await freshContext();
  const page = await ctx.newPage();
  page.__ctx = ctx;
  const errors = [], events = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  // A resource this suite blocks on purpose logs a console error the page has already handled.
  // Counting it as a page error would make the guard look like a defect.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (BLOCKED.test(text) || /ERR_FAILED|ERR_BLOCKED|net::/.test(text)) return;
    errors.push(text);
  });
  await page.exposeFunction('__record', d => events.push(d));
  await page.addInitScript(() => {
    window.addEventListener('dps:dtelco:event', e => window.__record({
      kind: 'event', action: e.detail.action, payload: e.detail.payload,
      accepted: e.detail.accepted, note: e.detail.note }));
    window.addEventListener('dps:dtelco:focus', e => window.__record({ kind: 'focus', ...e.detail }));
  });
  await page.goto(`http://localhost:${PORT}/${path}`, { waitUntil: 'networkidle' });
  return { page, errors, events };
}

// --- home, first visit -------------------------------------------------------------------
{
  const { page, errors, events } = await open('index.html');
  ok('home boots with no page error', errors.length === 0, errors[0] || '');
  ok('pageView fires first', events[0]?.action === 'pageView',
     `first event was ${events[0]?.action}`);
  ok('pageView carries page_type home', events[0]?.payload?.page_type === 'home');
  ok('tariff cards render from the catalogue',
     await page.locator('.tariff').count() === 7,
     `${await page.locator('.tariff').count()} cards`);
  ok('phone cards render', await page.locator('.grid .card').count() >= 8);
  ok('every inline slot exists',
     await page.evaluate(() => ['below_header','below_hero','in_grid','above_footer','reco']
       .every(s => !!document.getElementById('dn_inline_target_' + s))));
  ok('recognition band hidden for a first visitor',
     await page.locator('#recognition').isHidden());
  ok('no horizontal scroll at 1280',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  // Below the fold, loading=lazy images are correctly not loaded, so scroll the whole page
  // first. That makes this a stronger check than it was: it proves lazy loading works too.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  const undecoded = await page.evaluate(() => Array.from(document.images)
    .filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src')));
  ok('every image decoded, lazy ones included', undecoded.length === 0, undecoded.join(', '));
  ok('an empty basket shows no badge', await page.locator('#cart-count').isHidden());
  ok('the hero carousel has a dot per slide', await page.locator('#hero-dots button').count() === 3);
  ok('a dot actually changes the hero', await page.evaluate(async () => {
    const before = document.getElementById('hero-img').getAttribute('src');
    document.querySelectorAll('#hero-dots button')[2].click();
    await new Promise(r => setTimeout(r, 60));
    return document.getElementById('hero-img').getAttribute('src') !== before;
  }));
  // A16 layer 6: no dead control. Every visible link and button either goes somewhere, carries
  // a handler attribute the page owns, or is inside a region that wires itself.
  const dead = await page.evaluate(() => Array.from(
    document.querySelectorAll('a, button')).filter(el => {
      if (el.offsetParent === null) return false;
      if (el.tagName === 'A') return !el.getAttribute('href');
      return !['data-theme-set','data-join','data-slide','data-open','data-act','data-reco']
        .some(a => el.hasAttribute(a)) && !el.closest('#dps-debug');
    }).map(el => el.tagName + ' ' + (el.textContent || '').trim().slice(0, 30)));
  ok('no dead control on the page', dead.length === 0, dead.join(' | '));
  // The drawer must work with no Dengage application on the page: the demo's own messages still
  // appear, and it says why the Dengage side is empty rather than looking broken.
  await page.locator('#bell').click();
  await page.waitForTimeout(200);
  ok('the message drawer opens', await page.locator('#dps-drawer.open').count() === 1);
  ok('and explains itself when there is no application yet',
     (await page.locator('#dps-drawer .empty').innerText()).includes('2.4.0'));
  ok('nothing is reported to Dengage for messages Dengage did not issue',
     await page.evaluate(() => window.DTelcoInbox.all().every(m => m.source !== 'dengage')));
  await page.locator('#dps-drawer [data-act="close"]').click();
  ok('theme toggle switches the document',
     await page.evaluate(async () => {
       document.querySelector('[data-theme-set="dark"]').click();
       const dark = document.documentElement.getAttribute('data-theme') === 'dark';
       document.querySelector('[data-theme-set="light"]').click();
       return dark && document.documentElement.getAttribute('data-theme') === 'light';
     }));
  await page.close();
}

// --- what initialize is handed, with an application configured ----------------------------
//
// The account has no application yet, so the snippet does not call initialize and every page
// sends its own pageView. That is the path every other block above exercises. This one is the
// other path, the one that runs the day an account id is pasted: the SDK is given
// the page view, the cart, the language, the currency and the location in the first call,
// because reference/recommendation-web-sdk warns that "display process may start before WebSDK
// receives the data from the public methods".
//
// Testing it means giving the page an application, which is done by rewriting js/config.js on
// the way to the browser rather than by editing the file. Nothing here reaches Dengage: the
// loader host is blocked with every other dengage.com request.
{
  const ctx = await freshContext();
  await ctx.route('**/js/config.js*', async (route) => {
    const body = (await (await fetch(`http://localhost:${PORT}/js/config.js`)).text())
      .replace("accountId: ''", "accountId: 'demo-account'")
      .replace("appGuid: ''", "appGuid: 'demo-app-guid'");
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });

  const { page, events } = await open('index.html', ctx);
  const init = await page.evaluate(() => window.__dnInit);
  ok('initialize is handed the page view rather than a later call',
     init?.pageView?.page_type === 'home', JSON.stringify(init?.pageView ?? null));
  ok('and the language, the currency and the location beside it',
     init?.language === 'en' && init?.currency === 'USD' && init?.location === 'AZ',
     `${init?.language} ${init?.currency} ${init?.location}`);
  ok('and the cart, which is empty on a first visit', Array.isArray(init?.cartItems) &&
     init.cartItems.length === 0);

  /* One page view, not two. The event is still announced so the readout and this suite see it
     first, and the note says which route carried it. */
  const views = events.filter(e => e.action === 'pageView');
  ok('the page view is announced exactly once', views.length === 1, `${views.length}`);
  ok('and is announced first, as on every other page', events[0]?.action === 'pageView');
  /* The assertion that bites. Announcing once proves nothing on its own, because the announce
     fires on both routes; what has to be true is that the SDK was not called a second time, and
     the note is where the page says which route carried it. */
  ok('and says it travelled on initialize rather than being sent again',
     views[0]?.note === 'carried on initialize, not sent again', views[0]?.note ?? 'no note');
  ok('the country is set on the page, which initialize does not carry',
     events.some(e => e.action === 'setCountry' && e.payload === 'AZ'),
     events.filter(e => e.action === 'setCountry').map(e => e.payload).join(', ') || 'never set');
  await page.close();

  /* A product page with something in the cart, which is where the shape matters. The cart line
     initialize is given is the setCart shape from reference/recommendation-web-sdk, with price
     and category_path, and not the unit_price shape reference/ecommerce-events uses for the
     shopping_cart_events table. */
  const { page: pdp } = await open('product.html?id=dev-galaxy-a16', ctx);
  const pdpInit = await pdp.evaluate(() => window.__dnInit);
  ok('a product page hands initialize the product it is showing',
     pdpInit?.pageView?.product_id === 'dev-galaxy-a16' &&
     pdpInit?.pageView?.category_path === 'Shop>Phones' &&
     pdpInit?.pageView?.price === 179 && pdpInit?.pageView?.stock_count === 55,
     JSON.stringify(pdpInit?.pageView ?? null));
  await pdp.locator('#pdp-add').click();
  await pdp.waitForTimeout(150);

  const { page: after } = await open('index.html', ctx);
  const cart = await after.evaluate(() => window.__dnInit.cartItems);
  ok('the next page hands initialize the cart it now holds', cart.length === 1, `${cart.length}`);
  ok('as a setCart line, with price and category rather than unit_price',
     cart[0]?.price === 179 && cart[0]?.discounted_price === 179 &&
     cart[0]?.category_path === 'Shop>Phones' && cart[0]?.quantity === 1 &&
     cart[0]?.has_discount === false && cart[0]?.has_promotion === false &&
     cart[0].unit_price === undefined,
     JSON.stringify(cart[0] ?? null));
  await after.close();
  await ctx.close();
}

// --- the recognition thread, the recognition use case ------------------------------------
{
  const { page, events } = await open('index.html');
  await page.evaluate(() => {
    const p = window.DTelcoCatalog.product('dev-iphone-16');
    window.DTelcoRecognition.record(p);          // visit one
    return window.DTelcoRecognition.focus();
  });
  const afterOne = await page.evaluate(() => window.DTelcoRecognition.focus());
  ok('one view is not enough', afterOne === null);

  await page.evaluate(() => window.DTelcoRecognition.record(
    window.DTelcoCatalog.product('dev-iphone-16')));                       // visit two
  const focus = await page.evaluate(() => window.DTelcoRecognition.focus());
  ok('two views set the focus product', focus?.product_id === 'dev-iphone-16');
  ok('crossing the threshold mints a key',
     /^DPS-DTELCO-\d+$/.test(await page.evaluate(() => window.DTelcoIdentity.get())));
  ok('a product_focus row is sent',
     events.some(e => e.payload?.event_type === 'product_focus'));

  await page.waitForTimeout(150);
  ok('the recognition band draws itself, with nobody calling draw',
     await page.locator('#recognition').isVisible());
  ok('the band names the focus product',
     (await page.locator('#recognition h2').innerText()).includes('iPhone 16'));
  const rules = await page.locator('.reco-item .rule').allInnerTexts();
  ok('recommendations follow the focus product',
     rules.every(r => r === 'focus_cross_sell'), rules.join(','));
  const names = await page.locator('.reco-item .name').allInnerTexts();
  const ids = await page.locator('.reco-item').evaluateAll(
    els => els.map(e => e.getAttribute('data-reco')));
  const allFit = await page.evaluate(recos => recos.every(id =>
    window.DTelcoCatalog.related(id, 'compatible_with')
      .some(r => r.product.product_id === 'dev-iphone-16')), ids);
  ok('and every one is compatible with the focus product', allFit, names.join(' | '));
  await page.close();
}

// --- a different visitor, a different handset ---------------------------------------------
{
  const { page } = await open('index.html');
  await page.evaluate(() => {
    const p = window.DTelcoCatalog.product('dev-pixel-10');
    window.DTelcoRecognition.record(p); window.DTelcoRecognition.record(p);
  });
  await page.waitForTimeout(150);
  const names = await page.locator('.reco-item .name').allInnerTexts();
  ok('a Pixel visitor is recommended Pixel accessories',
     names.length > 0 && names.every(n => /Pixel/i.test(n)), names.join(' | '));
  await page.close();
}

// --- the cart rules ------------------------------------------------------------------------
{
  const { page, events } = await open('index.html');
  await page.locator('[data-join]').first().click();
  await page.waitForTimeout(150);
  const adds = events.filter(e => e.action === 'ec:addToCart');
  ok('join now writes an addToCart', adds.length === 1);
  ok('cartItems carries the whole cart', adds[0]?.payload?.cartItems?.length === 1);
  ok('the confirmation card renders in the same frame', await page.locator('.dps-confirm').count() === 1);
  ok('the basket badge updates', (await page.locator('#cart-count').innerText()) === '1');

  /* Quantity, which every line used to have as a hard 1. Dengage rebuilds a cart from the event
     stream, so an addToCart carrying a changed quantity has to carry the whole basket with it,
     and the totals on the page have to multiply rather than add. */
  const ctx = page.__ctx;
  await page.close();
  const { page: cart, events: cartEvents } = await open('cart.html', ctx);
  const priceBefore = await cart.locator('.cart-line .price').first().innerText();
  await cart.locator('[data-qty][data-delta="1"]').first().click();
  await cart.waitForTimeout(150);
  const priceAfter = await cart.locator('.cart-line .price').first().innerText();
  const money = (t) => Number(String(t).replace(/[^0-9.]/g, ''));
  ok('one more of a line doubles that line', money(priceAfter) === money(priceBefore) * 2,
     `${priceBefore} to ${priceAfter}`);
  ok('and the badge counts units rather than lines',
     (await cart.locator('#cart-count').innerText()) === '2');
  const qtyAdd = cartEvents.filter(e => e.action === 'ec:addToCart').pop();
  ok('the change is an addToCart carrying the quantity and the whole basket',
     qtyAdd?.payload?.quantity === 2 && qtyAdd?.payload?.cartItems?.length === 1 &&
     qtyAdd?.payload?.cartItems[0]?.quantity === 2,
     JSON.stringify(qtyAdd?.payload?.cartItems ?? null));
  const setCart = cartEvents.filter(e => e.action === 'ec:setCart').pop();
  ok('and setCart hands the SDK the same quantity, in the documented items shape',
     setCart?.payload?.items?.[0]?.quantity === 2 &&
     setCart?.payload?.items?.[0]?.has_promotion === false,
     JSON.stringify(setCart?.payload?.items?.[0] ?? null));

  await cart.locator('[data-qty][data-delta="-1"]').first().click();
  await cart.waitForTimeout(150);
  ok('and it will not go below one',
     (await cart.locator('.cart-line .qty span').first().innerText()) === '1' &&
     await cart.locator('[data-qty][data-delta="-1"]').first().isDisabled());
  await cart.close();
  await ctx.close();
}

// --- every page, swept -------------------------------------------------------------------
// A page that boots dirty, scrolls sideways, or carries a control that does nothing is a page
// that would do exactly that live.
import { PAGES } from './pages.mjs';
/* Every module the storefront ships, read once as text. A control is wired if one of these
   mentions the attribute or the id it hangs on. */
const SCRIPTS = (await Promise.all(
  (await readdir(join(ROOT, 'js'))).filter(f => f.endsWith('.js'))
    .map(f => readFile(join(ROOT, 'js', f), 'utf8')))).join('\n');

{
  const dirty = [], wrongType = [], sideways = [], deadControls = [], missingSlots = [];
  const slotCounts = [];
  for (const [path, type] of PAGES) {
    const { page, errors, events } = await open(path);
    if (errors.length) dirty.push(`${path}: ${errors[0]}`);
    if (events[0]?.action !== 'pageView') wrongType.push(`${path}: first was ${events[0]?.action}`);
    else if (events[0]?.payload?.page_type !== type)
      wrongType.push(`${path}: ${events[0]?.payload?.page_type} not ${type}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
      sideways.push(path);
    /* The slot map decides which slots this page owes, not a list retyped here. js/slots.js
       declares them with the page they belong to and the moment they exist for, and a runbook is
       generated from the same shape, so a slot promised to a marketer and missing from a page
       fails here rather than in the panel. Read after render, because two of them are drawn by
       js/pages.js rather than written into the file. */
    const slotReport = await page.evaluate(() => {
      const S = window.DTelcoSlots;
      if (!S || !S.ensure) return { missing: ['DTelcoSlots did not load'], dupes: [], expected: 0 };
      return { missing: S.ensure(), dupes: S.duplicates(), expected: S.expected().length };
    });
    if (slotReport.missing.length) missingSlots.push(`${path}: ${slotReport.missing.join(',')}`);
    /* An id twice on one page makes the panel's optimised query match two nodes, and a campaign
       drawn twice is worse than one drawn nowhere. */
    if (slotReport.dupes.length) missingSlots.push(`${path}: ${slotReport.dupes.join(',')} appears twice`);
    slotCounts.push([path, slotReport.expected]);
    /* A control counts as wired when the page's own scripts actually mention the hook it hangs
       on. The first version of this check carried an allowlist of data attributes, which meant a
       new page looked entirely broken until somebody remembered to extend the list, and it let
       any control through merely for having an id. Reading the scripts needs no maintenance and
       catches the case the allowlist waved past. */
    const dead = await page.evaluate((js) => Array.from(document.querySelectorAll('a, button'))
      .filter(el => {
        if (el.offsetParent === null) return false;
        if (el.closest('#dps-debug')) return false;
        if (el.tagName === 'A') return !el.getAttribute('href');
        if (el.type === 'submit') return !el.closest('form');
        if (el.onclick) return false;
        const named = Array.from(el.attributes)
          .filter(a => a.name.startsWith('data-'))
          .some(a => js.includes(a.name));
        const byId = el.id && (js.includes(`'${el.id}'`) || js.includes(`"${el.id}"`) ||
                               js.includes(`#${el.id}`));
        return !named && !byId;
      }).map(el => el.tagName + ' ' + (el.textContent || '').trim().slice(0, 24)), SCRIPTS);
    if (dead.length) deadControls.push(`${path}: ${dead.join(' | ')}`);
    await page.close();
  }
  ok(`all ${PAGES.length} pages boot with no page error`, dirty.length === 0, dirty[0] || '');
  ok('every page fires pageView first, with its declared type', wrongType.length === 0, wrongType[0] || '');
  ok('no page scrolls sideways at 1280', sideways.length === 0, sideways.join(', '));
  ok('every page carries the inline slots the map declares for it', missingSlots.length === 0,
     missingSlots[0] || `${slotCounts.reduce((t, [, n]) => t + n, 0)} slots across ${PAGES.length} pages`);

  /* A page with only the three universal slots offers a marketer nowhere specific to put anything.
     The pages that carry a moment of their own are named in the map; this asserts the map actually
     reached them rather than sitting in a file describing an intention. */
  const specific = slotCounts.filter(([, n]) => n > 3);
  ok('and the pages with a moment of their own carry a slot for it', specific.length >= 8,
     `${specific.length} pages carry more than the three universal slots`);
  ok('no dead control on any page', deadControls.length === 0, deadControls[0] || '');
}

/* The header search icon sat on all twenty five pages doing nothing, and the dead control check
   passed it because its attribute was on an allowlist. Both halves of the fix are asserted here:
   off a listing page it routes to one, and on a listing page it focuses the search already there
   rather than drawing a second one. */
{
  const { page } = await open('about.html');
  await page.click('[data-open="search"]');
  await page.waitForURL(/shop\.html\?focus=q/, { timeout: 3000 }).catch(() => {});
  ok('the header search routes to the catalogue from a page without one',
     /shop\.html\?focus=q/.test(page.url()), page.url());
  await page.waitForTimeout(400);
  ok('and the search field has focus on arrival',
     await page.evaluate(() => document.activeElement?.id === 'q'),
     await page.evaluate(() => document.activeElement?.id ?? 'none'));
  await page.close();
}
{
  const { page } = await open('shop.html');
  await page.click('[data-open="search"]');
  await page.waitForTimeout(200);
  ok('and on a listing page it focuses the search already there, rather than a second one',
     await page.evaluate(() => document.activeElement?.id === 'q') &&
     await page.locator('#q').count() === 1);
  await page.close();
}

// --- the funnel, in the order a customer meets it -----------------------------------------
{
  const { page, events } = await open('product.html?id=dev-iphone-16');
  ok('a product page renders its detail', await page.locator('.pdp h1').innerText() === 'iPhone 16');
  ok('a product pageView carries category and price',
     events[0]?.payload?.category_path === 'Shop>Phones' && events[0]?.payload?.price === 799);
  ok('storage and colour variants are offered',
     await page.locator('[data-variant]').count() === 6);
  await page.locator('[data-wish="favorites"]').click();
  await page.locator('[data-wish="price_drop_alert"]').click();
  const wl = events.filter(e => e.action === 'ec:addToWishlist');
  const lists = wl.map(e => e.payload?.list_name).filter(Boolean);
  ok('wishlist writes distinct list names', lists.join(',') === 'favorites,price_drop_alert', lists.join(','));
  // The documented route is ec:addToWishlist, which stores the same wishlist_events row without
  // making event_id the caller's problem. Assert we are on it, not on sendDeviceEvent.
  ok('wishlist uses the documented ec: route',
     wl.length === 2 && !events.some(e => e.action === 'sendDeviceEvent' && e.payload?.list_name));
  ok('a wishlist row carries the product and its variant',
     wl[0]?.payload?.product_id === 'dev-iphone-16' && !!wl[0]?.payload?.product_variant_id);

  // Swapping a variant must remove before it adds, or the profile shows two handsets.
  await page.locator('#pdp-add').click();
  await page.locator('[data-variant]').nth(3).click();
  const adds = events.filter(e => e.action === 'ec:addToCart').length;
  const removes = events.filter(e => e.action === 'ec:removeFromCart').length;
  ok('a variant swap removes before it adds', adds === 2 && removes === 1, `${adds} adds, ${removes} removes`);
  ok('the cart still holds one line', await page.evaluate(() => window.DengageEvents.cart().length) === 1);
  await page.close();
}

{
  const ctx = await freshContext();
  const { page, events } = await open('cart.html', ctx);
  await page.evaluate(() => window.DengageEvents.addToCart({
    product_id: 'plan-go-11-99', product_variant_id: 'plan-go-11-99', unit_price: 11.99,
    discounted_price: 11.99, stock_count: 9999, quantity: 1 }));
  await page.reload({ waitUntil: 'networkidle' });
  ok('the basket lists what was added', await page.locator('.cart-line').count() === 1);
  await page.close();
}

{
  const ctx = await freshContext();
  const { page, events } = await open('checkout.html', ctx);
  await page.evaluate(() => window.DengageEvents.addToCart({
    product_id: 'plan-go-11-99', product_variant_id: 'plan-go-11-99', unit_price: 11.99,
    discounted_price: 11.99, stock_count: 9999, quantity: 1 }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('button[type=submit]').click();
  ok('an empty checkout form is held, not submitted',
     events.every(e => e.action !== 'ec:order'));
  ok('beginCheckout fired once the cart named an item',
     events.some(e => e.action === 'ec:beginCheckout' && e.payload.cartItems.length === 1));
  await page.fill('[name=name]', 'Aysel M');
  await page.fill('[name=email]', 'demo@example.invalid');

  /* A code the page does not recognise reaches the order by no route at all. Issuing and
     redeeming are two different jobs: Dengage issues a unique code per recipient from a coupon
     list and marks it taken, and the operator's billing system applies the discount. So the page
     knows its own shape and names who applies the discount, and both are checked here. The
     refusal is checked first because the earlier version of this suite typed a made up code and
     asserted it was kept. */
  await page.fill('[name=coupon]', 'AI2026');
  await page.waitForTimeout(80);
  ok('a code that is not ours is refused on the page, with the shape named',
     /not a D\u00b7TELCO code/.test(await page.locator('#coupon-note').textContent()),
     await page.locator('#coupon-note').textContent());

  await page.fill('[name=coupon]', 'DTELCO-7K2M4Q9X');
  await page.waitForTimeout(80);
  const note = await page.locator('#coupon-note').textContent();
  ok('and a generated code is recognised, saying who applies the discount',
     /Recognised/.test(note) && /billing system/.test(note), note);

  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(200);
  const order = events.find(e => e.action === 'ec:order');
  ok('the order carries the recognised coupon and a vocabulary payment method',
     order?.payload?.coupon_code === 'DTELCO-7K2M4Q9X' &&
     order?.payload?.payment_method === 'online_payment',
     `${order?.payload?.coupon_code} / ${order?.payload?.payment_method}`);
  ok('the order id follows the convention', /^DPS-dtelco-order-\d+$/.test(order?.payload?.order_id));
  ok('the line choice is a custom row',
     events.some(e => e.payload?.event_type === 'esim_selected'));
  await page.close();
}

{
  const { page, events } = await open('compare.html');
  await page.locator('[data-pick]').nth(2).click();
  await page.locator('[data-pick]').nth(4).click();
  ok('comparing two tariffs draws a table', await page.locator('table.compare').count() === 1);
  const cmp = events.find(e => e.payload?.event_type === 'compare');
  ok('and writes one row naming both', (cmp?.payload?.product_id || '').split(',').length === 2);
  await page.close();
}

{
  const { page, events } = await open('plan-finder.html');
  for (let i = 0; i < 4; i++) { await page.locator('[data-answer]').first().click(); }
  ok('the plan finder ends in three tariffs', await page.locator('.tariff').count() === 3);
  const pf = events.find(e => e.payload?.event_type === 'plan_finder');
  ok('and writes the answers as one row', !!pf && !!pf.payload.horizon, JSON.stringify(pf?.payload || {}));
  await page.close();
}

{
  const { page, events } = await open('support.html');
  await page.locator('[data-topic]').first().click();
  await page.locator('[data-nps]').nth(9).click();
  ok('a support topic opens a complaint row',
     events.some(e => e.payload?.event_type === 'complaint_opened'));
  ok('an NPS answer writes a survey row',
     events.some(e => e.payload?.event_type === 'survey_response' && e.payload.amount === '9'));
  await page.close();
}

{
  const { page, events } = await open('signin.html');
  await page.locator('[data-persona]').first().click();
  await page.waitForTimeout(120);
  ok('picking a persona names the contact',
     events.some(e => e.action === 'setContactKey'));
  ok('and gives the new contact a page view of its own',
     events.some(e => e.action === 'pageView' && e.payload.page_type === 'login'));
  await page.close();
}

{
  const { page, events } = await open('plans.html');
  await page.fill('#q', 'klass');
  await page.waitForTimeout(900);
  const searches = events.filter(e => e.action === 'ec:search');
  ok('search fires once per settled query, not per keystroke', searches.length === 1,
     `${searches.length} search rows for one typed word`);
  ok('and carries a result count', typeof searches[0]?.payload?.result_count === 'number');
  await page.close();
}

// --- the verification console ----------------------------------------------------------------
/* The console must not become a visitor. It reports the numbers, so a page view of its own would
   appear in the numbers it reports, and a contact key of its own would sit in the account beside
   the personas. Both would be invisible until somebody counted carefully during a demonstration.

   Its network calls cannot be exercised here: this suite refuses supabase.co on purpose, and the
   sandbox's egress proxy resets Chromium's TLS in any case. tools/check-backend.mjs runs the same
   eight assertions from Node against the live functions, and the last assertion below holds the
   two lists to the same names so neither can drift. */
{
  const ctx = await freshContext();
  const page = await ctx.newPage();
  const asked = [];
  page.on('request', r => asked.push(r.url()));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/verify/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);

  ok('the console loads no storefront module',
     asked.filter(u => /\/js\//.test(u)).length === 0,
     asked.filter(u => /\/js\//.test(u)).join(', '));
  ok('the console loads no Dengage snippet',
     !(await page.evaluate(() => typeof window.dengage === 'function')));
  ok('the console mints no contact key',
     await page.evaluate(() => !window.__dnInit && !localStorage.getItem('dps:dtelco:ck')));
  ok('the console throws nothing on load', errors.length === 0, errors.join(' | '));

  ok('all fourteen segments are listed before any network call',
     await page.locator('#segments-table tbody tr').count() === 14);
  ok('and seven of them are marked as moving with the calendar',
     await page.locator('#segments-table tbody tr[data-drift="calendar"]').count() === 7);
  ok('and the two seeded empty are marked as deliberate',
     await page.locator('#segments-table tbody tr[data-drift="empty-on-purpose"]').count() === 2);

  /* The console used to render every SMS and WhatsApp message beside the panel's own copy of
     them, which was a second place for the same words to go stale and, once the recommendation
     moment arrived, a place where a prospect would read a $from query as if it were the message.
     It lists the pack instead: one row per moment, naming the channels and the file to paste
     from. Where the copy lives is the panel. */
  await page.click('#run-messages');
  await page.waitForTimeout(400);
  const pack = JSON.parse(await readFile(new URL('../panel/contents.json', import.meta.url), 'utf8'));
  const rows = await page.locator('#messages-table tbody tr').count();
  ok('the content pack is listed in full, one row per moment', rows === pack.moments.length,
     `${rows} rows against ${pack.moments.length} moments`);

  /* Each row has to name the file, because a row that names a channel and not the file is a
     presenter hunting through a folder while a prospect waits. */
  const cells = await page.locator('#messages-table tbody tr td:last-child').allTextContents();
  const named = cells.join(' ');
  const missingFile = pack.moments.filter((m) =>
    (m.email && !named.includes(`panel/email/${m.id}.html`)) ||
    (m.push && !named.includes(`panel/push/${m.id}.json`)) ||
    (m.sms && !named.includes(`panel/sms/${m.id}.txt`)) ||
    (m.whatsapp && !named.includes(`panel/whatsapp/${m.id}.txt`)));
  ok('and every row names the file each channel is pasted from', missingFile.length === 0,
     missingFile.map((m) => m.id).join(', '));

  ok('and says plainly which channels are never sent',
     /never sent/.test(await page.locator('#messages-summary').textContent()),
     await page.locator('#messages-summary').textContent());

  await page.click('#run-config');
  await page.waitForTimeout(300);
  ok('the console reports the Dengage wiring state',
     await page.locator('#config-table tbody tr').count() === 5);
  /* config.js arrives only when the button is pressed, and it arrives as text: the console
     regexes it rather than executing it, which is why reading it does not make it a visitor. */
  ok('and reads js/config.js as text only when asked to',
     asked.filter(u => /\/js\//.test(u)).every(u => /js\/config\.js/.test(u)) &&
     asked.some(u => /js\/config\.js/.test(u)));

  await page.fill('#key-input', 'not a key');
  await page.waitForTimeout(60);
  ok('a key of the wrong shape is refused in the console too',
     /shape refused/.test(await page.locator('#key-shape').textContent()));
  await page.fill('#key-input', 'DPS-DTELCO-3');
  await page.waitForTimeout(60);
  ok('and a key of the right shape is accepted',
     /shape valid/.test(await page.locator('#key-shape').textContent()));

  /* Every control does something. A button with no listener is the defect this catches. */
  const buttons = await page.locator('button').all();
  const wired = [];
  for (const b of buttons) {
    const id = await b.getAttribute('id');
    wired.push([id, await page.evaluate(i => {
      const n = document.getElementById(i);
      return !!(n && n.onclick) || !!(n && n.__wired);
    }, id)]);
  }
  ok('every console button carries an id', wired.every(([id]) => !!id),
     wired.filter(([id]) => !id).length + ' without one');

  const html = await readFile(join(ROOT, 'verify/index.html'), 'utf8');
  /* An escaped apostrophe inside a name used to end the match early, so the assertion was
     dropped from this list and the two files disagreed by one with no way to see which.
     The class now steps over a backslash escape. */
  const consoleNames = [...html.matchAll(/name: '((?:[^'\\]|\\.)+)',\n\s+run:/g)]
    .map(m => m[1].replace(/\\(.)/g, '$1'));
  const { CHECKS } = await import('./check-backend.mjs');
  const nodeNames = CHECKS.map(c => c.name);
  /* No count is written here. A number in this assertion is a third place to update when an
     assertion is added, and it failed on exactly that the first time one was. The floor is only
     there so two empty lists cannot agree with each other. */
  ok('the console and tools/check-backend.mjs assert the same things, in the same order',
     consoleNames.length >= 8 && consoleNames.length === nodeNames.length &&
     consoleNames.every((n, i) => n === nodeNames[i]),
     `console ${consoleNames.length}, node ${nodeNames.length}` +
     (consoleNames.length === nodeNames.length
       ? ''
       : `, first difference: ${consoleNames.find((n, i) => n !== nodeNames[i]) ?? '(length only)'}`));

  /* And neither of them asks an endpoint to write into the Dengage account.
   *
   * This is the check that was missing. Two of the assertions posted a body whose behaviour
   * depended on whether an API user happened to be configured somewhere else: with none, they
   * previewed a payload, and the day credentials arrived the same body upserted 245 products into
   * the account's catalogue and wrote an order, on every run of the suite and every load of the
   * console. Nothing said so, because the reply looked healthy either way.
   *
   * The endpoints now preview by default and take the write by name. These rules hold the callers
   * to it, in both files, by reading their source rather than their behaviour: a rule about what a
   * request does can only be checked by making it, and making it is the thing being prevented. */
  const callers = { 'tools/check-backend.mjs': await readFile(
                      join(ROOT, 'tools/check-backend.mjs'), 'utf8'),
                    'verify/index.html': html };
  const near = (src, needle, want, window = 200) =>
    [...src.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))]
      .every((m) => want.test(src.slice(m.index, m.index + window)));

  const writes = [];
  for (const [file, src] of Object.entries(callers)) {
    /* The catalogue upsert, which is now asked for by name and must never be asked for here. */
    if (/\bsend:\s*true/.test(src)) writes.push(`${file} sends the catalogue`);
    /* An order, unless it is the one deliberately refused before anything is written. */
    if (!near(src, "op: 'order'", /preview: true|order_status: 'shipped'/, 260)) {
      writes.push(`${file} posts an order without preview`);
    }
    /* An operator signal reaches the Event API, and the Event API creates a contact for a key it
       has not seen. A check that mints a throwaway key would leave one behind on every run. */
    if (!near(src, "signal: 'usage_80'", /preview: true/, 260)) {
      writes.push(`${file} raises an operator signal without preview`);
    }
    /* The bulk contact upsert has no preview and is not something a check should reach for. */
    if (/dtelco-persona-seed'[\s\S]{0,200}method: 'POST'/.test(src)) {
      writes.push(`${file} posts to the persona seed`);
    }
  }
  ok('and neither of them asks an endpoint to write into the Dengage account',
     writes.length === 0,
     writes.length ? writes.join('; ') : `${Object.keys(callers).length} files, every write previewed`);

  /* The documented counts live in three places that must never disagree: the document a presenter
     reads, the checker that runs in CI, and the console that runs during a demonstration. The
     checker parses the document, so only the console holds a copy, and this is the assertion that
     keeps that copy honest. */
  const { seededCounts } = await import('./check-backend.mjs');
  const doc = seededCounts();
  const inConsole = Object.fromEntries(
    [...html.matchAll(/(\w+):\s*(\d+)[,\s]/g)]
      .filter(([, k]) => k in doc).map(([, k, v]) => [k, Number(v)]));
  ok('the console quotes the same segment counts as handoff/SEGMENTS.md',
     Object.keys(doc).length === 14 &&
     Object.keys(doc).every(k => inConsole[k] === doc[k]),
     Object.keys(doc).filter(k => inConsole[k] !== doc[k])
       .map(k => `${k} doc ${doc[k]} console ${inConsole[k]}`).join('; '));

  await page.close();
}

// --- the site's own on site engine -----------------------------------------------------------
/* Five experiences, five rule kinds, three placements. What is asserted here is the engine rather
   than any one message: that a rule fires, that a guard holds, that a close is not reported as an
   action, and that the switch hands the whole thing to Dengage without a race. */
{
  const { page, events } = await open('index.html');
  /* Four rule kinds is the complete set the engine supports: page view, dwell, scroll depth and
     exit intent. Page view carries two creatives because it is a state rather than a gesture. */
  ok('the engine registers five creatives across three placements and all four rule kinds',
     await page.evaluate(() => {
       const l = window.DTelcoCreatives.list();
       const rules = new Set(l.map(c => c.rule));
       return l.length === 5 && new Set(l.map(c => c.kind)).size === 3 &&
              ['pageView', 'dwell', 'scroll', 'exit'].every(r => rules.has(r)) && rules.size === 4;
     }));

  /* Nothing appears unprompted on a first visit: every rule reads a flag or a focus product and
     this visitor has neither. A creative that draws with no reason to is the fault that makes a
     whole engine untrustworthy. */
  ok('nothing draws for a visitor with no history',
     await page.locator('.dps-creative').count() === 0);

  await page.evaluate(() => window.DTelcoCreatives.setFlag('usage_high', true));
  await page.evaluate(() => window.DTelcoCreatives.show('usage_upsell_bar'));
  await page.waitForTimeout(150);
  ok('the launcher can show a bar on demand',
     await page.locator('#dps-creative-usage_upsell_bar').count() === 1);
  ok('and it reports the impression with the source that drew it',
     events.some(e => e.payload?.event_type === 'creative_shown' &&
                      e.payload.rule === 'usage_upsell_bar' && e.payload.source === 'launcher'));
  ok('and the bar publishes its own height, the way a served bar has to',
     await page.evaluate(() => parseInt(
       getComputedStyle(document.documentElement).getPropertyValue('--dn-banner-height'), 10) > 0));

  const before = events.filter(e => e.payload?.event_type === 'creative_action').length;
  await page.locator('#dps-creative-usage_upsell_bar [data-creative-close]').click();
  await page.waitForTimeout(120);
  ok('closing it removes it', await page.locator('#dps-creative-usage_upsell_bar').count() === 0);
  /* A close reported as an action turns every impression into an engagement and makes the numbers
     say the opposite of what happened. */
  ok('and a close is not reported as an action',
     events.filter(e => e.payload?.event_type === 'creative_action').length === before);

  await page.evaluate(() => window.DTelcoCreatives.show('usage_upsell_bar'));
  await page.waitForTimeout(120);
  await page.locator('#dps-creative-usage_upsell_bar [data-creative-action]').click();
  await page.waitForTimeout(120);
  ok('an action is reported, and names which action it was',
     events.some(e => e.payload?.event_type === 'creative_action' &&
                      e.payload.rule === 'usage_upsell_bar' && e.payload.note === 'view_upsell'));
  await page.close();
}
{
  /* The guard a presenter meets first: two automatic appearances inside the cooldown. */
  const { page } = await open('index.html');
  const why = await page.evaluate(() => {
    window.DTelcoCreatives.setFlag('churn_risk', true);
    window.DTelcoCreatives.show('churn_save_popup');
    const seen = [];
    window.addEventListener('dps:dtelco:creative', e => seen.push(e.detail));
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: 2, bubbles: true }));
    return seen;
  });
  ok('a guard says in words why a creative did not appear',
     why.some(d => d.rule === 'churn_save_popup' && !d.drawn && /already shown once|another creative/.test(d.why || '')),
     JSON.stringify(why.slice(0, 2)));
  await page.close();
}
{
  /* The switch. In panel mode the local rules stand down and the launcher fires both the data
     layer push and the window event with the same name, because the SDK's three event triggers
     split across those two mechanisms and some templates offer only one of them. */
  const { page, events } = await open('index.html?onsite=panel');
  const fired = await page.evaluate(() => {
    window.dataLayer = window.dataLayer || [];
    const heard = [];
    window.addEventListener('dtelco_demo_churn_save_popup', () => heard.push('window'));
    window.DTelcoCreatives.setFlag('churn_risk', true);
    window.DTelcoCreatives.show('churn_save_popup');
    return { heard, layer: window.dataLayer.map(r => r.event) };
  });
  ok('on panel the launcher fires the window event the engine listens on',
     fired.heard.includes('window'));
  ok('and pushes the same name to the data layer, because some templates offer only that trigger',
     fired.layer.includes('dtelco_demo_churn_save_popup'));
  ok('and the page draws nothing itself, so a popup on screen has one explainable origin',
     await page.locator('.dps-creative').count() === 0);
  ok('the mode is remembered for the next page',
     await page.evaluate(() => window.DTelcoCreatives.mode()) === 'panel');
  await page.close();
}
{
  const { page } = await open('index.html?onsite=local');
  ok('and switching back is one query parameter',
     await page.evaluate(() => window.DTelcoCreatives.mode()) === 'local');
  await page.close();
}
{
  /* The headline moment: two views of one product, and the next home page is that product. */
  const ctx = await freshContext();
  let p = (await open('product.html?id=dev-iphone-16', ctx)).page;
  await p.waitForTimeout(200); await p.close();
  p = (await open('product.html?id=dev-iphone-16', ctx)).page;
  await p.waitForTimeout(200); await p.close();
  const home = await open('index.html', ctx);
  await home.page.waitForTimeout(400);
  ok('two views of one product makes the popup that product',
     await home.page.locator('#dps-creative-focus_popup').count() === 1);
  ok('and the popup names it',
     /iPhone 16/.test(await home.page.locator('#dps-creative-focus_popup h3').innerText()));
  ok('and the impression row carries the product it was about',
     home.events.some(e => e.payload?.event_type === 'creative_shown' &&
                           e.payload.rule === 'focus_popup' &&
                           e.payload.product_id === 'dev-iphone-16'));
  await home.page.close();
}

// --- the presenter launcher ------------------------------------------------------------------
/* The readout watches, this drives. A demonstration where the presenter has to browse into a
   state before they can show a message runs out of time, so what is asserted is that every
   experience is one press away and that the two resets cannot be confused for each other. */
{
  const { page } = await open('index.html?launcher=1');
  await page.waitForTimeout(400);
  ok('the launcher opens on the query parameter',
     await page.locator('#dps-launcher').count() === 1);
  /* Remembered for the session, the way the readout is, so a presenter turns it on once and
     navigates. A new tab is a new session and correctly starts without it, which is why this
     navigates in place rather than opening one. */
  await page.goto(`http://localhost:${PORT}/plans.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  ok('and stays open across a navigation, without the parameter',
     await page.locator('#dps-launcher').count() === 1);
  await page.goto(`http://localhost:${PORT}/index.html?launcher=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  ok('quick reference names the exact string to filter page_url on',
     (await page.locator('#dps-launcher').innerText()).includes('/index.html'));
  ok('and every value it knows carries a copy button',
     await page.locator('#dps-launcher [data-copy]').count() >= 1);

  ok('every creative has a card',
     await page.locator('#dps-launcher [data-show]').count() === 5);
  /* Exit intent and scroll depth are native triggers. A card that claimed to fire one would be
     lying, so those two say which gesture to make instead. */
  ok('the two native triggers say what gesture to make rather than firing anything',
     (await page.locator('#dps-launcher').innerText()).includes('Native trigger'));

  /* Twice in a row has to work, or a presenter cannot show the same thing to a second person. */
  await page.click('#dps-launcher [data-show="focus_popup"]');
  await page.waitForTimeout(150);
  await page.click('#dps-launcher [data-show="usage_upsell_bar"]');
  await page.waitForTimeout(150);
  await page.click('#dps-launcher [data-show="usage_upsell_bar"]');
  await page.waitForTimeout(150);
  ok('a creative can be shown twice in a row from the launcher',
     await page.locator('#dps-creative-usage_upsell_bar').count() === 1);

  await page.click('#dps-launcher [data-mode="panel"]');
  await page.waitForTimeout(200);
  ok('the switch is on the launcher, and flipping it clears what was on screen',
     await page.evaluate(() => window.DTelcoCreatives.mode()) === 'panel' &&
     await page.locator('.dps-creative').count() === 0);
  await page.click('#dps-launcher [data-mode="local"]');

  /* The one that would cost a call: clearing the demo's own keys when you meant the SDK's, or the
     other way round. They are separate buttons and the SDK one only ever matches SDK keys. */
  const sdkOnly = await page.evaluate(() => {
    localStorage.setItem('__dn_probe', '1');
    localStorage.setItem('dps:dtelco:probe', '1');
    return window.DTelcoLauncher.sdkKeys();
  });
  ok('the SDK reset matches only the SDK\'s own keys',
     sdkOnly.includes('__dn_probe') && !sdkOnly.some(k => k.startsWith('dps:dtelco:')),
     sdkOnly.join(', '));
  await page.close();
}

// --- what the site claims about Dengage, tested rather than read -----------------------------
/* Every one of these was a sentence on screen before it was a behaviour. The account page promised
   the three ids were written to the contact while the relay answered 400; two pages promised a tag
   and no tag was ever written; the roaming page promised a checklist timed off a travel date and
   nothing captured a date. */
{
  const { page, events } = await open('roaming.html');
  ok('the roaming page asks for the travel date its journey is timed off',
     await page.locator('#trip-date').count() === 1);
  const tomorrow = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await page.fill('#trip-date', tomorrow);
  await page.selectOption('#trip-zone', 'tr-cis');
  await page.click('#trip-save');
  await page.waitForTimeout(200);
  const trip = events.find(e => e.payload?.event_type === 'roaming_pack');
  ok('and saving it writes a roaming_pack row', !!trip);
  /* A date the customer gave is the whole point: no behaviour can be mined for it. */
  ok('carrying the date the customer chose, not a date the site inferred',
     trip?.payload?.horizon === tomorrow, trip?.payload?.horizon);
  ok('and the zone they picked, resolved to a real pack',
     trip?.payload?.destination === 'tr-cis' && /^roam-allin-tr-cis/.test(trip?.payload?.product_id ?? ''),
     trip?.payload?.product_id);
  await page.close();
}
{
  const { page, events } = await open('support.html');
  await page.locator('[data-nps]').nth(9).click();
  await page.waitForTimeout(200);
  const tag = events.find(e => e.action === 'setTags');
  ok('an NPS answer writes a real tag, which two sentences had promised for weeks', !!tag);
  ok('and the tag bands the score rather than storing a bare number',
     JSON.stringify(tag?.payload ?? []).includes('promoter'), JSON.stringify(tag?.payload ?? []));
  await page.close();
}
{
  const { page, events } = await open('plan-finder.html');
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-answer]').first().click();
    await page.waitForTimeout(120);
  }
  const tag = events.find(e => e.action === 'setTags');
  ok('the plan finder writes the tags its lede promises', !!tag);
  /* removeTime is the only removal the SDK offers, so anything meant to expire says so up front. */
  ok('and the travel tag removes itself, because wanting to travel is not permanent',
     JSON.stringify(tag?.payload ?? []).includes('removeTime'));
  await page.close();
}
{
  /* Tested end to end at the browser edge: the three ids the rail
     showed are the three ids that leave for the contact. */
  const ctx = await freshContext();
  let p = (await open('product.html?id=dev-iphone-16', ctx)).page;
  await p.waitForTimeout(200); await p.close();
  p = (await open('product.html?id=dev-iphone-16', ctx)).page;
  await p.waitForTimeout(200); await p.close();
  const home = await open('index.html', ctx);
  await home.page.waitForTimeout(1400);
  const shown = home.events.find(e => e.payload?.event_type === 'reco_shown');
  ok('the rail reports the three products it drew', !!shown, shown?.payload?.product_id);
  ok('and it sends ids only, because the relay derives price from the id',
     !JSON.stringify(shown?.payload ?? {}).includes('reco_title_1'));
  await home.page.close();
}

// --- the refusal, demonstrated rather than assumed ----------------------------------------
{
  const page = await (await freshContext()).newPage();
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  const reached = await page.evaluate(() =>
    fetch('https://event.dengage.com/probe').then(() => true).catch(() => false));
  ok('a request to dengage.com is actually blocked', reached === false);
  await page.close();
}
ok('every dengage.com request was refused', dengageAttempts > 0 && dengageAttempts === refused,
   `${dengageAttempts} attempted, ${refused} refused`);

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
