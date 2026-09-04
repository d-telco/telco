/* Page wiring. Fires the page view first, then draws everything the catalogue drives.
 *
 * Sections are declarative: an element carries data-render and this file fills it, so a page
 * fragment stays readable and every page shares one renderer rather than carrying its own copy
 * of a card template.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var ID = window.DTelcoIdentity;
  var EV = window.DengageEvents;
  var CAT = window.DTelcoCatalog;
  var REC = window.DTelcoRecognition;
  var RECO = window.DTelcoReco;
  var SLUG = cfg.slug;
  var body = document.body;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rel() { return document.documentElement.getAttribute('data-rel-root') || ''; }
  function money(n) { return cfg.locale.symbol + Number(n).toFixed(cfg.locale.decimals); }

  // ---------------------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    ID.write('theme', theme, false);
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-set]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === theme));
    });
  }
  applyTheme(ID.read('theme') || 'light');
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-theme-set]');
    if (b) { applyTheme(b.getAttribute('data-theme-set')); }
  });

  // ---------------------------------------------------------------------------------------
  // The page view, first, before anything else asks for anything.
  // page_url is the only route back to this demo's rows and session_id is the only join
  // between the tables, so a page that skips this writes rows belonging to no demo at all.
  // ---------------------------------------------------------------------------------------
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  var pageType = body.getAttribute('data-page-type') || 'other';
  var productId = param('id') || body.getAttribute('data-product-id') || undefined;
  var indexed = (window.DTELCO_INDEX && productId) ? window.DTELCO_INDEX[productId] : null;
  if (productId && !indexed) { productId = undefined; }   // an unknown id is not a product view

  EV.pageView(pageType, {
    category_path: (indexed && indexed[0]) || body.getAttribute('data-category-path') || undefined,
    product_id: productId,
    price: indexed ? indexed[1] : (body.getAttribute('data-price') || undefined),
    stock_count: indexed ? indexed[2] : undefined,
    promotion_id: param('promo') || body.getAttribute('data-promotion-id') || undefined
  });
  // Section 4.6 of the SDK setup: the country of a web device is something the site sets, and
  // nothing sets it by itself. One call per page, from the same value initialize was given.
  if (cfg.locale.country) { EV.setCountry(cfg.locale.country); }
  window.DTelcoParam = param;

  // ---------------------------------------------------------------------------------------
  // Card templates
  // ---------------------------------------------------------------------------------------
  function productCard(p) {
    var out = CAT.inStock(p.product_id) ? '' :
      '<span class="badge badge-out">Out of stock</span>';
    var demo = (p.tags || []).indexOf('demo-data') >= 0 ?
      '<span class="badge badge-demo" title="Not a published figure">demo data</span>' : '';
    return '<a class="card" href="' + rel() + 'product.html?id=' + encodeURIComponent(p.product_id) + '">' +
      '<img class="thumb" loading="lazy" width="400" height="400" alt="' + esc(p.title) + '" src="' +
        rel() + 'assets/catalog/' + esc(p.image_slug) + '-400.jpg">' +
      '<span class="body">' +
        '<span class="brand">' + esc(p.brand) + '</span>' +
        '<span class="name">' + esc(p.title) + '</span>' +
        (out || demo ? '<span>' + out + ' ' + demo + '</span>' : '') +
        '<span class="price">' + money(p.discounted_price) +
          (p.validity_days ? ' <small>/ ' + p.validity_days + ' days</small>' : '') +
        '</span>' +
      '</span></a>';
  }

  function tariffCard(p) {
    var lines = String(p.description).split(',').slice(0, 5).map(function (l) {
      return '<li>' + esc(l.trim()) + '</li>';
    }).join('');
    var ussd = (p.ussd_code || '').split('').map(function (c) {
      return '<span>' + esc(c) + '</span>';
    }).join('');
    return '<article class="tariff">' +
      '<div class="head"><div class="kicker">Tariff</div>' +
        '<div class="pill">' + esc(p.title.toUpperCase()) + '</div>' +
        '<div class="cost">' + money(p.discounted_price) +
          ' <small>/ ' + (p.validity_days || 28) + ' days</small></div>' +
        (ussd ? '<div class="ussd">' + ussd + '</div>' : '') +
      '</div>' +
      '<ul class="lines">' + lines + '</ul>' +
      '<div class="actions">' +
        '<a class="btn btn-outline" href="' + rel() + 'product.html?id=' +
          encodeURIComponent(p.product_id) + '">More</a>' +
        '<button class="btn btn-primary" type="button" data-join="' +
          esc(p.product_id) + '">Join now</button>' +
      '</div></article>';
  }

  // ---------------------------------------------------------------------------------------
  // The recognition band. Drawn only for a visitor the site has seen twice on one product,
  // which is the whole point: the first visitor sees the ordinary hero, the second sees this.
  // ---------------------------------------------------------------------------------------
  function recognitionBand(host) {
    var focus = REC.focus();
    if (!focus) { host.hidden = true; return; }
    var p = CAT.product(focus.product_id);
    if (!p) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML =
      '<div class="wrap recog">' +
        '<img alt="" width="220" height="220" src="' + rel() + 'assets/catalog/' +
          esc(p.image_slug) + '-400.jpg">' +
        '<div class="recog-copy">' +
          '<span class="why"><span class="rule">focus_hero</span> you looked at this ' +
            focus.n + ' times</span>' +
          '<h2>Still thinking about the ' + esc(p.title) + '?</h2>' +
          '<p class="lede">' + esc(p.description) + '</p>' +
          '<div class="recog-actions">' +
            '<a class="btn btn-primary" href="' + rel() + 'product.html?id=' +
              encodeURIComponent(p.product_id) + '">See it again</a>' +
            '<span class="price-big">' + money(p.discounted_price) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    /* Once per session, through the same store the five engine creatives use. Reported here
       rather than by the engine because the band belongs to the page: it is the returning
       visitor state, not a message laid over the page, and it stays for as long as the visitor
       keeps returning. What is capped is the impression, not the band. */
    window.DTelcoCreatives.impression('focus_hero', p.product_id);
  }

  function recoRail(host) {
    var results = RECO.recommend({
      currentProductId: productId,
      cart: EV.cart(),
      profile: window.DTelcoProfile || null
    });
    if (!results.length) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML =
      '<div class="section-head"><h2>Recommended for you</h2>' +
        '<span class="why">the same three ids are written to the contact, so ' +
        'an email, a WhatsApp or an on site message shows the same three</span>' +
      '</div><div class="grid">' +
      results.map(function (r) {
        return '<div class="reco-item" data-reco="' + esc(r.product.product_id) +
               '" data-rule="' + esc(r.rule) + '">' + productCard(r.product) +
               '<span class="why"><span class="rule">' + esc(r.rule) + '</span> ' +
               esc(r.why || '') + '</span></div>';
      }).join('') + '</div>';
    RECO.report(results, 'web');
  }

  // ---------------------------------------------------------------------------------------
  // Declarative sections
  // ---------------------------------------------------------------------------------------
  var RENDERERS = {
    tariffs: function (host, arg) {
      host.innerHTML = CAT.byCategory(arg || 'Mobile>Plans>Prepaid GO', true)
        .slice(0, Number(host.getAttribute('data-limit')) || 6).map(tariffCard).join('');
    },
    products: function (host, arg) {
      host.innerHTML = CAT.byCategory(arg, true)
        .slice(0, Number(host.getAttribute('data-limit')) || 8).map(productCard).join('');
    },
    reco: recoRail,
    recognition: recognitionBand
  };

  function draw(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-render]'), function (host) {
      if (host.hasAttribute('data-drawn')) { return; }
      var fn = RENDERERS[host.getAttribute('data-render')];
      if (!fn) { return; }
      host.setAttribute('data-drawn', '');    // set BEFORE calling, so a renderer that draws
      fn(host, host.getAttribute('data-arg'));// its own children cannot re-enter itself
    });
    if (root) { return; }
    if (productId) {
      var p = CAT.product(productId);
      if (p) { REC.record(p); }             // after pageView, never before it
    }
    updateCart();
  }

  /* A renderer that wants its own newly created sections drawn calls this, never draw(). */
  function drawWithin(host) { draw(host); }

  /* Redraw one host on purpose, for the case where its inputs changed rather than the page. */
  function redraw(hostOrSelector) {
    var host = typeof hostOrSelector === 'string'
      ? document.querySelector(hostOrSelector) : hostOrSelector;
    if (!host) { return; }
    host.removeAttribute('data-drawn');
    draw(host.parentNode || document);
  }

  /* The recognition band and the rails answer the threshold themselves. Nothing has to know to
     call draw() after a second view: the page reacts to the fact, which is what makes the
     experience arrive in the same second rather than on the next navigation. */
  window.addEventListener('dps:' + SLUG + ':focus', function () {
    redraw('#recognition');
    Array.prototype.forEach.call(document.querySelectorAll('[data-render="reco"]'), redraw);
  });

  // ---------------------------------------------------------------------------------------
  // Cart badge and the join button
  // ---------------------------------------------------------------------------------------
  /* Units, not lines. Two cases of the same model is a basket of two, and a badge reading one
     while the basket page reads two is the kind of small wrongness a room notices. */
  function updateCart() {
    var n = EV.cart().reduce(function (t, i) {
      var q = Number(i && i.quantity);
      return t + (Number.isFinite(q) && q > 0 ? Math.round(q) : 1);
    }, 0);
    var el = document.getElementById('cart-count');
    if (el) { el.hidden = !n; el.textContent = String(n); }
  }

  document.addEventListener('click', function (e) {
    var join = e.target.closest && e.target.closest('[data-join]');
    if (join) {
      var p = CAT.product(join.getAttribute('data-join'));
      if (!p) { return; }
      EV.addToCart({ product_id: p.product_id, product_variant_id: p.product_id,
                     unit_price: p.discounted_price, discounted_price: p.discounted_price,
                     stock_count: p.stock_count, quantity: 1 });
      updateCart();
      confirm('Added to your basket', p.title + ' is ready to check out.');
    }
    var reco = e.target.closest && e.target.closest('[data-reco]');
    if (reco) {
      RECO.clicked(reco.getAttribute('data-reco'), reco.getAttribute('data-rule'), 'web');
    }
    /* The header search routes to the catalogue's own search rather than drawing a second one.
       Search is already demonstrated on every listing page and a second surface for the same
       mechanism is repetition, not coverage. This icon sat in the header of all twenty five pages
       doing nothing until the dead control check stopped trusting a naming convention. */
    var search = e.target.closest && e.target.closest('[data-open="search"]');
    if (search) {
      var local = document.getElementById('q');
      if (local) {
        local.focus();
        local.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        window.location.href = rel() + 'shop.html?focus=q';
      }
    }
  });

  /* The confirmation card is drawn here, by the page, instantly. Dengage is told what happened;
     it is never asked to draw it. That is rule 10, and it is also the only way a confirmation
     appears in the same second the visitor acted. */
  function confirm(title, message) {
    var el = document.createElement('div');
    el.className = 'dps-confirm';
    el.innerHTML = '<strong>' + esc(title) + '</strong><span>' + esc(message) + '</span>';
    document.body.appendChild(el);
    window.setTimeout(function () { el.classList.add('in'); }, 10);
    window.setTimeout(function () { el.classList.remove('in'); }, 4200);
    window.setTimeout(function () { el.remove(); }, 4800);
    window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':confirmation',
      { detail: { moment: title, message: message } }));
  }

  // Hero carousel. Three offers, dots and arrows, all real controls.
  var SLIDES = [
    { img: 'hero-ai',      alt: 'Internet for AI from D\u00b7TELCO', href: 'plans.html',
      promotion_id: 'promo-free-ai' },
    { img: 'hero-esim',    alt: 'Your number on eSIM in minutes',    href: 'numbers.html',
      promotion_id: 'promo-esim' },
    { img: 'hero-roaming', alt: 'Travel with your own number',       href: 'roaming.html',
      promotion_id: 'promo-roaming' }
  ];
  var heroImg = document.getElementById('hero-img');
  var heroDots = document.getElementById('hero-dots');
  var heroAt = 0, heroTimer = null;

  function showSlide(i, byHand) {
    if (!heroImg) { return; }
    heroAt = (i + SLIDES.length) % SLIDES.length;
    var s = SLIDES[heroAt];
    heroImg.src = rel() + 'assets/editorial/' + s.img + '-1600.jpg';
    heroImg.alt = s.alt;
    if (heroImg.parentNode.tagName === 'A') { heroImg.parentNode.href = rel() + s.href; }
    Array.prototype.forEach.call(heroDots ? heroDots.children : [], function (b, n) {
      b.setAttribute('aria-current', String(n === heroAt));
    });
    if (byHand) { EV.custom('creative_action', { rule: 'hero_carousel', source: 'launcher',
                                                 note: s.promotion_id }); }
  }

  if (heroDots && heroImg) {
    heroDots.innerHTML = SLIDES.map(function (s, i) {
      return '<button type="button" role="tab" aria-current="' + (i === 0) +
             '" aria-label="' + esc(s.alt) + '" data-slide="' + i + '"></button>';
    }).join('');
    heroDots.addEventListener('click', function (e) {
      var b = e.target.closest('[data-slide]');
      if (b) { window.clearInterval(heroTimer); showSlide(Number(b.getAttribute('data-slide')), true); }
    });
    heroTimer = window.setInterval(function () { showSlide(heroAt + 1); }, 6500);
    showSlide(0);
  }

  var notice = document.getElementById('demo-notice');
  if (notice) { notice.textContent = cfg.demoNotice; }

  CAT.ready(function () { window.setTimeout(draw, 0); });
  CAT.fetch(rel()).catch(function () {
    var m = document.getElementById('main');
    if (m) {
      m.insertAdjacentHTML('afterbegin',
        '<div class="wrap"><p class="demo-notice">The catalogue feed did not load, so the ' +
        'product sections on this page are empty. Everything else still works.</p></div>');
    }
  });

  window.DTelcoSite = {
    confirm: confirm, productCard: productCard, tariffCard: tariffCard,
    draw: draw, drawWithin: drawWithin, redraw: redraw, esc: esc, money: money, rel: rel, param: param,
    updateCart: updateCart, pageType: pageType, productId: productId,
    // pages.js adds the renderers that only one or two pages need, so this file stays the
    // shared spine rather than growing a branch per page.
    register: function (name, fn) { RENDERERS[name] = fn; }
  };
})(window, document);
