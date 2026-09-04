/* The phone check.
 *
 * The browser suite sweeps every page at 1280, where nothing is cramped and everything fits. A
 * telecom marketplace is used on a phone, and a prospect will open it on one in the room, so this
 * sweeps the same pages at 390 by 844 and asserts the things that only break at that width: a page
 * that scrolls sideways, a tap target too small for a thumb, copy too small to read, a fixed header
 * covering the first heading, an image that never loads.
 *
 * It blocks dengage.com like the suite does, and asserts that it blocked it. A check that can write
 * into a shared account is a check nobody can run twice.
 */
import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from './pages.mjs';

const BUNDLED = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                 '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => existsSync(p));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8102;
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
let refused = 0;
const phone = devices['iPhone 13'];
const ctx = await browser.newContext({ ...phone, hasTouch: true });
await ctx.route('**/*', route => {
  if (/dengage\.com|supabase\.co/i.test(route.request().url())) { refused++; return route.abort(); }
  return route.continue();
});

/* 44 is Apple's own floor and 48 is Google's. 40 is the line below which a control is a mistake
   on any phone, so anything under it is a failure and anything between 40 and 44 is reported. */
const FLOOR = 40, COMFORTABLE = 44;

const sideways = [], tiny = [], smallText = [], covered = [], brokenImages = [], snug = [];

for (const [path] of PAGES) {
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);
  /* Lazy images below the fold are correctly unloaded until they are reached, so the page is
     scrolled before anything is asked about them, yielding two frames at each step. A tight loop
     of scrollTo calls returns before the browser has painted anything, so the observer that loads
     the images never fires and every one of them reads as broken: the first version of this check
     reported eighteen missing images on the home page and all eighteen were fine. Then wait for
     the network rather than a guessed delay. */
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});

  const report = await page.evaluate(({ FLOOR, COMFORTABLE }) => {
    const out = { over: [], small: [], text: [], images: [], snug: [], covered: null };
    const vw = window.innerWidth;

    if (document.documentElement.scrollWidth > vw + 1) {
      /* Naming the widest element turns "this page scrolls sideways" into a fix. */
      let worst = null, worstRight = vw;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const right = r.right + window.scrollX;
        if (right > worstRight + 1 && getComputedStyle(el).overflowX !== 'auto') {
          worst = el; worstRight = right;
        }
      }
      out.over.push(worst
        ? `${worst.tagName.toLowerCase()}${worst.className ? '.' + String(worst.className).split(' ')[0] : ''} reaches ${Math.round(worstRight)} of ${vw}`
        : `scrollWidth ${document.documentElement.scrollWidth} of ${vw}`);
    }

    for (const el of document.querySelectorAll('a, button, input, select, [role="button"]')) {
      if (el.offsetParent === null) continue;
      if (el.closest('#dps-debug')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      /* A link inside a paragraph is text, not a tap target, and holding it to 44 would mean
         double spaced prose. Only standalone controls are measured. */
      const inProse = el.tagName === 'A' && el.closest('p, li, td');
      if (inProse) continue;
      /* A checkbox is 13 pixels wide whatever a stylesheet asks for. The target a person actually
         taps is its label, so that is what gets measured. Measuring the box instead reports a
         failure no amount of CSS on the input can fix. */
      if (el.type === 'checkbox' || el.type === 'radio') {
        const label = el.closest('label') ||
          (el.id && document.querySelector(`label[for="${el.id}"]`));
        if (!label) { out.small.push(`${el.type} with no label to tap`); continue; }
        const lr = label.getBoundingClientRect();
        if (Math.min(lr.width, lr.height) < FLOOR) {
          out.small.push(`label for ${el.type} ${Math.round(lr.width)}x${Math.round(lr.height)}`);
        }
        continue;
      }
      const label = `${el.tagName.toLowerCase()} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 18)}"`;
      const min = Math.min(r.width, r.height);
      if (min < FLOOR) out.small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (min < COMFORTABLE) out.snug.push(`${label} ${Math.round(min)}`);
    }

    for (const el of document.querySelectorAll('p, li, td, span, a, div')) {
      if (el.offsetParent === null || !el.childNodes.length) continue;
      const own = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3 && n.textContent.trim().length > 20).length;
      if (!own) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) out.text.push(`${el.tagName.toLowerCase()} at ${px}px`);
    }

    for (const img of document.querySelectorAll('img')) {
      if (img.offsetParent === null) continue;
      if (!img.complete || img.naturalWidth === 0) out.images.push(img.getAttribute('src') || '(no src)');
    }

    /* A pinned header covering the first heading is the classic phone fault, and the brief warns
       about it by name. Measured rather than assumed. */
    const header = document.querySelector('header');
    const h1 = document.querySelector('h1');
    if (header && h1 && getComputedStyle(header).position === 'fixed') {
      const hb = header.getBoundingClientRect(), tb = h1.getBoundingClientRect();
      if (tb.top < hb.bottom) out.covered = `h1 top ${Math.round(tb.top)} under header bottom ${Math.round(hb.bottom)}`;
    }
    return out;
  }, { FLOOR, COMFORTABLE });

  if (report.over.length) sideways.push(`${path}: ${report.over.join('; ')}`);
  if (report.small.length) tiny.push(`${path}: ${[...new Set(report.small)].slice(0, 4).join(' | ')}`);
  if (report.snug.length) snug.push(`${path}: ${[...new Set(report.snug)].length}`);
  if (report.text.length) smallText.push(`${path}: ${[...new Set(report.text)].slice(0, 3).join(', ')}`);
  if (report.images.length) brokenImages.push(`${path}: ${report.images.slice(0, 3).join(', ')}`);
  if (report.covered) covered.push(`${path}: ${report.covered}`);

  await page.close();
}

ok(`no page scrolls sideways at ${phone.viewport.width}`, sideways.length === 0,
   sideways.slice(0, 3).join('  //  '));
ok(`every tap target is at least ${FLOOR} pixels`, tiny.length === 0, tiny.slice(0, 3).join('  //  '));
ok('no copy is under 12 pixels', smallText.length === 0, smallText.slice(0, 3).join('  //  '));
ok('every visible image loaded', brokenImages.length === 0, brokenImages.slice(0, 3).join('  //  '));
ok('no fixed header covers the first heading', covered.length === 0, covered.slice(0, 3).join('  //  '));

/* Reported rather than failed: between 40 and 44 is usable, and holding a dense tariff table to
   44 everywhere would cost more than it buys. Worth seeing, not worth blocking on. */
console.log(snug.length
  ? `note: ${snug.length} page(s) carry a control between ${FLOOR} and ${COMFORTABLE} pixels`
  : `note: every tap target is at least ${COMFORTABLE} pixels`);

/* The funnel, on a phone, because a basket that cannot be reached with a thumb is the fault that
   matters most and it does not show at 1280. */
{
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/product.html?id=dev-iphone-16`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const buy = page.locator('#pdp-add');
  ok('a product page offers its buy button on a phone', await buy.count() > 0);
  await buy.click();
  await page.waitForTimeout(250);
  ok('and the basket badge updates after a tap',
     (await page.locator('#cart-count').innerText()) === '1');
  await page.goto(`http://localhost:${PORT}/cart.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  ok('the basket lists the line on a phone', (await page.locator('.cart-line').count()) >= 1);
  ok('and the basket does not scroll sideways',
     await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();
}

ok('every dengage.com and supabase.co request was refused', refused > 0, `${refused} refused`);

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} phone assertions passed on ${PAGES.length} pages at ${phone.viewport.width}x${phone.viewport.height}`);
process.exit(failed.length ? 1 : 0);
