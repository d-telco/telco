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
 * Eight experiences across three placements, exercising all four rule kinds plus the event
 * trigger the games use, because the engine is what is being demonstrated rather than any one
 * message. Page view carries three of them: it is a state rather than a gesture, and the state
 * differs. Dwell, scroll depth and exit intent are three more, and the two games fire from the
 * moment that earns them rather than from a rule:
 *
 *   focus_popup         popup   page view, when a focus product exists      once per product
 *   usage_upsell_bar    bar     page view, when the line is past 80 percent once per session
 *   upgrade_inline      inline  dwell, six seconds                          once per session
 *   seasonal_inline     inline  scroll depth, half the page, after a dwell  once per session
 *   churn_save_popup    popup   exit intent                                 once per visitor
 *   spin_wheel          popup   event, a completed top up                   once per session
 *   scratch_card        popup   event, an NPS answer of 9 or 10             once per session
 *   countdown_offer     inline  page view, while the seasonal window is open once per session
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
 * @maps spin_wheel :: Gamification, Spin to Win, on the top up moment :: docs/gamification :: verify
 * @maps scratch_card :: Gamification, Scratch Card, as the NPS thank you :: docs/gamification :: verify
 * @maps countdown_offer :: Gamification, Countdown, on the seasonal window :: docs/gamification :: verify
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var EV = window.DengageEvents;
  var REC = window.DTelcoRecognition;
  var CAT = window.DTelcoCatalog;
  var S = window.DTelcoSite;
  var ID = window.DTelcoIdentity;

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

  /* ---------------------------------------------------------------- the games */

  /* Stand ins for the panel's Gamification templates, drawn by this engine under its own caps and
     reported through its own rows while the templates await enabling: confirm item 21 in
     ACCOUNT-SETUP.md, arriving next week per the account owner. Three honesty rules hold them
     together. The surface is the site's and each one says so on its face. The coupon list is the
     account's, read live at the moment of the win. And no surface but the platform's own ever
     shows a code, because that is the measured platform design: the API masks codes on read and
     offers no assignment call, so a full code exists only inside a message the platform sends,
     where it is also marked taken. */

  /* Six wedges. A short face for the wheel itself, drawn on the segment, and the full prize the
     result spells out, because a code the platform issues is described in full where it lands. */
  var WHEEL_SEGMENTS = [
    { face: '$5 OFF',    label: '5 dollars off', coupon: true,  fill: '#E4002B' },
    { face: '10% ACC',   label: '10 percent off accessories', coupon: true,  fill: '#14161a' },
    { face: 'FREE\nSHIP', label: 'Free shipping', coupon: true,  fill: '#FF6B00' },
    { face: '2X DATA',   label: 'Double data for a month', coupon: false, fill: '#00A878' },
    { face: 'TRY\nAGAIN', label: 'Try again', coupon: false, fill: '#5a6270' },
    { face: '$10 OFF',   label: '10 dollars off a device', coupon: true,  fill: '#8338EC' }
  ];
  var SEG = 360 / WHEEL_SEGMENTS.length;

  var STAND_IN = '<p class="dps-game-small">The site draws this stand in. The panel\'s ' +
                 'Gamification template takes the surface over when it is enabled.</p>';

  /* The wheel as SVG, so the prizes are drawn on the wheel itself with crisp labels rather than
     a striped disc with a legend beside it. Segment i spans [i*SEG, (i+1)*SEG] clockwise from the
     top, which is the convention the landing maths below rotates against. A point at angle a
     (clockwise from top) at radius r sits at (C + r sin a, C - r cos a). */
  function wheelSVG() {
    var C = 100, R = 96, rad = function (d) { return d * Math.PI / 180; };
    var pt = function (a, r) {
      return [ (C + r * Math.sin(rad(a))).toFixed(2), (C - r * Math.cos(rad(a))).toFixed(2) ];
    };
    var parts = ['<svg viewBox="0 0 200 200" class="dps-wheel-svg" data-wheel-disc aria-hidden="true">'];
    for (var i = 0; i < WHEEL_SEGMENTS.length; i++) {
      var s = WHEEL_SEGMENTS[i], a1 = i * SEG, a2 = (i + 1) * SEG;
      var p1 = pt(a1, R), p2 = pt(a2, R);
      parts.push('<path d="M' + C + ',' + C + ' L' + p1[0] + ',' + p1[1] +
                 ' A' + R + ',' + R + ' 0 0 1 ' + p2[0] + ',' + p2[1] + ' Z" fill="' + s.fill +
                 '" stroke="#ffffff" stroke-width="1.5"></path>');
      /* The label sits at the wedge mid angle, rotated to read radially and flipped on the left
         half so it never hangs upside down. Two short lines when the face carries a newline. */
      var mid = a1 + SEG / 2, lp = pt(mid, 62);
      var rot = mid + (mid > 90 && mid < 270 ? 180 : 0);
      var lines = s.face.split('\n');
      var tspans = '';
      for (var k = 0; k < lines.length; k++) {
        tspans += '<tspan x="' + lp[0] + '" dy="' + (k === 0 ? (lines.length > 1 ? '-0.35em' : '0.32em') : '1em') +
                  '">' + lines[k] + '</tspan>';
      }
      parts.push('<text x="' + lp[0] + '" y="' + lp[1] + '" transform="rotate(' + rot.toFixed(1) +
                 ' ' + lp[0] + ' ' + lp[1] + ')" text-anchor="middle" class="dps-wheel-label">' +
                 tspans + '</text>');
    }
    parts.push('<circle cx="100" cy="100" r="16" fill="#ffffff" stroke="#14161a" stroke-width="2"></circle>');
    parts.push('<circle cx="100" cy="100" r="5" fill="#E4002B"></circle></svg>');
    return parts.join('');
  }

  /* A confetti burst, written here rather than pulled from a host, because nothing loads from a
     third party at runtime. Forty paper rectangles fall with gravity and spin for a second and a
     half over a canvas that covers the popup, then the canvas removes itself. */
  var CONFETTI_COLORS = ['#E4002B', '#FF6B00', '#FFC300', '#00A878', '#3A86FF', '#8338EC'];
  function confettiBurst(root) {
    if (!root || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      return;
    }
    var box = root.getBoundingClientRect();
    var cv = document.createElement('canvas');
    cv.className = 'dps-confetti';
    cv.width = Math.max(1, Math.round(box.width));
    cv.height = Math.max(1, Math.round(box.height));
    root.appendChild(cv);
    var ctx = cv.getContext('2d');
    if (!ctx) { return; }
    var bits = [];
    for (var i = 0; i < 44; i++) {
      bits.push({ x: cv.width / 2 + (Math.random() - 0.5) * 60, y: cv.height / 3,
        vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 7,
        w: 5 + Math.random() * 5, h: 7 + Math.random() * 6, rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4, c: CONFETTI_COLORS[i % CONFETTI_COLORS.length] });
    }
    var start = Date.now();
    (function frame() {
      var t = Date.now() - start;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var j = 0; j < bits.length; j++) {
        var b = bits[j];
        b.vy += 0.28; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, 1 - t / 1500); ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      }
      if (t < 1500 && cv.parentNode) { window.requestAnimationFrame(frame); }
      else if (cv.parentNode) { cv.parentNode.removeChild(cv); }
    })();
  }

  /* One win, three records: the engine's own creative_action row, the dtelco-games row, and the
     live list read the visitor is shown. Never a code: the platform masks them on read, so the
     code reaches a winner inside the message the platform sends, and this popup says so. */
  function gameResult(c, mount, prize, couponBacked) {
    report('creative_action', c, 'win: ' + prize);
    var contact = ID ? (ID.get() || ID.claim(c.id)) : null;
    var base = cfg.functions.base;
    var posted = contact ? fetch(base + cfg.functions.games, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_key: contact, game: c.id, placement: c.kind, prize: prize })
    }).then(function (r) { return r.json(); }).catch(function () { return {}; })
      : Promise.resolve({});
    var list = couponBacked
      ? fetch(base + cfg.functions.coupons, { credentials: 'omit' })
          .then(function (r) { return r.json(); }).catch(function () { return {}; })
      : Promise.resolve({});
    Promise.all([posted, list]).then(function (both) {
      var win = both[0] || {}, l = both[1] || {};
      var html = '<h3>' + esc(prize) + '</h3>';
      if (couponBacked) {
        html += '<p>' + (l.name
          ? esc(l.name) + ', read live from the account: ' + esc(String(l.available)) + ' of ' +
            esc(String(l.total)) + ' codes waiting.'
          : 'The coupon list could not be read just now.') +
          ' Your code arrives inside the message the platform sends and is marked taken at that ' +
          'moment: the API masks codes on read, so no surface but the platform\'s own ever ' +
          'shows one.</p>';
      } else {
        html += '<p>Recorded against your line as a demonstration reward.</p>';
      }
      html += '<p class="dps-game-small">The win is on record: a creative action row in the ' +
              'platform\'s event table' +
              (win.win_id ? ', and dtelco-games row ' + esc(String(win.win_id)) : '') + '.</p>';
      mount.innerHTML = html;
      mount.hidden = false;
      /* The reveal is the payoff: a short pop as the result lands and, for a real prize, a burst
         of confetti over the whole popup. A "try again" never gets here, so every arrival here is
         worth celebrating. */
      mount.classList.remove('dps-pop'); void mount.offsetWidth; mount.classList.add('dps-pop');
      confettiBurst(document.getElementById('dps-creative-' + c.id));
    });
  }

  function gameMount(id) {
    var root = document.getElementById('dps-creative-' + id);
    return root ? root.querySelector('.dps-game-result') : null;
  }

  /* The scratch cover: a foil gradient with a diagonal sheen, painted after the popup is attached,
     erased under the pointer with soft round strokes, and revealed once enough of it is gone. The
     same after-attach beat the sticky bar uses for its height report. */
  function paintFoil(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#c3c8d2'); g.addColorStop(0.45, '#a7adb9');
    g.addColorStop(0.5, '#d9dde4'); g.addColorStop(0.55, '#a7adb9');
    g.addColorStop(1, '#b9bec9');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(90,98,112,0.9)';
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Scratch to reveal', w / 2, h / 2 + 4);
  }
  function initScratch(c) {
    var root = document.getElementById('dps-creative-scratch_card');
    if (!root) { return; }
    var canvas = root.querySelector('canvas');
    if (!canvas || !canvas.getContext) { return; }
    var ctx = canvas.getContext('2d');
    paintFoil(ctx, canvas.width, canvas.height);
    var strokes = 0, last = null;
    function erase(e) {
      if (c.revealed) { return; }
      var r = canvas.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      var x = (p.clientX - r.left) * (canvas.width / r.width);
      var y = (p.clientY - r.top) * (canvas.height / r.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 30; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (last) { ctx.moveTo(last.x, last.y); ctx.lineTo(x, y); ctx.stroke(); }
      ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
      last = { x: x, y: y };
      strokes += 1;
      if (strokes % 6 !== 0) { return; }
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      var clear = 0;
      for (var i = 3; i < img.length; i += 4) { if (img[i] === 0) { clear += 1; } }
      if (clear / (img.length / 4) > 0.42) { revealScratch(c, canvas); }
    }
    canvas.addEventListener('mousedown', function () { last = null; });
    canvas.addEventListener('mousemove', function (e) { if (e.buttons) { erase(e); } });
    canvas.addEventListener('touchstart', function () { last = null; }, { passive: true });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); erase(e); },
                            { passive: false });
  }

  function revealScratch(c, canvas) {
    if (c.revealed) { return; }
    c.revealed = true;
    /* The foil clears rather than snapping off: a quick fade, then the prize underneath is the
       one thing on the card. */
    if (canvas) {
      canvas.style.transition = 'opacity .35s ease';
      canvas.style.opacity = '0';
      window.setTimeout(function () { if (canvas.parentNode) { canvas.style.display = 'none'; } }, 360);
    }
    var stage = document.querySelector('#dps-creative-scratch_card .dps-scratch-stage');
    if (stage) { stage.classList.add('dps-scratch-won'); }
    var mount = gameMount('scratch_card');
    if (mount) { gameResult(c, mount, '10 percent off accessories', true); }
  }

  /* The countdown ticks to the demo day's end, because the dataset rolls daily: a deadline read
     from the build rather than invented for the creative. Each field is its own digit box and the
     seconds box flips on every tick, so the clock reads as a live countdown rather than as text
     that quietly changes. Self clearing once the node is gone. */
  function initCountdown() {
    var root = document.getElementById('dps-creative-countdown_offer');
    if (!root) { return; }
    var clock = root.querySelector('[data-countdown-clock]');
    if (!clock) { return; }
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var box = function (v, label) {
      return '<span class="dps-cd-box"><b data-cd="' + label + '">' + v + '</b>' +
             '<i>' + label + '</i></span>';
    };
    var prev = {};
    var timer = window.setInterval(function () {
      if (!document.body.contains(clock)) { window.clearInterval(timer); return; }
      var now = new Date();
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      var s = Math.max(0, Math.floor((end - now) / 1000));
      var vals = { hrs: pad(Math.floor(s / 3600)), min: pad(Math.floor((s % 3600) / 60)),
                   sec: pad(s % 60) };
      if (!clock.firstChild) {
        clock.innerHTML = box(vals.hrs, 'hrs') + '<em>:</em>' + box(vals.min, 'min') +
                          '<em>:</em>' + box(vals.sec, 'sec');
      }
      for (var f in vals) {
        if (vals[f] === prev[f]) { continue; }
        prev[f] = vals[f];
        var el = clock.querySelector('[data-cd="' + f + '"]');
        if (el) { el.textContent = vals[f]; el.classList.remove('dps-cd-flip');
                  void el.offsetWidth; el.classList.add('dps-cd-flip'); }
      }
      /* Under the last hour the clock turns urgent on its own, which is the whole point of a
         countdown rather than a date printed on the tile. */
      clock.classList.toggle('dps-cd-urgent', s < 3600);
    }, 500);
  }

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
    },
    {
      id: 'spin_wheel',
      kind: 'popup',
      rule: 'event',
      once: 'session',
      why: 'a top up completed, which is the telco moment gamification earns: recharge and win',
      when: function () { return true; },
      render: function () {
        return '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">Recharge and win</p>' +
                 '<h3>Spin for your reward</h3>' +
                 '<div class="dps-wheel-stage">' +
                   '<span class="dps-wheel-pin" aria-hidden="true"></span>' +
                   wheelSVG() +
                 '</div>' +
                 button('Spin the wheel', 'spin') +
                 '<div class="dps-game-result" hidden></div>' +
                 STAND_IN +
               '</div>';
      },
      onAction: function (name) {
        if (name !== 'spin' || this.spinning) { return; }
        var c = this;
        var root = document.getElementById('dps-creative-spin_wheel');
        var disc = root ? root.querySelector('[data-wheel-disc]') : null;
        var btn = root ? root.querySelector('[data-creative-action="spin"]') : null;
        if (!disc) { return; }
        c.spinning = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Spinning...'; }
        c.spun = (c.spun || 0);
        var idx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
        /* Five full turns on top of wherever it rests, plus the offset that brings this wedge's
           middle under the pointer at the top. A small random jitter inside the wedge keeps two
           spins from stopping at the identical pixel. Cumulative, so it never jumps backwards. */
        var jitter = (Math.random() - 0.5) * (SEG - 14);
        var landing = (360 - (idx * SEG + SEG / 2)) - jitter;
        c.rot = (c.rot || 0);
        var next = c.rot + 5 * 360 + (((landing - (c.rot % 360)) % 360 + 360) % 360);
        c.rot = next;
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        disc.style.transition = reduce ? 'none' : 'transform 4.2s cubic-bezier(.15,.85,.25,1)';
        void disc.getBoundingClientRect();
        disc.style.transform = 'rotate(' + next + 'deg)';
        window.setTimeout(function () {
          c.spinning = false;
          var seg = WHEEL_SEGMENTS[idx];
          var mount = gameMount('spin_wheel');
          if (!mount) { return; }
          if (!seg.coupon && seg.label === 'Try again') {
            report('creative_action', c, 'win: try again');
            mount.innerHTML = '<h3>So close</h3><p>The wheel landed on Try again. Give it ' +
                              'another spin.</p>';
            mount.hidden = false;
            mount.classList.remove('dps-pop'); void mount.offsetWidth; mount.classList.add('dps-pop');
            if (btn) { btn.disabled = false; btn.textContent = 'Spin again'; }
            return;
          }
          if (btn) { btn.remove(); }
          gameResult(c, mount, seg.label, seg.coupon);
        }, reduce ? 200 : 4300);
      }
    },
    {
      id: 'scratch_card',
      kind: 'popup',
      rule: 'event',
      once: 'session',
      why: 'an NPS answer of 9 or 10, and the thank you is a card rather than a sentence',
      when: function () { return true; },
      render: function () {
        this.revealed = false;
        window.setTimeout(function () {
          var c = CREATIVES.filter(function (x) { return x.id === 'scratch_card'; })[0];
          initScratch(c);
        }, 40);
        return '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">Thank you for the feedback</p>' +
                 '<h3>Scratch to reveal your reward</h3>' +
                 '<div class="dps-scratch-stage">' +
                   '<div class="dps-scratch-under"><span>10% off</span>' +
                     '<small>accessories</small></div>' +
                   '<canvas width="280" height="120"></canvas>' +
                 '</div>' +
                 button('Reveal it for me', 'reveal') +
                 '<div class="dps-game-result" hidden></div>' +
                 STAND_IN +
               '</div>';
      },
      onAction: function (name) {
        if (name !== 'reveal') { return; }
        var root = document.getElementById('dps-creative-scratch_card');
        revealScratch(this, root ? root.querySelector('canvas') : null);
      }
    },
    {
      id: 'countdown_offer',
      kind: 'inline',
      slot: 'dn_inline_target_in_grid',
      rule: 'pageView',
      once: 'session',
      pages: ['shop', 'plans'],
      why: 'the seasonal window is open and between the tiles is where a deadline sells',
      when: function () { return !!flags().campaign; },
      render: function () {
        var f = flags();
        window.setTimeout(initCountdown, 40);
        return '<div class="dps-creative-copy">' +
                 '<p class="dps-creative-kicker">' + esc(f.campaign) + '</p>' +
                 '<h3>Offer ends in</h3>' +
                 '<div class="dps-countdown" data-countdown-clock></div>' +
                 '<p>' + esc(f.campaign_note || 'The best of it goes first.') +
                 ' The clock runs to the demo day\'s end, because the dataset rolls daily.</p>' +
                 button('See the offers', 'view_countdown') +
                 STAND_IN +
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
