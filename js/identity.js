/* Identity. Runs synchronously in the head, before the SDK snippet, and sets window.__dnInit.
 *
 * Learned the expensive way: a build that initialises anonymously and sets the contact
 * key five seconds later had its first pageView land on the anonymous device profile, so the
 * contact card showed nothing. The key has to be known before initialize is called, which is
 * why this file is synchronous, has no dependencies, and sits above the SDK snippet.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var SHAPE = cfg.contactKey.shape;
  var PREFIX = cfg.contactKey.prefix;

  function key(name) { return 'dps:' + SLUG + ':' + name; }

  // Two demos have shared one origin before. Without the slug they adopt each other's contact,
  // cart, wishlist and inbox read state, which is not a bug anyone enjoys diagnosing live.
  function read(name) {
    try { return window.sessionStorage.getItem(key(name)) ||
                 window.localStorage.getItem(key(name)); } catch (e) { return null; }
  }
  function write(name, value, session) {
    try {
      (session ? window.sessionStorage : window.localStorage).setItem(key(name), value);
      if (!session) { window.sessionStorage.setItem(key(name), value); }
    } catch (e) { /* private mode: the demo still runs, it just forgets */ }
  }
  function clearKey(name) {
    try { window.sessionStorage.removeItem(key(name)); window.localStorage.removeItem(key(name)); }
    catch (e) { /* private mode */ }
  }

  function valid(k) { return typeof k === 'string' && SHAPE.test(k); }

  // A timestamp, not a counter. Low numbers are the personas a presenter is already
  // demonstrating as, and minting DPS-DTELCO-3 over a seeded persona would be quietly awful.
  function mint() { return PREFIX + Date.now(); }

  function fromUrl() {
    var m = /[?&]ck=([^&#]+)/.exec(window.location.search);
    if (!m) { return null; }
    var candidate = decodeURIComponent(m[1]);
    return valid(candidate) ? candidate : null;
  }

  var resolved = fromUrl();
  if (resolved) {
    write('ck', resolved, true);                 // a ?ck= persona lasts the tab, not the machine
  } else {
    var stored = read('ck');
    resolved = valid(stored) ? stored : null;
  }

  window.DTelcoIdentity = {
    slug: SLUG,
    key: key,
    valid: valid,
    mint: mint,
    get: function () { return resolved; },
    // Called when the visitor first becomes addressable: they allowed push, submitted a form,
    // or crossed the recognition threshold. Returns the key so callers can pass it straight on.
    claim: function (reason) {
      if (!resolved) {
        resolved = mint();
        write('ck', resolved, false);
        window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':identified',
          { detail: { contactKey: resolved, reason: reason || 'unknown', minted: true } }));
      }
      return resolved;
    },
    // Signing in as a known contact, or registering. Refuses anything that is not shape valid,
    // because setContactKey with an unknown key does not fail, it creates that contact.
    adopt: function (candidate, reason) {
      if (!valid(candidate)) { return null; }
      resolved = candidate;
      write('ck', resolved, false);
      window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':identified',
        { detail: { contactKey: resolved, reason: reason || 'sign-in', minted: false } }));
      return resolved;
    },
    read: read,
    write: write,
    // Signed in is a stronger fact than a contact key: a wishlist save mints a key on an
    // anonymous device, and that visitor is not signed in. So it is its own flag, set only when a
    // person actually signs in, registers or picks a persona, and it carries the display name the
    // header greets them by. The header reads this rather than the key, so anonymous browsing
    // still shows Join and Sign in.
    signedIn: function () { var v = read('signedin'); return v ? v : null; },
    signIn: function (name) {
      write('signedin', name || resolved || 'account', false);
      window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':auth',
        { detail: { signedIn: true, name: name || null } }));
    },
    // Logout returns the browser to a guest: the sign in flag and the contact key both go, so the
    // next page load initialises anonymous. Nothing is removed from Dengage or Supabase, only this
    // browser's own local state, which is what the reset clears too.
    signOut: function () {
      clearKey('signedin'); clearKey('ck');
      resolved = null;
      window.dispatchEvent(new CustomEvent('dps:' + SLUG + ':auth', { detail: { signedIn: false } }));
    }
  };

  /* -------------------------------------------------------------------------------------
   * What the SDK snippet reads on the very next line.
   *
   * An OBJECT, not a bare string. dev.dengage.com documents initialize as taking
   * { contactKey } or { deviceId } or both. Passing the key as a bare
   * string is worth spelling out, because it fails in exactly the way the paragraph above
   * warns about: the key ignored at initialize, the first pageView landing on the anonymous
   * device profile, and the contact card quietly empty. Measured against the documented
   * contract on 3 September 2026.
   *
   * Since SDK 2.3.0 the object takes more than identity, and the reason is timing rather than
   * tidiness. reference/recommendation-web-sdk: "When these methods called after WebSDK
   * Initialize, most up-to-date data may not be used within Onsite Recommendation display
   * process. Because display process may start before WebSDK receives the data from the public
   * methods." So everything the SDK needs to decide what to draw goes in the first call:
   *
   *   pageView   equivalent of the pageView method, and reference/on-site-message says passing
   *              it here is the approach for a site that is not a single page application
   *   cartItems  equivalent of setCart
   *   language, currency, location   equivalents of setLanguage, setCurrency, setLocation
   *
   * This file is the only place that can do it, because it is the only one that runs before the
   * snippet. Everything it needs is already in the head: js/config.js for the locale and the
   * application, js/catalog-index.js for the product a product page is showing, and the cart in
   * this browser's own storage.
   * ------------------------------------------------------------------------------------- */

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* The page type is on <html>, not on <body>, because <body> does not exist yet when this
     runs. tools/partials/shell.html writes it to both, and the two are the same string. */
  function pageView() {
    var root = document.documentElement;
    var type = root.getAttribute('data-page-type') || 'other';
    var id = param('id');
    var indexed = (id && window.DTELCO_INDEX) ? window.DTELCO_INDEX[id] : null;
    var view = { page_type: type };
    /* An id nothing in the catalogue answers to is not a product view. Passing it anyway would
       write a page_view_events row naming a product that does not exist. */
    if (indexed) {
      view.product_id = id;
      view.category_path = indexed[0];
      view.price = indexed[1];
      /* No discount is carried in the index, and reference/on-site-message is explicit that
         when there is no discount the non discounted price is what discounted_price takes. */
      view.discounted_price = indexed[1];
      /* Number(null) is 0 and a 0 here announces the product out of stock, so an absent count
         is omitted rather than defaulted. */
      if (typeof indexed[2] === 'number') { view.stock_count = indexed[2]; }
    }
    var promo = param('promo');
    if (promo) { view.promotion_id = promo; }
    return view;
  }

  /* The setCart shape, which is not the ec:addToCart shape. reference/ecommerce-events writes a
     cart line as unit_price for the shopping_cart_events table; reference/recommendation-web-sdk
     writes the same line for setCart as price, with category_path, has_discount and
     has_promotion beside it. Two consumers, two documented shapes, and sending one where the
     other is expected loses the field rather than reporting it. */
  function cartItems() {
    var raw;
    try { raw = JSON.parse(read('cart') || '[]'); } catch (e) { return []; }
    if (!raw || !raw.length) { return []; }
    return raw.map(function (item) {
      var indexed = window.DTELCO_INDEX ? window.DTELCO_INDEX[item.product_id] : null;
      var price = typeof item.unit_price === 'number' ? item.unit_price
                : (indexed ? indexed[1] : undefined);
      var discounted = typeof item.discounted_price === 'number' ? item.discounted_price : price;
      var line = {
        product_id: item.product_id,
        product_variant_id: item.product_variant_id || item.product_id,
        quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1
      };
      if (indexed) { line.category_path = indexed[0]; }
      if (typeof price === 'number') {
        line.price = price;
        line.discounted_price = discounted;
        line.has_discount = discounted < price;
        /* Nothing in this catalogue runs a promotion, so this is false rather than absent: the
           parameter is a boolean the SDK reads, and omitting it says nothing at all. */
        line.has_promotion = false;
      }
      return line;
    }).filter(function (line) { return !!line.product_id; });
  }

  var locale = cfg.locale || {};
  var init = {
    /* Sent on every call whether or not anybody is known, because
       reference/recommendation-web-sdk says of exactly these: "Parameters above should always be
       provided with same logic on every initialize call." */
    language: locale.language,
    currency: locale.currency,
    location: locale.location,
    cartItems: cartItems(),
    pageView: pageView()
  };
  if (resolved) { init.contactKey = resolved; }

  /* The snippet does not call initialize at all when no application is configured, so the page
     view carried here would never be sent. Recording which of the two paths is live is what lets
     js/dengageEvents.js send exactly one page view rather than none or two. */
  var willInitialize = !!(cfg.dengage && cfg.dengage.accountId && cfg.dengage.appGuid);
  window.DTelcoIdentity.initialPageView = willInitialize ? init.pageView : null;
  window.__dnInit = init;
})(window, document);
