/* The site's own on site engine: rules, guards and reporting.
 *
 * Rule 10 says realtime belongs to the site. A confirmation card that waits on a round trip is a
 * confirmation nobody believes, and a popup that arrives two seconds after the gesture that earned
 * it has already lost the moment. So these five experiences are drawn here, from local state, in
 * the same frame as the thing that triggered them.
 *
 * All five are served by the platform, and `?onsite=panel`
 * hands them back so a prospect can watch the same experience arrive from the platform instead of
 * from the page. The switch is remembered per browser and it is a switch rather than a race, so a
 * popup on screen always has one explainable origin.
 *
 * Five experiences across three placements, exercising all four rule kinds, because the engine is
 * what is being demonstrated rather than any one message. Page view carries two of them: it is a
 * state rather than a gesture, and the state differs. Dwell, scroll depth and exit intent are the
 * other three, which is the complete set:
 *
 *   focus_popup         popup   page view, when a focus product exists      once per product
 *   usage_upsell_bar    bar     page view, when the line is past 80 percent once per session
 *   upgrade_inline      inline  dwell, six seconds                          once per session
 *   seasonal_inline     inline  scroll depth, half the page, after a dwell  once per session
 *   churn_save_popup    popup   exit intent                                 once per visitor
 *
 * Every appearance writes a creative_shown row and every action that is not a close writes a
 * creative_action row, both carrying source rule or launcher, so a self drawn experience has the
 * impression and action rows an engine served campaign has.
 *
 * Three things here are scars rather than choices.
 *
 * Every selector is namespaced under the creative's root id. Inline creatives are not sandboxed:
 * the engine puts their style in document.head and clones their HTML into the target, so a bare
 * `.title` rule from one creative restyles the whole storefront.
 *
 * A rule reads the same store its flag was written to. A flag written to sessionStorage and read
 * from localStorage is a creative that never appears and never errors.
 *
 * A dwell rule waits out its own delay from when the rule started, not from page load, or a rule
 * with a six second dwell fires immediately on a page the visitor reached after eight seconds
 * somewhere else.
 *
 * THE TEMPLATE BEHIND EACH CREATIVE
 *
 * One line per creative: the name it reports, the platform template that produces the same
 * experience, the documentation page that defines it, and whether the template ships today or
 * needs confirming in the account. focus_hero is the recognition band and is drawn by js/site.js
 * rather than by the array below, and it is reported through this engine's own cap, so it is
 * annotated here with the rest.
 *
 * tools/check-coverage.mjs reads these lines. A creative added without one fails the build, and a
 * line naming a creative the code no longer draws fails the build.
 *
 * The four triggers behind them, page view, dwell, scroll depth and exit intent, are the engine's
 * complete set of trigger records, and ?onsite=panel hands every experience below back to the
 * engine so the same thing can be watched arriving from the platform.
 *
 * @maps focus_hero :: Inline Personalization, an inline element placed in the page with Add Customization on source, text, link and button :: docs/inline-personalization :: yes
 * @maps focus_popup :: Image Popup or CTA Image Popup, with Advanced Personalization in Onsite :: docs/image-popup :: yes
 * @maps usage_upsell_bar :: Sticky Bar, or Basic Sticky Bar :: docs/sticky-bar :: yes
 * @maps upgrade_inline :: Inline Onsite, or Custom Inline :: docs/inline-onsite :: yes
 * @maps seasonal_inline :: Inline Onsite on a campaign audience :: docs/inline-onsite :: yes
 * @maps churn_save_popup :: Image Popup on an exit intent trigger :: docs/image-popup :: yes
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var EV = window.DengageEvents;
  var REC = window.DTelcoRecognition;
  var CAT = window.DTelcoCatalog;
  var S = window.DTelcoSite;

  function key(name) { return 'dps:' + SLUG + ':' + name; }
  function esc(s) { return S ? S.esc(s) : String(s == null ? '' : s); }

  function readStore(store, name, fallback) {
    try { return JSON.parse(store.getItem(key(name)) || 'null') || fallback; }
    catch (e) { return fallback; }
  }
  function writeStore(store, name, value) {
    try { store.setItem(key(name), JSON.stringify(value)); } catch (e) {}
  }

  /* ---------------------------------------------------------------- the switch */

  /* Remembered per browser, so a presenter flips it once and it survives the next page. The query
     parameter wins when present, which is what makes it flippable mid call. */
  function mode() {
    var q = window.location.search;
    if (/[?&]onsite=panel/.test(q)) { writeStore(localStorage, 'onsite', 'panel'); return 'panel'; }
    if (/[?&]onsite=local/.test(q)) { writeStore(localStorage, 'onsite', 'local'); return 'local'; }
    return readStore(localStorage, 'onsite', 'local');
  }

  /* ---------------------------------------------------------------- flags */

  /* The one store every rule reads. The account page writes what the profile endpoint answered,
     the operator page writes what a pressed signal did, and nothing else writes here. A rule that
     read a second store would be a rule nobody could explain when it failed to appear. */
  function flags() { return readStore(localStorage, 'flags', {}); }

  function setFlag(name, value) {
    var f = flags();
    if (value === null || value === undefined) { delete f[name]; } else { f[name] = value; }
    writeStore(localStorage, 'flags', f);
    window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':flags', { detail: f }));
  }

  /* ---------------------------------------------------------------- guards */

  var COOLDOWN_MS = 25000;
  var onScreen = null;
  var lastAutomatic = 0;

  function seenThisSession(id) {
    return readStore(sessionStorage, 'creatives:session', {})[id] === true;
  }
  function markSession(id) {
    var seen = readStore(sessionStorage, 'creatives:session', {});
    seen[id] = true;
    writeStore(sessionStorage, 'creatives:session', seen);
  }
  function seenEver(id) {
    return readStore(localStorage, 'creatives:visitor', {})[id] === true;
  }
  function markEver(id) {
    var seen = readStore(localStorage, 'creatives:visitor', {});
    seen[id] = true;
    writeStore(localStorage, 'creatives:visitor', seen);
  }

  /* Why a creative did not appear, in words, because a presenter asking "why did nothing happen"
     deserves an answer and the debug readout is where it goes. */
  function blockedBecause(c, source) {
    if (mode() === 'panel') { return 'the switch is on panel, so Dengage serves this one'; }
    if (onScreen) { return 'another creative is on screen: ' + onScreen; }
    if (source === 'rule' && Date.now() - lastAutomatic < COOLDOWN_MS) {
      return 'inside the ' + (COOLDOWN_MS / 1000) + ' second cooldown between automatic appearances';
    }
    if (c.once === 'visitor' && seenEver(c.id)) { return 'already shown once to this visitor'; }
    if (c.once === 'session' && seenThisSession(c.id)) { return 'already shown once this session'; }
    return null;
  }

  /* ---------------------------------------------------------------- drawing */

  function close(root, c, how) {
    if (!root || !root.parentNode) { return; }
    root.parentNode.removeChild(root);
    if (onScreen === c.id) { onScreen = null; }
    if (c.kind === 'bar') { window.dispatchEvent(new Event('resize')); }
    /* A close is not an action. Reporting it as one turns every impression into an engagement and
       makes the numbers say the opposite of what happened. */
    if (how) { report('creative_action', c, how); }
  }

  function report(type, c, action, source) {
    if (!EV) { return; }
    EV.custom(type, {
      rule: c.id,
      source: source || c.source || 'rule',
      placement: c.kind,
      product_id: c.product_id || null,
      note: action || null
    });
  }

  function button(label, action) {
    return '<button type="button" data-creative-action="' + esc(action) + '">' + esc(label) + '</button>';
  }

  function draw(c, source) {
    var body = c.render();
    if (!body) { return false; }

    var root = document.createElement('div');
    root.id = 'dps-creative-' + c.id;
    root.className = 'dps-creative dps-creative-' + c.kind;
    root.setAttribute('data-source', source);
    root.innerHTML =
      '<div class="dps-creative-inner">' + body +
        '<button type="button" class="dps-creative-close" aria-label="Close" ' +
        'data-creative-close="1">&#215;</button>' +
      '</div>';

    if (c.kind === 'inline') {
      var slot = document.getElementById(c.slot);
      if (!slot) { return false; }        // a missing target is a creative that never appears
      slot.appendChild(root);
    } else {
      document.body.appendChild(root);
    }

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-creative-close]')) { close(root, c, null); return; }
      var act = e.target.closest('[data-creative-action]');
      if (!act) { return; }
      var name = act.getAttribute('data-creative-action');
      report('creative_action', c, name, source);
      if (c.onAction) { c.onAction(name); }
      close(root, c, null);
    });

    onScreen = c.id;
    if (source === 'rule') { lastAutomatic = Date.now(); }
    if (c.once === 'visitor') { markEver(c.id); }
    if (c.once === 'session') { markSession(c.id); }

    /* A sticky bar takes the same pixels a fixed header takes, so it publishes its own height the
       way a served bar does. slots.js clamps and applies it. */
    if (c.kind === 'bar') {
      window.setTimeout(function () {
        window.postMessage({ dnBanner: 'height', px: root.getBoundingClientRect().height }, '*');
      }, 20);
    }

    report('creative_shown', c, null, source);
    return true;
  }

  /* ---------------------------------------------------------------- the five */

  function focusProduct() { return REC ? REC.focus() : null; }

  var CREATIVES = [
    {
      id: 'focus_popup',
      kind: 'popup',
      rule: 'pageView',
      once: 'visitor',
      pages: ['home'],
      why: 'two views of one product, so the popup is that product',
      when: function () { return !!focusProduct(); },
      render: function () {
        var f = focusProduct();
        if (!f) { return null; }
        this.product_id = f.product_id;
        var img = CAT && CAT.image ? CAT.image(f.product_id, 400) : f.image;
        return '<div class="dps-creative-media"><img alt="" src="' + esc(img) + '"></div>' +
               '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">Still thinking about it</p>' +
                 '<h3>' + esc(f.title) + '</h3>' +
                 '<p>You have looked at this one ' + f.views + ' times. Here it is, and the ' +
                 'accessories that fit it are below.</p>' +
                 button('See it again', 'view_focus') +
               '</div>';
      },
      onAction: function () {
        var f = focusProduct();
        if (f) { window.location.href = (S ? S.rel() : '') + 'product.html?id=' + encodeURIComponent(f.product_id); }
      }
    },
    {
      id: 'usage_upsell_bar',
      kind: 'bar',
      rule: 'pageView',
      once: 'session',
      why: 'the line is past 80 percent of its allowance',
      when: function () { return !!flags().usage_high; },
      render: function () {
        var f = flags();
        return '<div class="dps-creative-copy">' +
                 '<strong>Running low on data.</strong> ' +
                 '<span>' + esc(f.next_plan || 'The next tier') + ' gives you ' +
                 esc(f.next_data || 'more') + '.</span>' +
                 button('See the tier above', 'view_upsell') +
               '</div>';
      },
      onAction: function () { window.location.href = (S ? S.rel() : '') + 'plans.html'; }
    },
    {
      id: 'upgrade_inline',
      kind: 'inline',
      slot: 'dn_inline_target_reco',
      rule: 'dwell',
      after: 6000,
      once: 'session',
      why: 'the contract is ending and the visitor stayed long enough to be reading',
      when: function () { return !!flags().upgrade_eligible; },
      render: function () {
        var f = flags();
        return '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">Upgrade</p>' +
                 '<h3>Your contract ends' + (f.contract_days ? ' in ' + esc(f.contract_days) + ' days' : ' soon') + '</h3>' +
                 '<p>Trade up and keep your number. Nothing about your line changes.</p>' +
                 button('See my upgrade', 'view_upgrade') +
               '</div>';
      },
      onAction: function () { window.location.href = (S ? S.rel() : '') + 'shop.html'; }
    },
    {
      id: 'seasonal_inline',
      kind: 'inline',
      slot: 'dn_inline_target_below_header',
      rule: 'scroll',
      depth: 0.5,
      minDwell: 3000,
      once: 'session',
      why: 'a campaign is running and the visitor is reading rather than passing through',
      when: function () { return !!flags().campaign; },
      render: function () {
        var f = flags();
        return '<div class="dps-creative-copy">' +
                 '<h3>' + esc(f.campaign) + '</h3>' +
                 '<p>For a few days only. ' + esc(f.campaign_note || 'The best of it goes first.') + '</p>' +
                 button('See the offers', 'view_seasonal') +
               '</div>';
      },
      onAction: function () { window.location.href = (S ? S.rel() : '') + 'offers.html'; }
    },
    {
      id: 'churn_save_popup',
      kind: 'popup',
      rule: 'exit',
      once: 'visitor',
      why: 'a port out is in and the pointer left through the top of the window',
      when: function () { return !!flags().churn_risk; },
      render: function () {
        var f = flags();
        return '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">Before you go</p>' +
                 '<h3>' + esc(f.downsell || 'One offer worth a look') + '</h3>' +
                 '<p>Your port out is already in and nothing here delays it. If this is not ' +
                 'enough, it goes ahead exactly as you asked.</p>' +
                 button('See the offer', 'view_save') +
               '</div>';
      },
      onAction: function () { window.location.href = (S ? S.rel() : '') + 'offers.html'; }
    }
  ];

  /* ---------------------------------------------------------------- the rules */

  /* The page type is on body, not on the root element. Reading the wrong one returns null, every
     page scoped rule sees no match, and nothing appears with no error anywhere: exactly the
     silent failure the inline slots have. */
  function pageType() {
    return (document.body && document.body.getAttribute('data-page-type')) || '';
  }

  function eligible(c) {
    if (c.pages && c.pages.indexOf(pageType()) < 0) { return false; }
    return c.when();
  }

  function attempt(c, source) {
    var blocked = blockedBecause(c, source);
    if (blocked) {
      announce(c.id, false, blocked);
      return false;
    }
    if (source === 'rule' && !eligible(c)) {
      announce(c.id, false, 'its rule does not match this page or this visitor');
      return false;
    }
    var drew = draw(c, source);
    announce(c.id, drew, drew ? null : 'it had nothing to render');
    return drew;
  }

  function announce(id, drew, why) {
    window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':creative', {
      detail: { rule: id, drawn: !!drew, why: why || null, mode: mode() }
    }));
  }

  /* In panel mode the local rules stand down and the launcher fires the event Dengage listens on,
     so exactly one thing is on screen and its origin is never in doubt. */
  function handOver(c) {
    var name = SLUG + '_demo_' + c.id;
    /* Both, with the same name, every time. The SDK's three event triggers split across two
       mechanisms: DATA_LAYER_EVENT wraps window.dataLayer.push, and CUSTOM_EVENT and
       DENGAGE_EVENT listen on the window. Some templates do not offer the data layer trigger at
       all, so a card that only pushed there was dead for those in the worst way: nothing errors
       and the widget simply never appears. */
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, actionType: name });
    window.dispatchEvent(new CustomEvent(name, { detail: { slug: SLUG } }));
    announce(c.id, false, 'handed to Dengage as ' + name);
  }

  var started = Date.now();
  var timers = [];

  function runPageViewRules() {
    CREATIVES.filter(function (c) { return c.rule === 'pageView'; })
      .forEach(function (c) { attempt(c, 'rule'); });
  }

  /* A dwell rule waits out its own delay measured from when the rule started, and the three second
     sweep re-checks eligibility rather than assuming it held. A flag can arrive after page load. */
  function runDwellRules() {
    CREATIVES.filter(function (c) { return c.rule === 'dwell'; }).forEach(function (c) {
      timers.push(window.setInterval(function () {
        if (Date.now() - started < c.after) { return; }
        if (seenThisSession(c.id) || seenEver(c.id)) { return; }
        attempt(c, 'rule');
      }, 3000));
    });
  }

  function runScrollRules() {
    var list = CREATIVES.filter(function (c) { return c.rule === 'scroll'; });
    if (!list.length) { return; }
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var depth = h > 0 ? window.scrollY / h : 1;
      list.forEach(function (c) {
        if (depth < c.depth) { return; }
        if (Date.now() - started < (c.minDwell || 0)) { return; }
        attempt(c, 'rule');
      });
    }, { passive: true });
  }

  function runExitRules() {
    var list = CREATIVES.filter(function (c) { return c.rule === 'exit'; });
    if (!list.length) { return; }
    document.addEventListener('mouseout', function (e) {
      if (e.relatedTarget || e.clientY > 8) { return; }   // out through the top, not sideways
      list.forEach(function (c) { attempt(c, 'rule'); });
    });
  }

  /* ---------------------------------------------------------------- api */

  var api = {
    mode: mode,
    setMode: function (m) {
      writeStore(localStorage, 'onsite', m === 'panel' ? 'panel' : 'local');
      return api.mode();
    },
    list: function () {
      return CREATIVES.map(function (c) {
        return { id: c.id, kind: c.kind, rule: c.rule, once: c.once, why: c.why,
                 eligible: eligible(c), blocked: blockedBecause(c, 'launcher') };
      });
    },
    flags: flags,
    setFlag: setFlag,
    /* The launcher shows a creative on demand and says so in the row, because a presenter needs
       to show one twice in a row and a rule that fired is a different fact from a button pressed. */
    show: function (id) {
      var c = CREATIVES.filter(function (x) { return x.id === id; })[0];
      if (!c) { return false; }
      if (mode() === 'panel') { handOver(c); return false; }
      if (onScreen) { close(document.getElementById('dps-creative-' + onScreen),
                            { id: onScreen, kind: 'popup' }, null); }
      return draw(c, 'launcher');
    },
    closeAll: function () {
      Array.prototype.forEach.call(document.querySelectorAll('.dps-creative'), function (el) {
        if (el.parentNode) { el.parentNode.removeChild(el); }
      });
      onScreen = null;
    },
    /* The recognition band is drawn by js/site.js, not by this engine, because it is a state the
       page is in rather than a message laid over it: a returning visitor sees it on every visit
       and capping its appearance would be capping the page. The impression is what is capped.
       It reported a creative_shown on every single page load, so a visitor who opened the home
       page four times produced four impressions of a band that never went away, beside five
       creatives that report one per cap window. Routing it through the same session store makes
       the numbers comparable, and this is the only door into that store from outside. */
    impression: function (id, productId) {
      if (seenThisSession(id)) { return false; }
      markSession(id);
      report('creative_shown', { id: id, kind: 'inline', product_id: productId || null }, null,
             'rule');
      return true;
    },
    reset: function () {
      try {
        sessionStorage.removeItem(key('creatives:session'));
        localStorage.removeItem(key('creatives:visitor'));
      } catch (e) {}
      lastAutomatic = 0;
      return true;
    }
  };
  window.DTelcoCreatives = api;

  document.addEventListener('DOMContentLoaded', function () {
    if (mode() === 'panel') { announce('all', false, 'the switch is on panel'); return; }
    runPageViewRules();
    runDwellRules();
    runScrollRules();
    runExitRules();
  });
})(window, document);
