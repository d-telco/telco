/* Inline slots and the sticky bar clearance.
 *
 * Two things this file exists for, both learned live.
 *
 * An inline campaign injects into the page's own flow at a target selector, so the targets have
 * to exist even when they are empty. A missing target is not an error: the campaign simply
 * never appears, which is the worst way for anything to fail.
 *
 * WHY THE SLOTS ARE NAMED AND DECLARED RATHER THAN IMPROVISED
 *
 * reference/on-site-message, Inline Target Selector, describes how a marketer picks the target in
 * the panel: the selector "scans all HTML nodes in page and finds the ones that contains search
 * word on their class or id", then lists optimised query selectors and reports a target count for
 * each. It prioritises id queries.
 *
 * That has a direct consequence for this markup. A slot with a generic class produces a query
 * matching many nodes and a campaign that lands in the wrong place, or in five places. Every slot
 * below therefore carries a unique id AND a shared class, which gives the panel exactly what its
 * example describes:
 *
 *   #dn_inline_target_cart_above_summary   target count 1, the one to pick
 *   .dn-inline-target                      target count = every slot on the page, the one to browse
 *
 * So a marketer searches "dn_inline" in the selector, sees every slot this site offers highlighted
 * on the live page, and picks one. Nothing has to be guessed from a screenshot.
 *
 * A top sticky bar served by the engine takes the same pixels as a fixed header, so it hides
 * the logo and the navigation. The page cannot read the height of a bar rendered inside a full
 * viewport iframe from outside it, so it finds the bar by shape, publishes a clearance, and
 * accepts the bar's own height report over postMessage, clamped.
 */
(function (window, document) {
  'use strict';

  var SLUG = window.DTELCO_CONFIG.slug;
  var MAX_BANNER = 220;                      // clamp: a bar taller than this is a mis-report

  /* The slot map. One row per place a campaign can be dropped, naming the pages it exists on and
     the telecom moment it is there for. handoff/ONSITE-SLOTS.md is generated from this shape and
     tools/check-slots.mjs asserts every row against the built pages, so a slot that a runbook
     promises and a page does not carry fails the build rather than the demonstration.

     `pages: '*'` means every page. Otherwise the exact file names, because a slot is only useful
     where the moment is real: a top up bonus belongs on the top up page and nowhere else. */
  var SLOTS = [
    { id: 'dn_inline_target_below_header', pages: '*',
      where: 'directly under the site header, above the page content',
      moment: 'the site wide strip. A campaign, a service notice, an outage message' },
    { id: 'dn_inline_target_above_footer', pages: '*',
      where: 'the last block before the footer',
      moment: 'the closer. Newsletter, the app, a standing offer' },
    { id: 'dn_inline_target_reco', pages: '*',
      where: 'beside the recommendation rail',
      moment: 'a merchandised block next to what the engine chose, so the two can be compared' },

    { id: 'dn_inline_target_below_hero', pages: ['index.html'],
      where: 'under the home hero, above the tariff rail',
      moment: 'the homepage banner. The one slot every marketer asks for first' },
    { id: 'dn_inline_target_in_grid',
      pages: ['plans.html', 'shop.html', 'internet.html', 'roaming.html', 'numbers.html',
              'athome.html', 'archive.html'],
      where: 'under the results grid',
      moment: 'between the tiles. A tier nobody is picking, or two worth comparing' },
    { id: 'dn_inline_target_pdp_below_price', pages: ['product.html'],
      where: 'under the price, above the variants',
      moment: 'instalments, trade in, or the bundle that fits this handset' },
    { id: 'dn_inline_target_cart_above_summary', pages: ['cart.html'],
      where: 'above the totals, below the lines',
      moment: 'the last word before they see the total. An accessory, a delivery promise' },
    { id: 'dn_inline_target_checkout_beside_payment', pages: ['checkout.html'],
      where: 'above the payment block',
      moment: 'reassurance, or the reminder that a code from an email goes in the box above' },
    { id: 'dn_inline_target_account_beside_usage', pages: ['account.html'],
      where: 'directly under the usage figures',
      moment: 'the upsell where the number that justifies it is already on screen' },
    { id: 'dn_inline_target_topup_above_amounts', pages: ['topup.html'],
      where: 'above the amount buttons',
      moment: 'a bonus on a top up, at the moment money is being added' },
    { id: 'dn_inline_target_roaming_above_zones', pages: ['roaming.html'],
      where: 'above the zone picker',
      moment: 'the pre trip pack, before the zone is even chosen' },
    { id: 'dn_inline_target_support_above_form', pages: ['support.html'],
      where: 'above the contact form',
      moment: 'deflection. Answering the question before it becomes a ticket' },
    { id: 'dn_inline_target_orders_above_list', pages: ['orders.html'],
      where: 'above the order list',
      moment: 'after the purchase. The accessory, the delivery, the eSIM that is not installed' }
  ];

  var TARGETS = SLOTS.map(function (s) { return s.id; });

  /* Every slot the current page is meant to carry, by file name. The path comes from the shell's
     data-site-path, which build-pages.py writes, rather than from location.pathname, so a page
     opened from a file system or behind a sub path answers the same. */
  function pagePath() {
    var el = document.documentElement;
    return (el && el.getAttribute('data-site-path')) || '';
  }
  function slotsForThisPage() {
    var path = pagePath();
    return SLOTS.filter(function (s) {
      return s.pages === '*' || s.pages.indexOf(path) >= 0;
    });
  }

  function setBanner(px) {
    var clamped = Math.max(0, Math.min(MAX_BANNER, Math.round(px || 0)));
    document.documentElement.style.setProperty('--dn-banner-height', clamped + 'px');
    return clamped;
  }

  function publishHeaderClearance() {
    var header = document.getElementById('site-header');
    if (!header) { return; }
    var rect = header.getBoundingClientRect();
    document.documentElement.style.setProperty('--dn-header-clearance',
      Math.round(rect.bottom + window.scrollY) + 'px');
  }

  /* A served bar is not ours and carries no class we chose, so it is found by shape: fixed or
     sticky, anchored to the top, near full width, short, and no more than a few levels under
     body. Anything else on the page that matches that description is already a banner. */
  function looksLikeTopBar(el) {
    if (!el || el.nodeType !== 1 || el === document.body) { return false; }
    if (el.id && TARGETS.indexOf(el.id) >= 0) { return false; }
    var cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') { return false; }
    var r = el.getBoundingClientRect();
    if (r.top > 4 || r.height < 24 || r.height > MAX_BANNER) { return false; }
    if (r.width < window.innerWidth * 0.9) { return false; }
    var depth = 0, node = el;
    while (node && node !== document.body && depth < 5) { node = node.parentNode; depth++; }
    return node === document.body;
  }

  function measure() {
    var found = 0;
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (looksLikeTopBar(el)) { found = Math.max(found, el.getBoundingClientRect().height); }
    });
    setBanner(found);
    publishHeaderClearance();
  }

  var api = {
    targets: TARGETS,
    slots: SLOTS,
    /* What this page is meant to carry, and what it actually does. Nothing creates a missing slot
       silently: a page that wants one declares it in the map above. This only reports, so a check
       can fail a page that dropped a target during an edit. */
    expected: function () { return slotsForThisPage().map(function (s) { return s.id; }); },
    ensure: function () {
      return api.expected().filter(function (id) { return !document.getElementById(id); });
    },
    /* An id that appears twice makes the panel's optimised query match two nodes, and a campaign
       drawn twice is worse than one drawn nowhere. */
    duplicates: function () {
      return api.expected().filter(function (id) {
        return document.querySelectorAll('[id="' + id + '"]').length > 1;
      });
    },
    banner: setBanner,
    measure: measure
  };

  window.addEventListener('message', function (event) {
    var d = event.data;
    if (d && d.dnBanner === 'height' && typeof d.px === 'number') { setBanner(d.px); }
    // The 17 shared creatives render cross origin and ask the host page for its palette.
    if (d && d.dnTheme === 'request' && event.source) {
      var css = window.getComputedStyle(document.documentElement);
      event.source.postMessage({ dnTheme: 'reply', theme: {
        primary: css.getPropertyValue('--red').trim(), onPrimary: '#ffffff',
        accent: css.getPropertyValue('--red-hot').trim(), ink: css.getPropertyValue('--ink').trim(),
        muted: css.getPropertyValue('--muted').trim(), surface: css.getPropertyValue('--surface').trim(),
        page: css.getPropertyValue('--page').trim(), line: css.getPropertyValue('--line').trim(),
        tint: css.getPropertyValue('--pink').trim(), radius: '12px', brandText: 'D·TELCO',
        shadow: '0 12px 28px rgba(20,22,26,.12)',
        displayFont: css.getPropertyValue('--font').trim(),
        bodyFont: css.getPropertyValue('--font').trim()
      } }, '*');
    }
  });

  if (window.MutationObserver) {
    new window.MutationObserver(measure).observe(document.documentElement,
      { childList: true, subtree: true });
  }
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  document.addEventListener('DOMContentLoaded', measure);

  window.DTelcoSlots = api;
})(window, document);
