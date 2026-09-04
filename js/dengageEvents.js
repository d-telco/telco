/* The only file allowed to call window.dengage(), other than initialize in the head.
 *
 * One rule audits every write into the account, the debug readout can listen for a page level
 * event instead of wrapping the SDK, and payload hygiene lives in one place. Everything else on
 * the page and in the simulator goes through window.DengageEvents.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var TABLE = cfg.dengage.eventTable;
  var EVENT_NAME = 'dps:' + SLUG + ':event';

  var PAGE_TYPES = ['home', 'category', 'product', 'cart', 'checkout', 'promotion', 'pricing',
                    'login', 'logout', 'other'];
  var PAYMENT_METHODS = ['credit_card', 'debit_card', 'mobile_payment', 'bank_transfer',
                         'prepaid_card', 'crypto', 'cod', 'online_payment', 'other'];
  var LIST_NAMES = ['favorites', 'shopping_list', 'price_drop_alert', 'back_in_stock_alert'];

  // The custom table's vocabulary, validated here so a typo cannot create an event_type that
  // no segment will ever match. A9.3 plus product_focus, which the recognition thread raises.
  var EVENT_TYPES = [
    'compare', 'plan_finder', 'number_selected', 'esim_selected', 'mnp_requested', 'topup',
    'roaming_pack', 'service_activated', 'usage_80', 'usage_100', 'balance_low', 'plan_expiring',
    'renewal_ok', 'renewal_failed', 'bill_issued', 'bill_paid', 'number_activated',
    'esim_installed', 'port_in_done', 'port_out_requested', 'roaming_detected', 'price_dropped',
    'back_in_stock', 'store_visit', 'care_call', 'chatbot_intent', 'complaint_opened',
    'complaint_resolved', 'upgrade_eligible', 'fiber_checked', 'survey_response',
    /* Fulfilment. reference/upsertorders closes order_status to success and refund, so an
       order whose status advances does it as custom events rather than as order upserts.
       Journey 7 is the only journey with a status that moves, and this is how it moves. */
    'order_shipped', 'order_delivered',
    'register_interest', 'reco_shown', 'reco_clicked', 'creative_shown', 'creative_action',
    'product_focus'
  ];

  // ---------------------------------------------------------------------------------------
  // Hygiene. These three functions are the reason no invented number has ever reached a
  // message from this build.
  // ---------------------------------------------------------------------------------------

  /* Drop null, undefined, empty string and NaN. Omit rather than fabricate: a key that is not
     there is a fact, a key holding a stand-in is a lie the panel cannot tell apart. */
  function compact(payload) {
    var out = {};
    Object.keys(payload || {}).forEach(function (k) {
      var v = payload[k];
      if (v === null || v === undefined || v === '') { return; }
      if (typeof v === 'number' && isNaN(v)) { return; }
      out[k] = v;
    });
    return out;
  }

  /* Number(null) is 0 in JavaScript, and a 0 in stock_count announces every product out of
     stock, which poisons every back in stock segment. That bug shipped twice on the reference
     build. A genuine 0, a free service, still passes. */
  function money(value) {
    if (value === null || value === undefined || value === '') { return undefined; }
    var n = Number(value);
    return isNaN(n) ? undefined : n;
  }
  function count(value) {
    var n = money(value);
    return n === undefined ? undefined : Math.round(n);
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function announce(action, payload, accepted, note) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: { action: action, payload: payload, accepted: accepted, note: note,
                  at: new Date().toISOString() }
      }));
    } catch (e) { /* the readout is a convenience, never a dependency */ }
  }

  /* accepted means only that the SDK function existed and did not throw, which is true before
     any network request is made. It must never be widened to mean stored, and never to mean
     delivered. The readout says "sent" and the counts endpoint says "stored". */
  function send(action) {
    var rest = Array.prototype.slice.call(arguments, 1);
    var payload = rest[rest.length - 1];
    if (typeof window.dengage !== 'function') {
      if (window.console) { console.log('[dengage dry]', action, payload); }
      announce(action, payload, false, 'no application configured');
      return false;
    }
    try {
      window.dengage.apply(null, [action].concat(rest));
      announce(action, payload, true);
      return true;
    } catch (e) {
      announce(action, payload, false, String(e && e.message || e));
      return false;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Cart. Dengage rebuilds a cart from its event stream, so cartItems is always the whole cart
  // and never a delta, and a swap sends removeFromCart before addToCart or the profile shows a
  // visitor holding two of something they chose once.
  // ---------------------------------------------------------------------------------------
  var STORE = window.DTelcoIdentity;

  function cart() {
    try { return JSON.parse(STORE.read('cart') || '[]'); } catch (e) { return []; }
  }
  function saveCart(items) {
    STORE.write('cart', JSON.stringify(items), false);
    return items;
  }
  function line(item) {
    return compact({
      product_id: item.product_id,
      // A product with no variants is its own only variant. Leaving this undefined dropped the
      // key on every wishlist row while three other tables looked fine.
      product_variant_id: item.product_variant_id || item.product_id,
      quantity: count(item.quantity) || 1,
      unit_price: money(item.unit_price),
      discounted_price: money(item.discounted_price),
      stock_count: count(item.stock_count)
    });
  }

  var api = {
    compact: compact, money: money, count: count, uuid: uuid,
    vocabularies: { PAGE_TYPES: PAGE_TYPES, PAYMENT_METHODS: PAYMENT_METHODS,
                    LIST_NAMES: LIST_NAMES, EVENT_TYPES: EVENT_TYPES },

    setContactKey: function (key) {
      if (!STORE.valid(key)) {
        announce('setContactKey', { contact_key: key }, false, 'refused: shape');
        return false;
      }
      return send('setContactKey', key);       // a bare string, not an object
    },

    /* Fired first on every page and every screen. page_url is the only route back to this
       demo's rows and session_id is the only join between the tables, so a page that skips
       this writes rows belonging to no identifiable demo.

       Once, though, not twice. js/identity.js hands the same page view to initialize, because
       reference/on-site-message names that as the approach for a site that is not a single page
       application and reference/recommendation-web-sdk warns that the display process can start
       before a later call arrives. When it did, this sends nothing to the SDK and only announces
       the event locally, so the debug readout, the browser suite and the demo's own machinery
       still see the page view first and the account still receives exactly one row.

       The condition is what identity recorded, not what this file assumes. The snippet does not
       call initialize at all when no application is configured, and suppressing on an assumption
       there would mean a page view sent by nobody. */
    pageView: function (pageType, extra) {
      var type = PAGE_TYPES.indexOf(pageType) >= 0 ? pageType : 'other';
      var payload = compact(Object.assign({ page_type: type }, {
        category_path: extra && extra.category_path,
        product_id: extra && extra.product_id,
        price: money(extra && extra.price),
        discounted_price: money(extra && extra.discounted_price),
        stock_count: count(extra && extra.stock_count),
        promotion_id: extra && extra.promotion_id
      }));
      if (STORE.initialPageView) {
        announce('pageView', payload, true, 'carried on initialize, not sent again');
        return true;
      }
      return send('pageView', payload);
    },

    /* reference/web-push-sdk-setup 4.6: "For accurate tracking, the country information of web
       devices should be set on your website." A different thing from the location parameter on
       initialize, which the recommendation engine reads, and both are set from the same value in
       js/config.js so they cannot disagree. */
    setCountry: function (code) {
      var iso = String(code || '').toUpperCase();
      if (!/^[A-Z]{2}$/.test(iso)) {
        announce('setCountry', { country: code }, false, 'refused: not a two letter code');
        return false;
      }
      return send('setCountry', iso);
    },

    addToCart: function (item) {
      var items = cart();
      var idx = items.findIndex(function (x) {
        return (x.product_variant_id || x.product_id) === (item.product_variant_id || item.product_id);
      });
      if (idx >= 0) { items[idx] = item; } else { items.push(item); }
      saveCart(items);
      api.setCart(items);
      return send('ec:addToCart', Object.assign(line(item), { cartItems: items.map(line) }));
    },

    removeFromCart: function (item) {
      var target = item.product_variant_id || item.product_id;
      var items = cart().filter(function (x) {
        return (x.product_variant_id || x.product_id) !== target;
      });
      saveCart(items);
      api.setCart(items);
      return send('ec:removeFromCart', Object.assign(line(item), { cartItems: items.map(line) }));
    },

    /* A changed selection is a remove and then an add, in that order. */
    swapCartLine: function (oldItem, newItem) {
      api.removeFromCart(oldItem);
      return api.addToCart(newItem);
    },

    deleteCart: function () {
      saveCart([]);
      return send('ec:deleteCart', {});         // no payload, and an order closes a cart itself
    },

    /* Fires once, and only once the cart names an item. Firing on the first keystroke sent an
       empty cart, and that empty row is exactly the abandoned checkout a rescue journey would
       try to personalise on. */
    beginCheckout: function () {
      var items = cart();
      if (!items.length) {
        announce('ec:beginCheckout', { cartItems: [] }, false, 'held: cart names no item');
        return false;
      }
      if (STORE.read('checkoutStarted') === '1') { return false; }
      STORE.write('checkoutStarted', '1', true);
      return send('ec:beginCheckout', { cartItems: items.map(line) });
    },

    order: function (order) {
      var items = order.items || cart();
      var method = PAYMENT_METHODS.indexOf(order.payment_method) >= 0
        ? order.payment_method : 'other';
      STORE.write('lastOrder', order.order_id, false);
      STORE.write('checkoutStarted', '', true);
      saveCart([]);
      return send('ec:order', compact({
        order_id: order.order_id,
        item_count: count(items.length),
        total_amount: money(order.total_amount),
        discounted_price: money(order.discounted_price),
        payment_method: method,
        coupon_code: order.coupon_code,
        cartItems: items.map(line)
      }));
    },

    /* Names the order it reverses, so it refuses when this browser has not placed one. */
    cancelOrder: function (partial) {
      var orderId = (partial && partial.order_id) || STORE.read('lastOrder');
      if (!orderId) {
        announce('ec:cancelOrder', partial || {}, false, 'refused: no order from this browser');
        return false;
      }
      return send('ec:cancelOrder', compact({
        order_id: orderId,
        item_count: count(partial && partial.item_count),
        total_amount: money(partial && partial.total_amount),
        payment_method: (partial && partial.payment_method) || 'other',
        cartItems: (partial && partial.items || []).map(line)
      }));
    },

    /* Once per settled query, never per keystroke, or the table describes typing. */
    search: function (keywords, resultCount, filters) {
      if (!keywords || !String(keywords).trim()) { return false; }
      return send('ec:search', compact({
        keywords: String(keywords).trim(),
        result_count: count(resultCount),
        filters: filters
      }));
    },

    /* The documented route is ec:addToWishlist and ec:removeFromWishlist, which store the same
       wishlist_events row without the caller having to supply event_id, event_type and is_used.
       The same table can be reached through sendDeviceEvent, which also works but makes three fields
       the caller's problem, and a missing event_id means the row is accepted and never stored.
       Verified against dev.dengage.com on 3 September 2026. */
    wishlist: function (row) {
      if (LIST_NAMES.indexOf(row.list_name) < 0) {
        announce('ec:addToWishlist', row, false, 'refused: unknown list_name');
        return false;
      }
      var action = row.event_type === 'remove' ? 'ec:removeFromWishlist' : 'ec:addToWishlist';
      return send(action, compact({
        list_name: row.list_name,
        product_id: row.product_id,
        product_variant_id: row.product_variant_id || row.product_id,
        expire_date: row.expire_date,
        price: money(row.price),
        discounted_price: money(row.discounted_price),
        stock_count: count(row.stock_count)
      }));
    },

    /* setCart hands the SDK the whole basket, and it derives effective_price, line_total,
       discounted_line_total and effective_line_total itself. Called alongside every cart
       mutation so an abandoned cart message has the derived totals to print, rather than the
       page recomputing them and disagreeing. */
    setCart: function (items) {
      return send('ec:setCart', {
        items: (items || cart()).map(function (i) {
          var indexed = (window.DTELCO_INDEX || {})[i.product_id];
          var price = money(i.unit_price);
          var discounted = money(i.discounted_price);
          return compact({
            product_id: i.product_id,
            product_variant_id: i.product_variant_id || i.product_id,
            // Not on the cart line, but the synchronous index has it, so the SDK gets the
            // category rather than every caller being made to remember it.
            category_path: i.category_path || (indexed && indexed[0]),
            price: price,
            discounted_price: discounted,
            has_discount: discounted !== undefined && price !== undefined && discounted < price,
            has_promotion: !!i.coupon_code || !!i.promotion_id,
            quantity: count(i.quantity) || 1,
            attributes: i.attributes
          });
        })
      });
    },

    /* The rest of the documented SDK surface. Every one of these is a real capability a telecom
       prospect asks about. */
    getContactKey: function (cb) { return send('getContactKey', cb); },
    getDeviceId: function (cb) { return send('getDeviceId', cb); },
    getToken: function (cb) { return send('getToken', cb); },
    isPushSupported: function (cb) { return send('isPushNotificationsSupported', cb); },
    PERMISSIONS: ['granted', 'denied', 'ignored', 'default'],
    /* getNotificationPermission answers granted, denied, ignored or default. ignored means the
       visitor dismissed the prompt without choosing, which is not denied: asking again later is
       legitimate, and asking again after denied is not. Chrome counts a dismissed unprompted
       dialog against the origin, so the difference decides whether the launcher offers the
       button again or prints the browser settings steps instead. */
    getNotificationPermission: function (cb) { return send('getNotificationPermission', cb); },
    showNativePrompt: function () { return send('showNativePrompt', undefined); },
    showCustomPrompt: function () { return send('showCustomPrompt', undefined); },
    /* Consent, which for a telecom operator is not an optional extra. A visitor who refuses
       cookies is tracked no further, and the SDK is told rather than worked around. */
    setTrackingPermission: function (allowed) { return send('setTrackingPermission', !!allowed); },
    getTrackingPermission: function (cb) { return send('getTrackingPermission', cb); },
    /* Roaming makes country a first class fact rather than a nicety. */
    setCountry: function (iso2) {
      if (!/^[A-Z]{2}$/.test(String(iso2 || ''))) { return false; }
      return send('setCountry', iso2);
    },
    getCountry: function (cb) { return send('getCountry', cb); },
    setLogLevel: function (level) {
      return ['none', 'info', 'warn', 'error'].indexOf(level) >= 0
        ? send('settingLogLevel', level) : false;
    },
    exportLogs: function () { return send('exportLogs', undefined); },

    /* Every business moment with no column on a standard table. Until the table exists in the
       panel, every one of these is accepted by the endpoint and stored nowhere, with no error:
       only a row count proves storage. */
    /* Tags, per reference/tagging-websdk.
     *
     * Three facts shape this and each one matters on a call.
     *
     * A tag keys on the DEVICE id, not the contact key. So a tag is a property of this browser,
     * not of the person, and the site says so rather than calling it a contact tag.
     *
     * There is no read call and no delete call. The only removal is `removeTime`, set when the tag
     * is written, so anything meant to expire has to say so up front. Unsetting is done by writing
     * the same tag with a different value, which is what the documentation's own newsletter example
     * does with "on" and "off".
     *
     * Values are strings. A number sent as a number is a value nobody can filter on reliably.
     */
    tags: function (list) {
      var rows = (list || []).filter(function (t) { return t && t.tag; }).map(function (t) {
        return compact({
          tag: String(t.tag),
          value: t.value === undefined || t.value === null ? '' : String(t.value),
          changeTime: t.changeTime,
          changeValue: t.changeValue === undefined ? undefined : String(t.changeValue),
          removeTime: t.removeTime
        });
      });
      if (!rows.length) { return false; }
      return send('setTags', rows);
    },

    custom: function (eventType, row) {
      if (EVENT_TYPES.indexOf(eventType) < 0) {
        announce('sendDeviceEvent:' + TABLE, row, false, 'refused: unknown event_type');
        return false;
      }
      return send('sendDeviceEvent', TABLE, compact(Object.assign({
        event_id: uuid(), event_type: eventType, is_used: false
      }, row)));
    },

    cart: cart,
    clearCart: function () { saveCart([]); },
    table: TABLE
  };

  window.DengageEvents = api;
})(window, document);
