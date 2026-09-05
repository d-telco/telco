/* Renderers that only one or two pages need. site.js stays the shared spine.
 *
 * Every control here writes the event the moment it is pressed, and draws its own confirmation.
 * Dengage is told what happened; it is never asked to draw anything, which is rule 10 and also
 * the only way a confirmation appears in the same second the visitor acted.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var EV = window.DengageEvents;
  var CAT = window.DTelcoCatalog;
  var RECO = window.DTelcoReco;
  var REC = window.DTelcoRecognition;
  var ID = window.DTelcoIdentity;
  var S = window.DTelcoSite;
  var esc = S.esc, money = S.money, rel = S.rel, param = S.param;

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function orderId(kind) { return 'DPS-dtelco-' + kind + '-' + Date.now(); }

  // =======================================================================================
  // Product detail. One template for all 245 products, per answer 38: a page per product would
  // be 245 files proving the same mechanism 245 times.
  // =======================================================================================
  S.register('pdp', function (host) {
    var id = param('id');
    var p = id && CAT.product(id);
    if (!p) {
      host.innerHTML = '<div class="wrap"><h1>That product is not in the catalogue</h1>' +
        '<p class="lede">It may have been archived. <a href="' + rel() +
        'plans.html">Browse tariffs</a>.</p></div>';
      return;
    }
    var variants = CAT.variantsOf(p.product_id);
    var multi = variants.length > 1;
    var lines = String(p.description).split(',').map(function (l) {
      return '<li>' + esc(l.trim()) + '</li>';
    }).join('');

    host.innerHTML =
      '<div class="wrap pdp">' +
        '<div class="pdp-media"><img width="600" height="600" alt="' + esc(p.title) +
          '" src="' + rel() + 'assets/catalog/' + esc(p.image_slug) + '-1200.jpg" id="pdp-img"></div>' +
        '<div class="pdp-info">' +
          '<div class="brand">' + esc(p.brand) + ' &#183; ' + esc(p.category_path) + '</div>' +
          '<h1>' + esc(p.title) + '</h1>' +
          '<div class="pdp-price" id="pdp-price">' + money(p.discounted_price) +
            (p.validity_days ? ' <small>/ ' + p.validity_days + ' days</small>' : '') + '</div>' +
          '<div class="dn-inline-target" id="dn_inline_target_pdp_below_price"></div>' +
          (CAT.inStock(p.product_id) ? '' :
            '<p class="badge badge-out">Out of stock</p>') +
          ((p.tags || []).indexOf('demo-data') >= 0 ?
            '<p class="note-demo">This price is demo data, not a published figure</p>' : '') +
          '<ul class="lines">' + lines + '</ul>' +
          (p.ussd_code ? '<p class="lede">Activate with <strong>' + esc(p.ussd_code) +
            '</strong> or the button below.</p>' : '') +
          (multi ? '<div class="variants" id="pdp-variants">' + variants.map(function (v, i) {
              return '<button type="button" class="btn btn-ghost btn-sm' + (i ? '' : ' on') +
                     '" data-variant="' + esc(v.product_variant_id) + '">' +
                     esc([v.size, v.color].filter(Boolean).join(' ') || v.title) + '</button>';
            }).join('') + '</div>' : '') +
          '<div class="pdp-actions">' +
            '<button class="btn btn-primary" type="button" id="pdp-add">' +
              (p.product_type === 'plan' ? 'Join now' : 'Add to basket') + '</button>' +
            '<button class="btn btn-outline" type="button" data-wish="favorites">Save</button>' +
            '<button class="btn btn-outline" type="button" data-wish="price_drop_alert">Watch the price</button>' +
            (CAT.inStock(p.product_id) ? '' :
              '<button class="btn btn-outline" type="button" data-wish="back_in_stock_alert">Tell me when it is back</button>') +
            '<button class="btn btn-ghost" type="button" data-wish="shopping_list">Shopping list</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="wrap" id="pdp-related"></div>' +
      '<div class="wrap"><div class="reco" id="pdp-reco" data-render="reco" hidden></div></div>';

    var chosen = variants[0] || { product_variant_id: p.product_id, price: p.price,
                                  discounted_price: p.discounted_price, stock_count: p.stock_count };

    var vwrap = document.getElementById('pdp-variants');
    if (vwrap) {
      vwrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-variant]');
        if (!b) { return; }
        var next = CAT.variant(b.getAttribute('data-variant'));
        if (!next) { return; }
        Array.prototype.forEach.call(vwrap.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        // Remove before add. cartItems is the whole cart and Dengage rebuilds it from the
        // stream, so a swap that only adds leaves the visitor holding two of one thing.
        var inCart = EV.cart().some(function (x) {
          return x.product_variant_id === chosen.product_variant_id;
        });
        if (inCart) { EV.swapCartLine(lineOf(chosen), lineOf(next)); S.updateCart(); }
        chosen = next;
        document.getElementById('pdp-price').innerHTML = money(next.discounted_price);
        if (next.image_slug) {
          document.getElementById('pdp-img').src =
            rel() + 'assets/catalog/' + next.image_slug + '-1200.jpg';
        }
      });
    }

    function lineOf(v) {
      return { product_id: p.product_id, product_variant_id: v.product_variant_id,
               unit_price: v.price, discounted_price: v.discounted_price,
               stock_count: v.stock_count, quantity: 1 };
    }

    document.getElementById('pdp-add').addEventListener('click', function () {
      EV.addToCart(lineOf(chosen));
      S.updateCart();
      S.confirm('In your basket', p.title + ' is ready to check out.');
    });

    host.addEventListener('click', function (e) {
      var w = e.target.closest('[data-wish]');
      if (!w) { return; }
      var list = w.getAttribute('data-wish');
      EV.wishlist({ list_name: list, event_type: 'add', product_id: p.product_id,
                    product_variant_id: chosen.product_variant_id, price: chosen.price,
                    discounted_price: chosen.discounted_price, stock_count: chosen.stock_count });
      // The relay mirrors it into Postgres, because a remote view cannot see inside Dengage and
      // the stock waiter segment has to be built on this side.
      REC.publish({ contact_key: ID.claim('wishlist'), form: 'wishlist',
                    product_id: p.product_id, watch_list: list });
      S.confirm('Saved', { favorites: 'Added to your saved items.',
        price_drop_alert: 'We will tell you if the price drops.',
        back_in_stock_alert: 'We will tell you the moment it is back.',
        shopping_list: 'Added to your shopping list.' }[list]);
    });

    // The relation rails: the ladder, what goes with it, and the sibling at a similar price.
    var rails = [['upsell', 'The tier above'], ['cross_sell', 'Goes well with this'],
                 ['compatible_with', 'Works with'], ['alternative', 'Similar money, other families'],
                 ['bundle_contains', 'What is in this bundle'], ['requires', 'This plan needs']];
    document.getElementById('pdp-related').innerHTML = rails.map(function (r) {
      var items = CAT.related(p.product_id, r[0]).slice(0, 4);
      if (!items.length) { return ''; }
      return '<section><div class="section-head"><h2>' + r[1] + '</h2>' +
             '<span class="why"><span class="rule">' + r[0] + '</span></span></div>' +
             '<div class="grid">' + items.map(function (x) {
               return S.productCard(x.product);
             }).join('') + '</div></section>';
    }).join('');

    S.drawWithin(host.parentNode || document);
  });

  // =======================================================================================
  // A filterable listing. Nine pages share it, because nine copies of a grid would be nine
  // pages proving the same pageView.
  // =======================================================================================
  S.register('listing', function (host, arg) {
    var roots = String(arg || '').split('|');
    var pool = roots.reduce(function (acc, r) { return acc.concat(CAT.byCategory(r.trim())); }, []);
    var archive = host.hasAttribute('data-archive');
    if (archive) {
      pool = CAT.all().filter(function (p) { return !p.is_active; });
    }
    var facets = {};
    pool.forEach(function (p) { facets[p.category_path] = (facets[p.category_path] || 0) + 1; });
    var brands = {};
    pool.forEach(function (p) { brands[p.brand] = (brands[p.brand] || 0) + 1; });

    var tariffStyle = host.hasAttribute('data-tariff');
    host.innerHTML =
      '<div class="filters">' +
        '<label class="search"><span class="visually-hidden">Search the catalogue</span>' +
          '<input type="search" id="q" placeholder="Search ' + pool.length + ' products" autocomplete="off"></label>' +
        '<div class="chips" id="chips">' +
          '<button type="button" class="chip on" data-facet="">All</button>' +
          Object.keys(facets).sort().map(function (c) {
            return '<button type="button" class="chip" data-facet="' + esc(c) + '">' +
                   esc(c.split('>').pop()) + ' <em>' + facets[c] + '</em></button>';
          }).join('') +
          (Object.keys(brands).length > 2 ? Object.keys(brands).sort().map(function (b) {
            return '<button type="button" class="chip" data-brand="' + esc(b) + '">' +
                   esc(b) + ' <em>' + brands[b] + '</em></button>';
          }).join('') : '') +
        '</div>' +
        '<label class="stock-only"><input type="checkbox" id="instock"> In stock only</label>' +
      '</div>' +
      '<p class="lede" id="count"></p>' +
      '<div class="' + (tariffStyle ? 'grid grid-3' : 'grid') + '" id="results"></div>' +
      '<div class="dn-inline-target" id="dn_inline_target_in_grid"></div>';

    var state = { q: '', facet: '', brand: '', stock: false };
    var searchTimer = null;

    function apply() {
      var out = pool.filter(function (p) {
        if (state.facet && p.category_path !== state.facet) { return false; }
        if (state.brand && p.brand !== state.brand) { return false; }
        if (state.stock && !CAT.inStock(p.product_id)) { return false; }
        if (state.q) {
          var hay = (p.title + ' ' + p.brand + ' ' + p.category_path + ' ' +
                     (p.tags || []).join(' ')).toLowerCase();
          if (hay.indexOf(state.q.toLowerCase()) < 0) { return false; }
        }
        return true;
      });
      document.getElementById('results').innerHTML =
        out.length ? out.map(tariffStyle ? S.tariffCard : S.productCard).join('')
                   : '<p class="lede">Nothing matches that. Clear a filter and try again.</p>';
      document.getElementById('count').textContent =
        out.length + ' of ' + pool.length + ' products';
      return out.length;
    }

    host.addEventListener('input', function (e) {
      if (e.target.id === 'q') {
        state.q = e.target.value;
        var n = apply();
        // Once per settled query, never per keystroke, or the table describes typing.
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          EV.search(state.q, n, [state.facet, state.brand].filter(Boolean).join(','));
        }, 700);
      }
      if (e.target.id === 'instock') { state.stock = e.target.checked; apply(); }
    });
    host.addEventListener('click', function (e) {
      var c = e.target.closest('[data-facet], [data-brand]');
      if (!c) { return; }
      Array.prototype.forEach.call(host.querySelectorAll('.chip'), function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      state.facet = c.getAttribute('data-facet') || '';
      state.brand = c.getAttribute('data-brand') || '';
      apply();
    });
    apply();
    /* Arriving from the header's search icon, which routes here rather than drawing a search of
       its own. A second search surface would be the same mechanism twice. */
    if (S.param('focus') === 'q') {
      var q = document.getElementById('q');
      if (q) { q.focus(); }
    }
  });
})(window, document);

(function (window, document) {
  'use strict';
  var cfg = window.DTELCO_CONFIG, EV = window.DengageEvents, CAT = window.DTelcoCatalog;
  var REC = window.DTelcoRecognition, ID = window.DTelcoIdentity, S = window.DTelcoSite;
  var esc = S.esc, money = S.money, rel = S.rel, param = S.param;
  function orderId(kind) { return 'DPS-dtelco-' + kind + '-' + Date.now(); }

  /* Every typed lead is stored by the relay BEFORE Dengage is called, and the row records what
     Dengage answered. An HTTP 200 cannot tell you a contact was created; that row can. */
  function relay(body) {
    return fetch(cfg.functions.base + cfg.functions.relay, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  function orders() { try { return JSON.parse(ID.read('orders') || '[]'); } catch (e) { return []; } }
  function saveOrder(o) { var l = orders(); l.unshift(o); ID.write('orders', JSON.stringify(l.slice(0, 20)), false); }

  // ---------------------------------------------------------------------------------- cart
  /* A basket line is a quantity, not a single item. Every page put quantity: 1 on every line and
     the totals added prices without multiplying, so a visitor could not buy two cases and the
     documented quantity field carried no information. reference/ecommerce-events and
     reference/web-push-sdk-setup both carry quantity on a cart line, and setCart derives
     line_total from it, so a cart that always says one is a cart Dengage can only ever price one
     way. */
  function qty(i) {
    var n = Number(i && i.quantity);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
  }
  function lineTotal(i) {
    return Number(i.discounted_price || i.unit_price || 0) * qty(i);
  }

  S.register('cart', function (host) {
    function paint() {
      var items = EV.cart();
      /* Present on the empty state too. An empty basket is a real audience, and a slot that only
         exists once something is in the cart is a slot a marketer cannot target. The check found
         this by loading the page cold, which is how every visitor first meets it. */
      var slot = '<div class="dn-inline-target" id="dn_inline_target_cart_above_summary"></div>';
      if (!items.length) {
        host.innerHTML = slot + '<div class="empty"><h2>Your basket is empty</h2>' +
          '<p class="lede">Tariffs, packs, phones and accessories all go in the same basket.</p>' +
          '<a class="btn btn-primary" href="' + rel() + 'plans.html">Browse tariffs</a></div>';
        return;
      }
      var total = items.reduce(function (t, i) { return t + lineTotal(i); }, 0);
      host.innerHTML = '<div class="cart-lines">' + items.map(function (i) {
        var p = CAT.product(i.product_id) || { title: i.product_id, image_slug: i.product_id, brand: '' };
        var v = CAT.variant(i.product_variant_id);
        var q = qty(i);
        return '<div class="cart-line">' +
          '<img width="90" height="90" alt="" src="' + rel() + 'assets/catalog/' +
            esc((v && v.image_slug) || p.image_slug) + '-400.jpg">' +
          '<div><strong>' + esc(p.title) + '</strong>' +
            (v && v.size ? '<div class="why">' + esc([v.size, v.color].filter(Boolean).join(' ')) + '</div>' : '') +
            (q > 1 ? '<div class="why">' + money(i.discounted_price || i.unit_price || 0) +
                     ' each</div>' : '') +
          '</div>' +
          '<div class="qty"><button class="btn btn-ghost btn-sm" type="button" data-qty="' +
            esc(i.product_variant_id) + '" data-delta="-1" aria-label="One fewer"' +
            (q < 2 ? ' disabled' : '') + '>&#8722;</button>' +
            '<span aria-live="polite">' + q + '</span>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-qty="' +
            esc(i.product_variant_id) + '" data-delta="1" aria-label="One more">+</button></div>' +
          '<div class="price">' + money(lineTotal(i)) + '</div>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-drop="' +
            esc(i.product_variant_id) + '">Remove</button></div>';
      }).join('') + '</div>' +
      /* The last word before the total is on screen. An accessory or a delivery promise here
         changes a basket; the same words after the total are an apology. */
      slot +
      '<div class="cart-foot"><div class="total">Total <strong>' + money(total) + '</strong></div>' +
        '<button class="btn btn-ghost" type="button" id="empty-cart">Empty the basket</button>' +
        '<a class="btn btn-primary" href="' + rel() + 'checkout.html" id="to-checkout">Checkout</a></div>' +
      '<div class="reco" data-render="reco" hidden></div>';
      S.drawWithin(host);
    }
    host.addEventListener('click', function (e) {
      var stepper = e.target.closest('[data-qty]');
      if (stepper) {
        var target = stepper.getAttribute('data-qty');
        var delta = Number(stepper.getAttribute('data-delta'));
        var line = EV.cart().filter(function (x) {
          return (x.product_variant_id || x.product_id) === target; })[0];
        if (line) {
          var next = Math.max(1, qty(line) + delta);
          /* addToCart replaces the matching line and re-sends the whole basket, which is what
             Dengage needs: it rebuilds a cart from the event stream, so cartItems is always the
             entire cart and never a delta. */
          EV.addToCart(Object.assign({}, line, { quantity: next }));
          S.updateCart();
          paint();
        }
        return;
      }
      var d = e.target.closest('[data-drop]');
      if (d) {
        var id = d.getAttribute('data-drop');
        var item = EV.cart().filter(function (x) { return x.product_variant_id === id; })[0];
        if (item) { EV.removeFromCart(item); S.updateCart(); paint(); }
      }
      if (e.target.id === 'empty-cart') {
        EV.deleteCart(); S.updateCart(); paint();     // a visitor genuinely emptying the basket
        S.confirm('Basket emptied', 'Nothing is waiting for you now.');
      }
      // beginCheckout fires here, where the cart is known to name an item.
      if (e.target.id === 'to-checkout') { EV.beginCheckout(); }
    });
    paint();
  });

  // ------------------------------------------------------------------------------ checkout
  S.register('checkout', function (host) {
    var items = EV.cart();
    var total = items.reduce(function (t, i) { return t + lineTotal(i); }, 0);
    /* Same reason as the cart: an empty checkout is still a page a campaign can target, and a
       slot that only exists when something is in the basket cannot be relied on. */
    var slot = '<div class="dn-inline-target" id="dn_inline_target_checkout_beside_payment"></div>';
    if (!items.length) {
      host.innerHTML = slot + '<div class="empty"><h2>Nothing to check out</h2>' +
        '<a class="btn btn-primary" href="' + rel() + 'plans.html">Browse tariffs</a></div>';
      return;
    }
    EV.beginCheckout();
    host.innerHTML =
      '<form class="form" id="checkout-form" novalidate>' +
        '<h2>Your details</h2>' +
        '<label>Full name<input name="name" required autocomplete="name"></label>' +
        '<label>Email<input name="email" type="email" required autocomplete="email"></label>' +
        '<label>Mobile<input name="gsm" type="tel" placeholder="055 555 55 55" autocomplete="tel"></label>' +
        '<label>City<select name="city">' +
          cfg.cities.map(function (c) {
            return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
        '<h2>How would you like the line?</h2>' +
        '<div class="radios">' +
          '<label><input type="radio" name="line" value="esim_selected" checked> eSIM, right now</label>' +
          '<label><input type="radio" name="line" value="number_selected"> A new physical SIM</label>' +
          '<label><input type="radio" name="line" value="mnp_requested"> Keep my number, move it across</label>' +
        '</div>' +
        '<h2>Payment</h2>' +
        /* Above the fields rather than below them, because reassurance that arrives after the card
           number has been typed has arrived too late. */
        slot +
        '<label>Promo code<input name="coupon" placeholder="Optional" ' +
          'autocapitalize="characters" autocomplete="off"></label>' +
        '<p class="why" id="coupon-note">A code from a D&#183;TELCO email looks like ' +
          esc(cfg.coupon.prefix) + ' and eight letters or numbers.</p>' +
        '<label>Method<select name="payment_method">' +
          '<option value="online_payment">Card online</option>' +
          '<option value="mobile_payment">Mobile payment</option>' +
          '<option value="bank_transfer">Bank transfer</option>' +
          '<option value="prepaid_card">Prepaid card</option>' +
        '</select></label>' +
        '<label class="consent"><input type="checkbox" name="consent" checked> ' +
          'Keep me posted by email, SMS and WhatsApp</label>' +
        '<div class="summary">' + items.length + ' item' + (items.length > 1 ? 's' : '') +
          ' <strong>' + money(total) + '</strong></div>' +
        '<button class="btn btn-primary" type="submit">Place the order</button>' +
        '<p class="why" id="checkout-note"></p>' +
      '</form>';

    /* The code the abandoned checkout email carried, recognised on the page rather than by a
       call, because issuing and redeeming are two different jobs and they sit in two different
       systems. Dengage issues a unique code per recipient from a coupon list and marks it taken.
       Applying the discount to a bill is the operator's billing system, which is where every
       operator already applies one. So what this page says is what it knows: whether the code has
       the shape a generated code takes, and who applies the discount. Both are on screen. */
    var couponField = document.getElementById('checkout-form').coupon;
    var couponNote = document.getElementById('coupon-note');
    function readCoupon() {
      var raw = couponField.value.trim();
      if (!raw) {
        couponNote.textContent = 'A code from a D\u00b7TELCO email looks like ' +
          cfg.coupon.prefix + ' and eight letters or numbers.';
        return null;
      }
      if (!cfg.coupon.shape.test(raw)) {
        couponNote.textContent = 'That is not a D\u00b7TELCO code. Ours are ' +
          cfg.coupon.prefix + ' followed by eight letters or numbers.';
        return null;
      }
      couponNote.textContent = 'Recognised. ' + cfg.coupon.redemption;
      return raw;
    }
    couponField.addEventListener('input', readCoupon);

    document.getElementById('checkout-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      // The demo owns validation, and only for fields that are visible and required.
      var missing = ['name', 'email'].filter(function (n) { return !f[n].value.trim(); });
      if (missing.length) {
        document.getElementById('checkout-note').textContent =
          'Please fill in your ' + missing.join(' and ') + '.';
        f[missing[0]].focus();
        return;
      }
      var key = ID.claim('checkout');
      var id = orderId('order');
      var lineChoice = f.line.value;

      EV.custom(lineChoice, { product_id: items[0].product_id, note: f.city.value });
      EV.order({ order_id: id, total_amount: total, discounted_price: total,
                 payment_method: f.payment_method.value,
                 coupon_code: readCoupon() || undefined, items: items });
      saveOrder({ order_id: id, total: total, at: new Date().toISOString(),
                  items: items.map(function (i) { return i.product_id; }) });

      /* The order to the backend as well as to the browser event, which is the operator's own
         decision and a real distinction rather than a belt and braces one. ec:order above writes
         order_events and order_events_detail, the behavioural family, from this tab. This writes
         orders and orders_detail, the record family, from a server. A visitor who closes the tab
         mid purchase loses the first and keeps the second, which is the whole argument for a
         backend order feed existing at all.

         Every price is looked up server side from the id. Nothing here passes a price, because a
         page that can pass a price can pass any price. */
      fetch(cfg.functions.base + cfg.functions.ecomm, {
        method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          op: 'order', contact_key: key, order_id: id,
          order_source: 'web', order_status: 'success',
          payment_method: f.payment_method.value,
          coupon_code: readCoupon() || undefined,
          items: items.map(function (i) {
            return { product_id: i.product_id, product_variant_id: i.product_variant_id,
                     quantity: i.quantity };
          })
        })
      }).catch(function () { /* the order is already on the browser event and the orders page */ });

      // Store the lead first, then let Dengage know. A refused send costs the lead nothing.
      relay({ contact_key: key, form: 'checkout', name: f.name.value.trim(),
              email: f.email.value.trim(), gsm: f.gsm.value.trim(), city: f.city.value,
              product_id: items[0].product_id, page_url: window.location.href,
              marketing_consent: f.consent.checked, sms_consent: f.consent.checked,
              whatsapp_consent: f.consent.checked });

      S.updateCart();
      host.innerHTML = '<div class="empty"><h2>Order placed</h2>' +
        '<p class="lede">Reference <strong>' + esc(id) + '</strong>. ' +
        'We have emailed the receipt and sent it to your inbox on this site.</p>' +
        '<div class="pdp-actions"><a class="btn btn-primary" href="' + rel() + 'orders.html">See your orders</a>' +
        '<a class="btn btn-outline" href="' + rel() + 'account.html">My account</a></div></div>';
      S.confirm('Order placed', 'Reference ' + id);
    });
  });

  // -------------------------------------------------------------------------------- orders
  S.register('orders', function (host) {
    function paint() {
      var list = orders();
      /* Above the list, and present on the empty state too. A campaign targeted at people with no
         orders is as real as one targeted at people with several, and a slot that disappears when
         the page is empty is a slot a marketer cannot rely on. */
      var slot = '<div class="dn-inline-target" id="dn_inline_target_orders_above_list"></div>';
      if (!list.length) {
        host.innerHTML = slot + '<div class="empty"><h2>No orders yet</h2>' +
          '<p class="lede">Orders you place in this browser appear here.</p></div>';
        return;
      }
      host.innerHTML = slot + list.map(function (o) {
        return '<div class="cart-line"><div><strong>' + esc(o.order_id) + '</strong>' +
          '<div class="why">' + new Date(o.at).toLocaleString() + ' &#183; ' +
          o.items.length + ' item' + (o.items.length > 1 ? 's' : '') + '</div></div>' +
          '<div class="price">' + money(o.total) + '</div>' +
          (o.cancelled ? '<span class="badge badge-out">Cancelled</span>' :
            '<button class="btn btn-ghost btn-sm" type="button" data-cancel="' +
            esc(o.order_id) + '">Cancel</button>') + '</div>';
      }).join('');
    }
    host.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cancel]');
      if (!c) { return; }
      var id = c.getAttribute('data-cancel');
      // cancelOrder names the order it reverses, and refuses when there is none.
      EV.cancelOrder({ order_id: id });
      var list = orders().map(function (o) {
        if (o.order_id === id) { o.cancelled = true; } return o;
      });
      ID.write('orders', JSON.stringify(list), false);
      paint();
      S.confirm('Order cancelled', id + ' has been reversed.');
    });
    paint();
  });

  // --------------------------------------------------------------------------------- topup
  S.register('topup', function (host) {
    host.innerHTML =
      '<form class="form" id="topup-form" novalidate>' +
        '<label>Mobile number<input name="msisdn" type="tel" placeholder="055 555 55 55" required></label>' +
        /* Above the amounts, because a bonus offer changes which amount gets pressed. */
        '<div class="dn-inline-target" id="dn_inline_target_topup_above_amounts"></div>' +
        '<div class="chips" id="quick">' + [1, 5, 10, 20, 50].map(function (a) {
          return '<button type="button" class="chip" data-amount="' + a + '">$' + a + '</button>';
        }).join('') + '</div>' +
        '<label>Amount<input name="amount" type="number" min="1" max="250" step="1" value="10" required></label>' +
        '<label>Method<select name="method">' +
          '<option value="online_payment">Card online</option>' +
          '<option value="prepaid_card">Top-up card</option>' +
          '<option value="mobile_payment">Mobile payment</option></select></label>' +
        '<button class="btn btn-primary" type="submit">Top up</button>' +
        '<p class="why" id="topup-note"></p>' +
      '</form>';
    host.addEventListener('click', function (e) {
      var q = e.target.closest('[data-amount]');
      if (q) { host.querySelector('[name=amount]').value = q.getAttribute('data-amount'); }
    });
    host.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!f.msisdn.value.trim()) {
        document.getElementById('topup-note').textContent = 'Please enter the number to top up.';
        return;
      }
      var amount = Number(f.amount.value);
      var key = ID.claim('topup');
      var id = orderId('topup');
      EV.custom('topup', { amount: String(amount), note: f.method.value, product_id: 'topup' });
      EV.order({ order_id: id, total_amount: amount, discounted_price: amount,
                 payment_method: f.method.value,
                 items: [{ product_id: 'topup', product_variant_id: 'topup',
                           unit_price: amount, discounted_price: amount, quantity: 1 }] });
      // The simulator's other half: this moves the balance in Postgres, so a remote segment
      // moves while the room is watching.
      fetch(cfg.functions.base + cfg.functions.operator, {
        method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_key: key, signal: 'topup', amount: amount })
      }).catch(function () {});
      S.confirm('Topped up', money(amount) + ' is on its way to ' + f.msisdn.value.trim() + '.');
      document.getElementById('topup-note').textContent =
        'Reference ' + id + '. Your balance is updated.';
      // Recharge and win: the gamification stand in fires from the moment that earns it,
      // not from a page rule. In panel mode the engine hands the event to Dengage instead.
      if (window.DTelcoCreatives) { window.DTelcoCreatives.show('spin_wheel'); }
    });
  });
})(window, document);

(function (window, document) {
  'use strict';
  var cfg = window.DTELCO_CONFIG, EV = window.DengageEvents, CAT = window.DTelcoCatalog;
  var REC = window.DTelcoRecognition, RECO = window.DTelcoReco, ID = window.DTelcoIdentity;
  var S = window.DTelcoSite;
  var esc = S.esc, money = S.money, rel = S.rel, param = S.param;
  function relay(body) {
    return fetch(cfg.functions.base + cfg.functions.relay, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) }).then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  var PERSONAS = [
    ['DPS-DTELCO-1', 'Aysel M.',  'Prepaid GO 11.99, hits 80 percent of her data every period'],
    ['DPS-DTELCO-2', 'Rashad Q.', 'Postpaid Klass, iPhone contract ending, waiting on stock'],
    ['DPS-DTELCO-3', 'Nigar A.',  'Frequent traveller, roams in Turkiye, never buys a pack'],
    ['DPS-DTELCO-4', 'Elvin S.',  'Balance under a dollar twice this month, tops up by card'],
    ['DPS-DTELCO-5', 'Leyla H.',  'Requested a port-out yesterday after a coverage complaint'],
    ['DPS-DTELCO-6', 'Tural B.',  'New number this week, eSIM, no add-ons yet'],
    ['DPS-DTELCO-7', 'Kamran V.', 'Three lines at one address, all on separate plans'],
    ['DPS-DTELCO-8', 'Sevinc R.', 'Dormant 40 days, last seen on the AI internet page']
  ];

  // ------------------------------------------------------------------- register and sign in
  S.register('register', function (host) {
    host.innerHTML =
      '<form class="form" id="reg-form" novalidate>' +
        '<h2>Create your account</h2>' +
        '<label>Username<input name="username" required autocomplete="username"></label>' +
        '<label>Email<input name="email" type="email" required autocomplete="email"></label>' +
        '<label>Mobile<input name="gsm" type="tel" placeholder="055 555 55 55" autocomplete="tel"></label>' +
        '<label>Password<input name="password" type="password" value="dengage" autocomplete="new-password"></label>' +
        '<p class="why">This is a demonstration, so the password is the word dengage. It is ' +
          'checked in the page and never stored anywhere.</p>' +
        '<div class="radios consents">' +
          '<label><input type="checkbox" name="c_email" checked> Email me offers</label>' +
          '<label><input type="checkbox" name="c_sms" checked> Text me offers</label>' +
          '<label><input type="checkbox" name="c_wa" checked> WhatsApp me offers</label>' +
        '</div>' +
        '<button class="btn btn-primary" type="submit">Create account</button>' +
        '<p class="why" id="reg-note"></p>' +
      '</form>';
    host.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, note = document.getElementById('reg-note');
      if (!f.username.value.trim() || !f.email.value.trim()) {
        note.textContent = 'A username and an email are all we need.'; return;
      }
      if (f.password.value !== 'dengage') {
        note.textContent = 'For this demonstration the password is the word dengage.'; return;
      }
      // A page cannot write contact fields. It mints the key, names the contact to the SDK, then
      // the relay creates the contact over REST from the allowlisted IP.
      var key = ID.claim('register');
      EV.setContactKey(key);
      ID.signIn(f.username.value.trim());   // the header now greets them and offers Log out
      EV.pageView('login');            // so the new contact owns a page view row of its own
      relay({ contact_key: key, form: 'register', username: f.username.value.trim(),
              name: f.username.value.trim(), email: f.email.value.trim(), gsm: f.gsm.value.trim(),
              page_url: window.location.href, marketing_consent: f.c_email.checked,
              sms_consent: f.c_sms.checked, whatsapp_consent: f.c_wa.checked })
        .then(function (r) {
          note.textContent = r && r.dengage_status
            ? 'Dengage says: ' + r.dengage_status
            : 'Stored. The contact is created by the backend, never by this page.';
        });
      EV.custom('register_interest', { source: 'web', note: f.username.value.trim() });
      S.confirm('Welcome to D·TELCO', 'Your account is ' + f.username.value.trim() + '.');
    });
  });

  S.register('signin', function (host) {
    host.innerHTML =
      '<div class="signin-grid">' +
        '<form class="form" id="signin-form" novalidate>' +
          '<h2>Sign in</h2>' +
          '<label>Username<input name="username" autocomplete="username"></label>' +
          '<label>Password<input name="password" type="password" value="dengage"></label>' +
          '<button class="btn btn-primary" type="submit">Sign in</button>' +
          '<p class="why" id="si-note"></p>' +
        '</form>' +
        '<div><h2>Or browse as a demo persona</h2>' +
          '<p class="lede">Each one is a real line with a history behind it.</p>' +
          '<div class="persona-list">' + PERSONAS.map(function (p) {
            return '<button type="button" class="persona" data-persona="' + p[0] + '">' +
              '<strong>' + esc(p[1]) + '</strong><span class="why">' + esc(p[0]) + '</span>' +
              '<span>' + esc(p[2]) + '</span></button>';
          }).join('') + '</div></div>' +
      '</div>';
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-persona]');
      if (!b) { return; }
      var key = b.getAttribute('data-persona');
      ID.adopt(key, 'persona');
      var nm = b.querySelector('strong');
      ID.signIn(nm ? nm.textContent : key);   // the header now greets them and offers Log out
      EV.setContactKey(key);
      EV.pageView('login');
      S.confirm('Signed in', 'Browsing as ' + key + '. The web and the app land on one profile.');
      window.setTimeout(function () { window.location.href = rel() + 'account.html'; }, 900);
    });
    host.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, note = document.getElementById('si-note');
      if (f.password.value !== 'dengage') {
        note.textContent = 'For this demonstration the password is the word dengage.'; return;
      }
      if (!f.username.value.trim()) { note.textContent = 'Enter the username you registered.'; return; }
      var key = ID.get() || ID.claim('signin');
      EV.setContactKey(key);
      ID.signIn(f.username.value.trim());   // the header now greets them and offers Log out
      EV.pageView('login');
      note.textContent = 'Signed in as ' + key + '.';
      window.setTimeout(function () { window.location.href = rel() + 'account.html'; }, 700);
    });
  });

  // ------------------------------------------------------------------------------- account
  S.register('account', function (host) {
    var key = ID.get();
    /* Signed out is a state a campaign can target, and arguably the most valuable one on this
       page: somebody looking at an account page without an account. So the slot exists here too,
       the same as on the cart, the checkout and the orders list. */
    var slot = '<div class="dn-inline-target" id="dn_inline_target_account_beside_usage"></div>';
    if (!key) {
      host.innerHTML = slot + '<div class="empty"><h2>You are not signed in</h2>' +
        '<p class="lede">The site still knows what you have looked at. Sign in and it becomes ' +
        'a profile with a name on it.</p><a class="btn btn-primary" href="' + rel() +
        'signin.html">Sign in or pick a persona</a></div>';
      return;
    }
    var focus = REC.focus();
    var views = REC.views();
    var recos = RECO.recommend({ cart: EV.cart(), profile: window.DTelcoProfile });

    /* The four rules that need the operator's data. Written as flags the creative engine reads,
       from the profile it actually answered with, so an on site experience appears because a
       line is at 84 percent rather than because a presenter pressed a button. Everything here is
       a real number from dtelco_subscriber and dtelco_usage: nothing is inferred and nothing is
       defaulted, because a flag set from an assumption is worse than a flag not set. */
    function flagsFromProfile(p) {
      var C = window.DTelcoCreatives;
      if (!C || !p || !p.plan_id) { return; }

      /* usage_high, at the same threshold the usage_80 recommendation rule uses and the same one
         v_dtelco_heavy_on_small_plan uses. One number, three consumers. */
      if (typeof p.data_ratio === 'number' && p.data_ratio >= 0.8) {
        C.setFlag('usage_high', true);
        var up = (CAT.related(p.plan_id, 'upsell') || [])[0];
        if (up && up.product) {
          C.setFlag('next_plan', up.product.title);
          if (up.product.data_gb) { C.setFlag('next_data', up.product.data_gb + ' GB'); }
        }
      } else {
        C.setFlag('usage_high', null);
        C.setFlag('next_plan', null);
        C.setFlag('next_data', null);
      }

      /* upgrade_eligible, at the sixty days v_dtelco_upgrade_eligible uses. contract_days comes
         from the endpoint rather than being computed twice, so the page and the segment cannot
         drift apart by a timezone. */
      if (typeof p.contract_days === 'number' && p.contract_days >= 0 && p.contract_days <= 60) {
        C.setFlag('upgrade_eligible', true);
        C.setFlag('contract_days', p.contract_days);
      } else {
        C.setFlag('upgrade_eligible', null);
        C.setFlag('contract_days', null);
      }
    }

    host.innerHTML =
      '<div class="account-grid">' +
        '<section class="panel"><h2>Your line</h2>' +
          '<dl id="profile-rows"><dt>Contact key</dt><dd>' + esc(key) + '</dd>' +
          '<dt>Profile</dt><dd id="profile-state">reading your line</dd></dl>' +
          '<p class="why">Your line as the network sees it, kept up to date as things change.</p>' +
          /* Directly under the figures. An upsell is persuasive exactly where the number that
             justifies it is already on the screen, and nowhere else on this page. */
          slot +
        '</section>' +
        '<section class="panel"><h2>What this site knows about you</h2>' +
          (Object.keys(views).length
            ? '<ul class="lines">' + Object.keys(views).map(function (id) {
                var p = CAT.product(id);
                return '<li>' + esc(p ? p.title : id) + ' <span class="why">' +
                       views[id].n + ' view' + (views[id].n > 1 ? 's' : '') + '</span></li>';
              }).join('') + '</ul>'
            : '<p class="lede">Nothing yet. Look at a product twice and this fills in.</p>') +
          (focus ? '<p class="why"><span class="rule">focus_product</span> ' +
            esc((CAT.product(focus.product_id) || {}).title || focus.product_id) + '</p>' : '') +
        '</section>' +
        '<section class="panel wide"><h2>Recommended for you</h2>' +
          '<div class="grid">' + recos.map(function (r) {
            return '<div class="reco-item" data-reco="' + esc(r.product.product_id) +
              '" data-rule="' + esc(r.rule) + '">' + S.productCard(r.product) +
              '<span class="why"><span class="rule">' + esc(r.rule) + '</span> ' +
              esc(r.why || '') + '</span></div>';
          }).join('') + '</div>' +
          '<p class="why">The same three wherever you meet us: here, in your email and in the ' +
            'app.</p>' +
        '</section>' +
      '</div>';
    RECO.report(recos, 'account');

    // The profile endpoint is read only, rate capped, and keyed by a DPS- key it validates.
    fetch(cfg.functions.base + cfg.functions.profile + '?key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (p) {
        window.DTelcoProfile = p;
        var rows = document.getElementById('profile-rows');
        if (!p || !p.plan_id) { document.getElementById('profile-state').textContent =
          'no operator record for this key yet'; return; }
        document.getElementById('profile-state').remove();
        flagsFromProfile(p);

        /* Redraw the rail, because the first pass ran before this arrived. The usage and family
           rules read the profile and had nothing to read, so the page was showing the rail a
           visitor with no operator record would get while displaying that visitor's plan and
           usage two panels above it. */
        var again = RECO.recommend({ cart: EV.cart(), profile: p });
        var railHost = document.querySelector('.account-grid .panel.wide .grid');
        if (railHost && again.length) {
          railHost.innerHTML = again.map(function (r) {
            return '<div class="reco-item" data-reco="' + esc(r.product.product_id) +
              '" data-rule="' + esc(r.rule) + '">' + S.productCard(r.product) +
              '<span class="why"><span class="rule">' + esc(r.rule) + '</span> ' +
              esc(r.why || '') + '</span></div>';
          }).join('');
          RECO.report(again, 'account');
        }
        rows.insertAdjacentHTML('beforeend', [
          ['Plan', p.plan_name], ['Type', p.plan_type], ['Data used',
            p.data_used_gb + ' of ' + p.data_cap_gb + ' GB'], ['Balance', money(p.balance)],
          ['Lifecycle', p.lifecycle], ['Device', p.device_model]
        ].filter(function (r) { return r[1]; })
         .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join(''));
      })
      .catch(function () {
        var el = document.getElementById('profile-state');
        if (el) { el.textContent = 'the profile endpoint is not deployed yet'; }
      });
  });

  // ------------------------------------------------------------------- compare, plan finder
  S.register('compare', function (host) {
    var pool = CAT.all().filter(function (p) {
      return p.product_type === 'plan' && p.is_active;
    });
    var picked = [];
    host.innerHTML =
      '<div class="chips" id="pick">' + pool.map(function (p) {
        return '<button type="button" class="chip" data-pick="' + esc(p.product_id) + '">' +
               esc(p.title) + '</button>';
      }).join('') + '</div>' +
      '<p class="lede" id="pick-note">Choose two or three tariffs to compare.</p>' +
      '<div id="compare-out"></div>';

    var ROWS = [['Price', function (p) { return money(p.discounted_price); }],
                ['Data', function (p) { return p.data_gb ? p.data_gb + ' GB' : 'unlimited'; }],
                ['Social media', function (p) { return p.social_gb ? p.social_gb + ' GB' : 'not included'; }],
                ['Free AI', function (p) { return p.ai_gb ? p.ai_gb + ' GB' : 'not included'; }],
                ['Minutes', function (p) { return p.minutes >= 99999 ? 'unlimited' : p.minutes; }],
                ['SMS', function (p) { return p.sms >= 99999 ? 'unlimited' : p.sms; }],
                ['Valid', function (p) { return p.validity_days + ' days'; }],
                ['Activate', function (p) { return p.ussd_code || 'in the app'; }]];

    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) { return; }
      var id = b.getAttribute('data-pick');
      var at = picked.indexOf(id);
      if (at >= 0) { picked.splice(at, 1); b.classList.remove('on'); }
      else if (picked.length < 3) { picked.push(id); b.classList.add('on'); }
      var out = document.getElementById('compare-out');
      if (picked.length < 2) { out.innerHTML = ''; return; }
      var ps = picked.map(CAT.product);
      out.innerHTML = '<div class="table-scroll"><table class="compare"><thead><tr><th></th>' +
        ps.map(function (p) { return '<th>' + esc(p.title) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + ROWS.map(function (r) {
          return '<tr><th>' + r[0] + '</th>' + ps.map(function (p) {
            return '<td>' + esc(String(r[1](p))) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody><tfoot><tr><th></th>' + ps.map(function (p) {
          return '<td><button class="btn btn-primary btn-sm" type="button" data-join="' +
                 esc(p.product_id) + '">Join now</button></td>'; }).join('') +
        '</tr></tfoot></table></div>';
      // One custom row naming several products at once, which no standard table can hold.
      EV.custom('compare', { product_id: picked.join(','), product_type: 'plan',
                             note: ps.map(function (p) { return p.title; }).join(' vs ') });
    });
  });

  S.register('planfinder', function (host) {
    var Q = [
      { k: 'spend', q: 'What do you spend a month now?', a: ['Under $10', '$10 to $20', '$20 to $40', 'Over $40'] },
      { k: 'data', q: 'How much data do you actually use?', a: ['Under 5 GB', '5 to 15 GB', '15 to 40 GB', 'More, or I never check'] },
      { k: 'travel', q: 'How often do you leave the country?', a: ['Never', 'Once or twice a year', 'Every few months', 'Constantly'] },
      { k: 'horizon', q: 'When would you switch?', a: ['Today', 'This month', 'When my contract ends', 'Just looking'] }
    ];
    var answers = {}, at = 0;
    function paint() {
      if (at >= Q.length) {
        var gb = { 'Under 5 GB': 5, '5 to 15 GB': 15, '15 to 40 GB': 40 }[answers.data] || 60;
        var picks = CAT.all().filter(function (p) {
          return p.product_type === 'plan' && p.is_active && Number(p.data_gb) >= gb;
        }).sort(function (a, b) { return a.discounted_price - b.discounted_price; }).slice(0, 3);
        EV.custom('plan_finder', {
          amount: answers.spend, note: answers.data, horizon: answers.horizon,
          destination: answers.travel, rule: 'plan_finder',
          product_id: picks.map(function (p) { return p.product_id; }).join(',') });
        /* The answers as tags as well as a row. The row is what a segment reads; the tags are what
           a campaign filters on, which is the use the tagging documentation names first: a
           preference list a visitor puts themselves on. Travel carries a removeTime because an
           intention to travel is not a permanent property of a device, and removeTime is the only
           removal the SDK offers. */
        var ninetyDays = new Date(Date.now() + 90 * 86400000).toISOString();
        EV.tags([
          { tag: 'plan_need_data', value: answers.data },
          { tag: 'plan_need_spend', value: answers.spend },
          { tag: 'travels_to', value: answers.travel, removeTime: ninetyDays }
        ]);
        host.innerHTML = '<h2>Three that fit what you told us</h2>' +
          '<div class="grid grid-3">' + picks.map(S.tariffCard).join('') + '</div>' +
          '<p class="why">We have kept what you told us, so the next thing we show you fits it. ' +
          'The travel answer expires after ninety days, because wanting to go somewhere is not ' +
          'permanent.</p>' +
          '<button class="btn btn-ghost" type="button" id="pf-again">Start again</button>';
        return;
      }
      var q = Q[at];
      host.innerHTML = '<div class="quiz"><p class="why">Question ' + (at + 1) + ' of ' + Q.length + '</p>' +
        '<h2>' + esc(q.q) + '</h2><div class="radios">' + q.a.map(function (a) {
          return '<button type="button" class="btn btn-outline" data-answer="' + esc(a) + '">' +
                 esc(a) + '</button>'; }).join('') + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-answer]');
      if (b) { answers[Q[at].k] = b.getAttribute('data-answer'); at++; paint(); }
      if (e.target.id === 'pf-again') { answers = {}; at = 0; paint(); }
    });
    paint();
  });
})(window, document);

(function (window, document) {
  'use strict';
  var cfg = window.DTELCO_CONFIG, EV = window.DengageEvents, CAT = window.DTelcoCatalog;
  var ID = window.DTelcoIdentity, S = window.DTelcoSite;
  var esc = S.esc, rel = S.rel;
  function relay(body) {
    return fetch(cfg.functions.base + cfg.functions.relay, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body) }).catch(function () {});
  }

  // ------------------------------------------------------------------------------- support
  S.register('support', function (host) {
    var TOPICS = [['Coverage where I live', 'coverage'], ['My bill looks wrong', 'billing'],
                  ['Data ran out too fast', 'data'], ['Roaming charges', 'roaming'],
                  ['Moving my number here', 'mnp'], ['eSIM will not install', 'esim']];
    host.innerHTML =
      /* Deflection, above everything. A question answered here is a ticket that never opens, and
         it is the one place on this site where the best outcome is the visitor leaving. */
      '<div class="dn-inline-target" id="dn_inline_target_support_above_form"></div>' +
      '<div class="account-grid">' +
        '<section class="panel"><h2>What can we help with?</h2>' +
          '<div class="chips">' + TOPICS.map(function (t) {
            return '<button type="button" class="chip" data-topic="' + esc(t[1]) + '">' +
                   esc(t[0]) + '</button>'; }).join('') + '</div>' +
          '<p class="why" id="topic-note">We open a case on your account and follow it up.</p>' +
        '</section>' +
        '<section class="panel"><h2>Talk to someone</h2>' +
          '<div class="pdp-actions">' +
            '<button class="btn btn-primary" type="button" data-care="chatbot_intent">Chat now</button>' +
            '<button class="btn btn-outline" type="button" data-care="care_call">Ask for a call back</button>' +
            '<button class="btn btn-outline" type="button" data-care="store_visit">Book a store visit</button>' +
          '</div>' +
          '<p class="why">A chat intent, a call outcome and a store visit are three different ' +
            'sources landing on one profile, next to everything you did on this site.</p>' +
        '</section>' +
        '<section class="panel wide" id="nps-panel"><h2>How did we do?</h2>' +
          '<p class="lede">One question, and the answer becomes a tag on this device that a ' +
        'campaign can filter on.</p>' +
          '<div class="nps">' + Array.from({ length: 11 }, function (_, i) {
            return '<button type="button" class="chip" data-nps="' + i + '">' + i + '</button>';
          }).join('') + '</div>' +
          '<p class="why" id="nps-note">0 is not at all likely, 10 is extremely likely.</p>' +
        '</section>' +
      '</div>';

    host.addEventListener('click', function (e) {
      var t = e.target.closest('[data-topic]');
      if (t) {
        var topic = t.getAttribute('data-topic');
        EV.custom('complaint_opened', { note: topic, source: 'web' });
        document.getElementById('topic-note').textContent =
          'Opened. A complaint about ' + topic + ' is now on your profile.';
        S.confirm('We are on it', 'Your ' + topic + ' case is open.');
      }
      var c = e.target.closest('[data-care]');
      if (c) {
        var kind = c.getAttribute('data-care');
        EV.custom(kind, { source: 'web', note: 'requested from the support page' });
        S.confirm('Requested', { chatbot_intent: 'A chat is opening.',
          care_call: 'We will call you back.', store_visit: 'Pick a store and a time.' }[kind]);
      }
      var n = e.target.closest('[data-nps]');
      if (n) {
        var score = Number(n.getAttribute('data-nps'));
        EV.custom('survey_response', { amount: String(score), rule: 'nps', source: 'web' });
        EV.custom('complaint_resolved', { note: 'nps ' + score, source: 'web' });
        /* The relay records that the survey was answered; the score itself travels by the two
           mechanisms below, the tag a campaign filters on and the event row a segment reads. A
           contact column for it was dropped on purpose: nothing read the score from the contact,
           and a value the tags and the event table already carry does not earn a second home. */
        relay({ contact_key: ID.claim('nps'), form: 'nps',
                page_url: window.location.href });
        /* The score as a real tag, so a campaign can target on it with a tag filter. It keys on
           the device rather than the contact, which is what the SDK does and what the copy below
           now says. */
        EV.tags([{ tag: 'nps_band', value: score >= 9 ? 'promoter' : (score >= 7 ? 'passive' : 'detractor') },
                 { tag: 'nps_score', value: String(score) }]);
        // A promoter's thank you is the scratch card, the second gamification stand in.
        if (score >= 9 && window.DTelcoCreatives) { window.DTelcoCreatives.show('scratch_card'); }
        Array.prototype.forEach.call(host.querySelectorAll('[data-nps]'), function (b) {
          b.classList.toggle('on', Number(b.getAttribute('data-nps')) === score); });
        document.getElementById('nps-note').textContent =
          'Thank you. That is on your account now, and the people who can act on it will see it.';
      }
    });
  });

  // ---------------------------------------------------------------------------- newsletter
  S.register('newsletter', function (host) {
    host.innerHTML =
      '<form class="form narrow" id="news-form" novalidate>' +
        '<h2>News, offers and the odd good deal</h2>' +
        '<label>Email<input name="email" type="email" required autocomplete="email"></label>' +
        '<label class="consent"><input type="checkbox" name="ok" checked required> ' +
          'Yes, email me offers from D&#183;TELCO</label>' +
        '<button class="btn btn-primary" type="submit">Sign me up</button>' +
        '<p class="why" id="news-note">The engine\'s own subscription form creates the contact ' +
          'when this runs as a served campaign. This card is the site drawing the same thing, ' +
          'so the demo works with nothing pasted into the panel.</p>' +
      '</form>';
    host.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!f.email.value.trim() || !f.ok.checked) {
        document.getElementById('news-note').textContent =
          'An email address and the tick are both needed.'; return;
      }
      // Identify BEFORE the capture, or the engine mints an sf_ contact with no DPS- marker.
      var key = ID.claim('newsletter');
      EV.setContactKey(key);
      EV.pageView('login');
      relay({ contact_key: key, form: 'newsletter', email: f.email.value.trim(),
              page_url: window.location.href, marketing_consent: true,
              sms_consent: true, whatsapp_consent: true });
      EV.custom('register_interest', { source: 'newsletter', note: 'newsletter card' });
      f.innerHTML = '<h2>You are on the list</h2><p class="lede">A welcome email is on its way, ' +
        'and the same contact now carries your consent.</p>';
      S.confirm('Signed up', 'Welcome to D·TELCO news.');
    });
  });

  // ------------------------------------------------------------------------------ services
  S.register('services', function (host) {
    var GROUPS = [
      ['Call management', 'Mobile>Services>Calls', 'Buyable services on your line'],
      ['Network', 'Mobile>Add-ons>Network', 'VoLTE, VoWiFi and 5G access'],
      ['Messaging', 'Mobile>Add-ons>SMS', 'SMS bundles'],
      ['Minutes', 'Mobile>Add-ons>Minutes', 'National and international packs']
    ];
    host.innerHTML = GROUPS.map(function (g) {
      var items = CAT.byCategory(g[1], true);
      if (!items.length) { return ''; }
      return '<section><div class="section-head"><h2>' + esc(g[0]) + '</h2>' +
        '<span class="why">' + esc(g[2]) + '</span></div>' +
        '<div class="grid">' + items.map(function (p) {
          var free = Number(p.discounted_price) === 0;
          return '<div class="svc"><strong>' + esc(p.title) + '</strong>' +
            '<span class="why">' + esc(p.description) + '</span>' +
            '<span class="price">' + (free ? 'Free' : S.money(p.discounted_price)) + '</span>' +
            '<button class="btn ' + (free ? 'btn-outline' : 'btn-primary') +
              ' btn-sm" type="button" data-activate="' + esc(p.product_id) + '">' +
              (free ? 'Activate' : 'Add') + '</button></div>';
        }).join('') + '</div></section>';
    }).join('');

    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-activate]');
      if (!b) { return; }
      var p = CAT.product(b.getAttribute('data-activate'));
      if (!p) { return; }
      var free = Number(p.discounted_price) === 0;
      if (free) {
        // A genuinely free service carries 0 in both price columns. That is a fact, not a gap,
        // and it is the one place an order at zero is correct.
        EV.custom('service_activated', { product_id: p.product_id, amount: '0',
                                         product_type: 'service' });
        EV.order({ order_id: 'DPS-dtelco-addon-' + Date.now(), total_amount: 0,
                   discounted_price: 0, payment_method: 'other',
                   items: [{ product_id: p.product_id, product_variant_id: p.product_id,
                             unit_price: 0, discounted_price: 0, quantity: 1 }] });
      } else {
        EV.addToCart({ product_id: p.product_id, product_variant_id: p.product_id,
                       unit_price: p.discounted_price, discounted_price: p.discounted_price,
                       stock_count: p.stock_count, quantity: 1 });
        S.updateCart();
      }
      S.confirm(free ? 'Activated' : 'Added to your basket', p.title + (free ? ' is on your line.' : ''));
    });
  });

  // -------------------------------------------------------------------------------- offers
  /* The campaigns this storefront is running, at module scope because two things read them: the
     offers page draws them, and any page a visitor arrives on from one of them recognises the
     promotion id in the address. */
  var PROMOS = [
    ['promo-free-ai', 'Free AI on every GO plan', 'hero-ai', 'ChatGPT, Claude, Perplexity and DeepSeek, 1 GB fair use.', 'plans.html'],
    ['promo-esim', 'Switch to eSIM in minutes', 'hero-esim', 'No shop, no waiting, keep your number.', 'numbers.html'],
    ['promo-roaming', 'Roaming without the bill shock', 'hero-roaming', 'Three zones, seven or fourteen days.', 'roaming.html'],
    ['promo-family', 'One bill, every line', 'promo-family', 'Two, three or four lines on one account.', 'plans.html'],
    ['promo-app', 'The D·TELCO app', 'promo-app', 'Manage your line, top up, and get your offers first.', 'index.html']
  ];

  /* The seasonal creative reads a campaign flag, and nothing wrote it. So a rule whose whole
     premise is "a campaign is running and this visitor is reading rather than passing through"
     could only ever fire because a presenter pressed the launcher.

     The writer that was missing is the one signal already on the page. Every promo card links
     with ?promo=<id>, and that id is what the page view carries as promotion_id. A visitor who
     arrived on a campaign link is a visitor a campaign brought, which is exactly who the inline
     creative is for, and it now appears for them without anybody setting a switch first. */
  (function armCampaign() {
    var C = window.DTelcoCreatives;
    if (!C) { return; }
    var m = /[?&]promo=([^&#]+)/.exec(window.location.search);
    if (!m) { return; }
    var id = decodeURIComponent(m[1]);
    var promo = PROMOS.filter(function (p) { return p[0] === id; })[0];
    /* An id nothing answers to is not a campaign. Writing the raw parameter would put whatever a
       visitor typed into the address bar on screen as a headline. */
    if (!promo) { return; }
    C.setFlag('campaign', promo[1]);
    C.setFlag('campaign_note', promo[3]);
  })();

  S.register('offers', function (host) {
    host.innerHTML = '<div class="grid grid-3">' + PROMOS.map(function (p) {
      return '<a class="card promo" href="' + rel() + p[4] + '?promo=' + esc(p[0]) +
        '" data-promo="' + esc(p[0]) + '">' +
        '<img class="thumb wide" loading="lazy" width="800" height="333" alt="' + esc(p[1]) +
          '" src="' + rel() + 'assets/editorial/' + esc(p[2]) + '-800.jpg">' +
        '<span class="body"><span class="name">' + esc(p[1]) + '</span>' +
        '<span class="why">' + esc(p[3]) + '</span></span></a>';
    }).join('') + '</div>';
    host.addEventListener('click', function (e) {
      var a = e.target.closest('[data-promo]');
      if (a) { EV.custom('creative_action', { rule: 'offer_card', source: 'launcher',
                                              note: a.getAttribute('data-promo') }); }
    });
  });
})(window, document);

/* The fiber availability check. It lives here rather than in a renderer because it is one form
 * on one page, and it is the trigger the convergence journey waits for. */
(function (window, document) {
  'use strict';
  var f = document.getElementById('fiber-check');
  if (!f) { return; }
  var EV = window.DengageEvents, ID = window.DTelcoIdentity, S = window.DTelcoSite;
  var CAT = window.DTelcoCatalog, cfg = window.DTELCO_CONFIG;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var pc = f.postcode.value.trim().toUpperCase();
    var note = document.getElementById('fiber-note');
    if (!pc) { note.textContent = 'A postcode is all we need.'; return; }
    var key = ID.claim('fiber');
    EV.custom('fiber_checked', { note: pc, source: 'web', product_type: 'fixed' });
    fetch(cfg.functions.base + cfg.functions.relay, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact_key: key, form: 'fiber_check', city: pc,
                             page_url: window.location.href })
    }).catch(function () {});
    var bundle = CAT.loaded() ? CAT.byCategory('Bundles>Convergence', true)[0] : null;
    note.innerHTML = 'Fiber is available at ' + S.esc(pc) + '.' +
      (bundle ? ' Home and mobile together is <strong>' + S.money(bundle.discounted_price) +
        '</strong>, which is less than the two apart. <a href="' + S.rel() + 'product.html?id=' +
        encodeURIComponent(bundle.product_id) + '">See the bundle</a>.' : '');
    S.confirm('Available at ' + pc, 'Fiber can be installed at that address.');
  });
})(window, document);

/* The operator simulator. The BSS, the care desk, the retail store and the chatbot, standing in.
 *
 * Two writes per press, on purpose, because they are two different systems:
 *   1. dtelco-operator writes the fact into Postgres, so the remote segment moves.
 *   2. the events module sends the matching custom row to Dengage, so the profile carries it.
 * A page cannot write contact fields, so neither of these pretends to: the contact columns are
 * the relay's job, and the reply says which system did what.
 */
(function (window, document) {
  'use strict';
  var cfg = window.DTELCO_CONFIG, EV = window.DengageEvents, ID = window.DTelcoIdentity;
  var S = window.DTelcoSite, CAT = window.DTelcoCatalog;
  var esc = S.esc;

  var PERSONAS = [
    ['DPS-DTELCO-1', 'Aysel',  'GO 11.99, 92 percent of her data every period'],
    ['DPS-DTELCO-2', 'Rashad', 'Klass postpaid, contract ends in 45 days, waiting on stock'],
    ['DPS-DTELCO-3', 'Nigar',  'roams in five months of six, never buys a pack'],
    ['DPS-DTELCO-4', 'Elvin',  'under a dollar, plan lapsing in three days'],
    ['DPS-DTELCO-5', 'Leyla',  'asked to leave yesterday after a coverage complaint'],
    ['DPS-DTELCO-6', 'Tural',  'new eSIM line this week, no add-ons'],
    ['DPS-DTELCO-7', 'Kamran', 'three lines at one address, billed as singles'],
    ['DPS-DTELCO-8', 'Sevinc', 'dormant 40 days, last seen on the AI campaign']
  ];

  /* Grouped by the system a real operator would see them come from, and each carries the
     persona the story belongs to, so a presenter is never one click from a signal that
     correctly does nothing. */
  var GROUPS = [
    ['Network and billing, from the BSS', 'bss', [
      ['usage_80', 'Data at 80 percent', 'DPS-DTELCO-1'],
      ['usage_100', 'Data exhausted', 'DPS-DTELCO-1'],
      ['balance_low', 'Balance under a dollar', 'DPS-DTELCO-4'],
      ['plan_expiring', 'Plan lapses in two days', 'DPS-DTELCO-4'],
      ['renewal_failed', 'Renewal payment failed', 'DPS-DTELCO-5'],
      ['renewal_ok', 'Renewal succeeded', 'DPS-DTELCO-2'],
      ['bill_issued', 'Postpaid bill issued', 'DPS-DTELCO-2'],
      ['bill_paid', 'Bill paid', 'DPS-DTELCO-2'],
      ['roaming_detected', 'Roaming detected abroad', 'DPS-DTELCO-3'],
      ['number_activated', 'Number activated', 'DPS-DTELCO-6'],
      ['esim_installed', 'eSIM installed', 'DPS-DTELCO-6'],
      ['port_in_done', 'Port in completed', 'DPS-DTELCO-6'],
      ['port_out_requested', 'Port out requested', 'DPS-DTELCO-5'],
      ['upgrade_eligible', 'Contract ending, upgrade eligible', 'DPS-DTELCO-2']
    ]],
    ['Fulfilment, from the warehouse', 'bss', [
      ['order_shipped', 'The order has shipped', 'DPS-DTELCO-2'],
      ['order_delivered', 'The order was delivered', 'DPS-DTELCO-2']
    ]],
    ['Catalogue, from merchandising', 'bss', [
      ['back_in_stock', 'The saved handset is back in stock', 'DPS-DTELCO-2'],
      ['price_dropped', 'The watched price drops', 'DPS-DTELCO-2']
    ]],
    ['Care desk', 'care', [
      ['care_call', 'Call handled', 'DPS-DTELCO-5'],
      ['complaint_opened', 'Complaint opened', 'DPS-DTELCO-5'],
      ['complaint_resolved', 'Complaint resolved', 'DPS-DTELCO-5']
    ]],
    ['Retail and chat', 'store', [
      ['store_visit', 'Walked into a store', 'DPS-DTELCO-8'],
      ['chatbot_intent', 'Chatbot intent captured', 'DPS-DTELCO-7'],
      ['fiber_checked', 'Checked fiber at their address', 'DPS-DTELCO-7']
    ]]
  ];

/* The signals that arm an on site experience, and nothing else does.
 *
 * Four of the five creatives read a flag, and each flag is written by the system that owns it, so
 * a rule that says "the line is past 80 percent" only ever fired because somebody pressed a
 * button. The account page now sets usage_high and upgrade_eligible from the profile endpoint's
 * real numbers; these two come from the operator, because a port out request and a contract
 * ending are things an operator knows and a website cannot. */
  var SIGNAL_FLAGS = {
    port_out_requested: 'churn_risk',
    upgrade_eligible: 'upgrade_eligible'
  };

  S.register('operator', function (host) {
    host.innerHTML =
      '<div class="op-head">' +
        '<label>Acting for<select id="op-persona">' + PERSONAS.map(function (p) {
          return '<option value="' + p[0] + '">' + esc(p[1]) + ' &#183; ' + esc(p[0]) +
                 ' &#183; ' + esc(p[2]) + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn btn-ghost" type="button" id="op-reset">Reset the demonstration</button>' +
      '</div>' +
      '<p class="why" id="op-note">Each press writes to Postgres AND sends the matching event to ' +
        'Dengage twice over: from this page as a device event, and from the operator function ' +
        'itself through the Event API, which needs no browser at all. The reply says which system ' +
        'did what, and when a segment does not move, why not.</p>' +
      '<section class="panel"><h2>Or use your own line</h2>' +
        '<p class="why">A persona carries history a first visit cannot: a month of usage, a ' +
        'contract clock, three lines at one address. Everything else on this site is already ' +
        'yours and unscripted. Take a line of your own and the two halves meet: your real ' +
        'browsing, and operator signals fired at you rather than at somebody else.</p>' +
        '<div class="chips"><button type="button" class="chip" id="op-adopt">' +
          'Give this browser a line</button></div>' +
        '<p class="why" id="op-adopt-note"></p></section>' +

      /* The counter and the contact centre. A customer rings up or walks in and asks what that
         message was about, and the agent's screen has no SDK and never will. It reads the
         customer's Dengage mailbox by contact key from a backend.

         The site inbox and the app inbox both prove Dengage holds an inbox. This proves the
         mailbox belongs to the person rather than to a browser, which is the only reason it can
         be served to a screen like this one. */
      '<section class="panel"><h2>At the counter</h2>' +
        '<p class="why">A customer asks what that message was about. This screen has no SDK, no ' +
        'cookie of theirs and no device of theirs. It asks Dengage for the mailbox by contact ' +
        'key and shows the agent what was actually sent.</p>' +
        '<div class="chips"><button type="button" class="chip" id="op-mailbox">' +
          'What have we sent them</button></div>' +
        '<p class="why" id="op-mailbox-note">Reading only. An agent glancing at a customer\'s ' +
        'messages has not read them on the customer\'s behalf, so nothing here reports an ' +
        'impression, an open or a delete. Those belong to the surface that drew the message.</p>' +
        '<ol id="op-mailbox-list" class="op-log"></ol></section>' +

      /* The one push in this build whose words are written on the spot. Every other push carries a
         saved content id, which is right for a confirmation and useless at two in the morning.
         The two presses here are the function's own guard made visible: compose, read it back,
         then send. */
      '<section class="panel"><h2>Network operations</h2>' +
        '<p class="why">A fault is not a campaign. Nobody writes the wording of an outage in ' +
        'advance, so this is the one message composed at the moment it is needed and pushed ' +
        'straight out. It is also the only control here that reaches more than one person, which ' +
        'is why it takes two presses.</p>' +
        '<div class="op-head">' +
          '<label>Fault in<select id="op-city">' + cfg.cities.map(function (c) {
            return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
          '<button class="btn btn-ghost" type="button" id="op-compose">Compose the notice</button>' +
          '<button class="btn btn-primary" type="button" id="op-send" hidden>Send it</button>' +
        '</div>' +
        '<p class="why" id="op-outage-note"></p></section>' +
      GROUPS.map(function (g) {
        return '<section class="panel"><h2>' + esc(g[0]) + '</h2><div class="chips">' +
          g[2].map(function (s) {
            return '<button type="button" class="chip" data-signal="' + esc(s[0]) +
              '" data-source="' + esc(g[1]) + '" data-for="' + esc(s[2]) + '">' +
              esc(s[1]) + '</button>'; }).join('') + '</div></section>';
      }).join('') +
      '<section class="panel wide"><h2>What happened</h2><ol id="op-log" class="op-log">' +
        '<li class="why">Press a signal. It fires as the line selected above, your own session ' +
        'by default, so a transactional push lands on this device. Switch the line to a persona ' +
        'to watch a segment move.</li>' +
      '</ol></section>';

    function log(html, bad) {
      var li = document.createElement('li');
      li.className = bad ? 'bad' : '';
      li.innerHTML = html;
      var l = document.getElementById('op-log');
      if (l.firstElementChild && l.firstElementChild.classList.contains('why')) { l.innerHTML = ''; }
      l.insertBefore(li, l.firstChild);
    }

    /* The operator acts as the browser's own line by default, so a signal fired here reaches the
       device the presenter is on rather than a story persona no device has subscribed to. The
       session key is added to the picker and selected; a presenter can still switch to a persona
       to watch a segment move. */
    (function () {
      var picker = document.getElementById('op-persona');
      var mine = ID.get();
      if (picker && mine) {
        if (!picker.querySelector('[value="' + mine + '"]')) {
          var o = document.createElement('option');
          o.value = mine;
          o.textContent = 'This session · ' + mine;
          picker.insertBefore(o, picker.firstChild);
        }
        picker.value = mine;
      }
    })();

    /* Transactional lane signals also fire the saved transactional push the second they land, so a
       balance low event reaches the device as the real push rather than only as a segment a journey
       might send later. Only moments whose content exists in the panel are wired; the rest record
       the event and send nothing, which the reply says. The browser's own push token travels with
       the send, so it lands on whichever device is demoing and has granted permission:
       dtelco-message tries the contact route and falls to the token route on code 11, which is the
       state of a persona key no device ever subscribed to. */
    var SIGNAL_MOMENT = { balance_low: 'low_balance', plan_expiring: 'low_balance',
      usage_80: 'usage_upsell', bill_issued: 'postpaid_billing', renewal_failed: 'renewal_recovery',
      roaming_detected: 'roaming_arrival', number_activated: 'welcome_onboarding' };

    function sendTransactionalPush(actingKey, signal) {
      var moment = SIGNAL_MOMENT[signal];
      var contentId = moment && cfg.transactionalPush && cfg.transactionalPush[moment];
      if (!contentId) { return; }
      EV.getToken(function (token) {
        var body = { contact_key: actingKey, content_id: contentId, channel: 'push',
          moment: moment, values: { link: cfg.origin + 'topup.html' } };
        if (token) { body.token = token; }
        fetch(cfg.functions.base + cfg.functions.message, {
          method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); }).then(function (d) {
          log('<strong>' + esc(moment) + '</strong> transactional push' +
            '<span class="' + (d.sent ? 'moved' : 'why') + '">' + esc(d.route || 'contact') +
            ' route, code ' + esc(String(d.code)) + ': ' + esc(d.meaning || '') + '</span>' +
            '<span class="why">The device token travels with the send, so a persona no device ' +
            'subscribed to answers code 11 on the contact route and the token route lands it on ' +
            'this device.</span>', !d.sent);
        }).catch(function () {});
      });
    }

    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-signal]');
      if (b) {
        var signal = b.getAttribute('data-signal');
        var source = b.getAttribute('data-source');
        // The operator acts as the currently selected line, which defaults to the browser's own
        // session key, so a signal reaches the device the presenter is on. Switch the picker to a
        // persona to watch a segment move instead.
        var key = document.getElementById('op-persona').value;

        // 1. Dengage gets the fact, from the browser, as the custom row a journey triggers on.
        EV.setContactKey(key);
        EV.custom(signal, { source: source, note: 'operator simulator' });

        // 1b. A transactional lane signal also sends its saved push now, addressed to this line
        // and carrying this device's token so it lands on the presenter's screen.
        sendTransactionalPush(key, signal);

        /* Two of these signals are also the reason an on site experience appears, so the flag the
           creative engine reads is set by the signal rather than by a presenter reaching for the
           launcher. Pressing "port out requested" and then browsing to the exit is the whole
           churn save story, and it now works without anybody setting a switch first.

           A press by an operator is not a claim about this browser's own visitor, so the flag is
           set only when the signal names the persona this browser is currently being. Otherwise a
           presenter firing Leyla's port out would arm a save popup for whoever they are signed in
           as, which is the sort of thing a room notices. */
        var C = window.DTelcoCreatives;
        if (C && SIGNAL_FLAGS[signal] && ID.get() === key) {
          C.setFlag(SIGNAL_FLAGS[signal], true);
        }

        // 2. Postgres gets the fact, so the remote segment moves.
        b.disabled = true;
        fetch(cfg.functions.base + cfg.functions.operator, {
          method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contact_key: key, signal: signal, source: source })
        }).then(function (r) { return r.json(); }).then(function (d) {
          b.disabled = false;
          if (d.error) { log('<strong>' + esc(signal) + '</strong> refused: ' + esc(d.error), true); return; }
          var g = d.segment;
          log('<strong>' + esc(signal) + '</strong> for ' + esc(key) +
            '<span class="why">wrote ' + esc((d.wrote || []).join(', ')) + '</span>' +
            (g ? '<span class="' + (g.entered ? 'moved' : 'why') + '">' +
                 esc(g.view.replace('v_dtelco_', '')) + ': ' + g.count_before + ' to ' + g.count_after +
                 (g.entered ? '. This subscriber is now in it.'
                            : '. ' + esc(g.why || '')) + '</span>' : '') +
            '<span class="why">Dengage was told separately, by the page, as a ' + esc(signal) +
            ' row. A page cannot write contact fields, so the relay does that.</span>');
        }).catch(function (err) {
          b.disabled = false;
          log('<strong>' + esc(signal) + '</strong> could not reach the operator function: ' +
              esc(String(err && err.message)), true);
        });
      }

      if (e.target.id === 'op-adopt') {
        /* The visitor keeps their own key. Nothing is swapped, nothing is lost, and the operator
           record is created against the key this browser has been using all along. */
        var mine = ID.get() || ID.claim('adopt');
        e.target.disabled = true;
        fetch(cfg.functions.base + cfg.functions.operator, {
          method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contact_key: mine, signal: 'number_activated',
                                 source: 'bss', adopt: true })
        }).then(function (r) { return r.json(); }).then(function (d) {
          e.target.disabled = false;
          var note = document.getElementById('op-adopt-note');
          if (d.error) { note.textContent = 'could not take a line: ' + d.error; return; }
          note.textContent = mine + ' now has an operator record. Every signal above can be fired ' +
            'at it, and the account page reads the same profile a journey reads.';
          /* The picker holds eight personas and no option for this key, so setting its value
             would silently do nothing and the next signal would go to whoever was selected.
             The option is added first, which is the whole point of adopting a line. */
          var picker = document.getElementById('op-persona');
          if (!picker.querySelector('[value="' + mine + '"]')) {
            var mineOpt = document.createElement('option');
            mineOpt.value = mine;
            mineOpt.textContent = 'This browser \u00b7 ' + mine;
            picker.insertBefore(mineOpt, picker.firstChild);
          }
          picker.value = mine;
          log('<strong>Line adopted</strong> for ' + esc(mine) +
            '<span class="why">Your own browsing and the operator history are now the same ' +
            'person. The reset clears the line and leaves the seeded base untouched.</span>');
        }).catch(function () {
          e.target.disabled = false;
          document.getElementById('op-adopt-note').textContent =
            'could not reach the operator function';
        });
        return;
      }

      /* The agent's read. GET only, and the function refuses POST, so there is no path from this
         screen that could mark a customer's message read. */
      if (e.target.id === 'op-mailbox') {
        var whose = document.getElementById('op-persona').value;
        var note = document.getElementById('op-mailbox-note');
        var list = document.getElementById('op-mailbox-list');
        e.target.disabled = true;
        list.innerHTML = '';
        note.textContent = 'asking Dengage for ' + whose + '...';
        fetch(cfg.functions.base + cfg.functions.inbox + '?contact_key=' +
              encodeURIComponent(whose), { credentials: 'omit' })
          .then(function (r) { return r.json(); }).then(function (d) {
            e.target.disabled = false;
            if (!d.read) {
              /* Said plainly rather than drawn as an empty mailbox. An unconfigured account and a
                 customer with no messages look identical on a screen that does not say which. */
              note.textContent = 'Nothing was read. ' + (d.why || d.error || 'no reason given') +
                (d.would_call ? ' It would have called ' + d.would_call : '');
              return;
            }
            note.textContent = d.count + ' message' + (d.count === 1 ? '' : 's') +
              ' held by Dengage for ' + whose + ', read with no SDK and no device of theirs. ' +
              d.events_reported + ' events reported, which is the point: an agent reading is not ' +
              'the customer reading.';
            if (!d.count) {
              list.innerHTML = '<li class="why">' + esc(d.note || '') + '</li>';
              return;
            }
            list.innerHTML = d.messages.map(function (m) {
              return '<li><strong>' + esc(m.title || 'no title') + '</strong>' +
                '<span class="why">' + esc(m.message || '') + '</span>' +
                '<span class="why">' + esc(m.received_utc || '') +
                (m.is_read ? ' &#183; already read by them' : ' &#183; unread by them') +
                (m.is_pinned ? ' &#183; pinned' : '') +
                (m.buttons && m.buttons.length
                  ? ' &#183; buttons: ' + esc(m.buttons.join(', ')) : '') + '</span></li>';
            }).join('');
          }).catch(function () {
            e.target.disabled = false;
            note.textContent = 'could not reach the inbox function';
          });
        return;
      }

      /* Compose, then send. Two presses, because the second one reaches everybody. The first press
         posts without confirm and the function answers with the words it would use and who it
         would reach, which is the guard rather than a decoration on top of it. */
      if (e.target.id === 'op-compose' || e.target.id === 'op-send') {
        var sending = e.target.id === 'op-send';
        var city = document.getElementById('op-city').value;
        var outage = document.getElementById('op-outage-note');
        var sendBtn = document.getElementById('op-send');
        e.target.disabled = true;
        outage.textContent = sending ? 'sending...' : 'composing...';
        fetch(cfg.functions.base + cfg.functions.broadcast, {
          method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(sending ? { city: city, confirm: true } : { city: city })
        }).then(function (r) { return r.json(); }).then(function (d) {
          e.target.disabled = false;
          if (d.error) { outage.textContent = 'refused: ' + d.error; return; }
          if (!sending) {
            sendBtn.hidden = false;
            outage.textContent = '"' + d.title + ' ' + d.message + '" Nothing has been sent. ' +
              'It would reach ' + d.would_reach + '.';
            return;
          }
          sendBtn.hidden = true;
          outage.textContent = d.sent
            ? 'Dengage accepted the broadcast for ' + d.city + ', code ' + d.code +
              (d.transaction_id ? ', transaction ' + d.transaction_id : '') + '. ' + d.note
            : 'Nothing was sent. ' + (d.why || ('Dengage answered code ' + d.code +
              (d.message_from_dengage ? ': ' + d.message_from_dengage : '')));
          log('<strong>Outage notice for ' + esc(d.city) + '</strong>' +
              '<span class="why">' + esc(d.message || '') + '</span>' +
              '<span class="' + (d.sent ? 'moved' : 'why') + '">' +
              (d.sent ? 'accepted by Dengage, which is not the same as drawn on a handset'
                      : esc(d.why || 'not sent')) + '</span>', !d.sent);
        }).catch(function () {
          e.target.disabled = false;
          outage.textContent = 'could not reach the broadcast function';
        });
        return;
      }

      if (e.target.id === 'op-reset') {
        e.target.disabled = true;
        fetch(cfg.functions.base + 'dtelco-reset', { method: 'POST', credentials: 'omit' })
          .then(function (r) { return r.json(); }).then(function (d) {
            e.target.disabled = false;
            if (d.error) { log('reset refused: ' + esc(d.error), true); return; }
            log('<strong>Reset</strong><span class="why">' +
                esc(JSON.stringify(d.report)) + '</span>' +
                '<span class="why">Every segment is back to its opening count. Postgres only: ' +
                'rows already in Dengage stay, because nothing deletes from the account.</span>');
          }).catch(function () {
            e.target.disabled = false;
            log('reset could not reach the function', true);
          });
      }
    });
  });
})(window, document);

/* The travel date, and the one capability the roaming page exists to prove.
 *
 * The capability map says page 7 headlines H4, "a journey timed off a date the customer chose",
 * proved by a roaming_pack row carrying a future travel date. The page said so in its own lede,
 * promising a checklist two days before the flight, and nothing captured a date or wrote the event.
 * The contract check found it: roaming_pack sat in the vocabulary with no writer anywhere.
 *
 * A date the customer gives is the only trigger a marketing platform cannot infer from behaviour,
 * which is exactly why it is worth demonstrating.
 */
(function (window, document) {
  'use strict';
  var EV = window.DengageEvents, CAT = window.DTelcoCatalog, S = window.DTelcoSite;
  var ID = window.DTelcoIdentity;
  var esc = S.esc;

  var ZONES = [
    ['europe', 'Europe'],
    ['tr-cis', 'Turkiye and CIS'],
    ['world', 'Rest of the world']
  ];

  S.register('trip', function (host) {
    /* Tomorrow is the earliest useful answer: a pack bought for today cannot be a pre trip
       journey, and a date in the past would fire a journey that has already missed. */
    var min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    host.innerHTML =
      '<div class="trip-plan">' +
        '<h2>Tell us when you fly</h2>' +
        '<p class="lede">The pre trip checklist is timed off this date, not off anything you ' +
        'clicked. It is the one trigger behaviour cannot guess.</p>' +
        /* Above the zone picker, so a pack can be offered before a destination is chosen rather
           than after the choice has already been made. */
        '<div class="dn-inline-target" id="dn_inline_target_roaming_above_zones"></div>' +
        '<div class="filters">' +
          '<label>Where are you going' +
            '<select id="trip-zone">' +
              ZONES.map(function (z) {
                return '<option value="' + esc(z[0]) + '">' + esc(z[1]) + '</option>';
              }).join('') +
            '</select></label>' +
          '<label>Date you fly' +
            '<input type="date" id="trip-date" min="' + min + '"></label>' +
          '<button class="btn btn-primary" type="button" id="trip-save">Save my trip</button>' +
        '</div>' +
        '<p class="why" id="trip-note"></p>' +
      '</div>';

    host.addEventListener('click', function (e) {
      if (!e.target.closest('#trip-save')) { return; }
      var zone = document.getElementById('trip-zone').value;
      var date = document.getElementById('trip-date').value;
      var note = document.getElementById('trip-note');
      if (!date) { note.textContent = 'Pick the date you fly, and the journey has something to count back from.'; return; }
      if (date < min) { note.textContent = 'That date has passed. A pre trip message needs a trip still ahead.'; return; }

      /* The pack that matches the zone, so the row names a real product rather than a category. */
      var pack = CAT.all().filter(function (p) {
        return p.category_path === 'Mobile>Roaming>All-in-one' &&
               p.product_id.indexOf('roam-allin-' + zone) === 0;
      })[0];

      var key = ID.claim('trip');
      EV.custom('roaming_pack', {
        product_id: pack ? pack.product_id : undefined,
        destination: zone,
        horizon: date,
        rule: 'roaming_pretrip',
        source: 'web'
      });

      var days = Math.round((Date.parse(date) - Date.now()) / 86400000);
      note.textContent = 'Saved. The row carries ' + date + ' as the travel date, so the journey ' +
        'sends its checklist two days before you fly, which is ' + Math.max(0, days - 2) +
        ' days from now. Nothing about that timing comes from what you browsed.';
      S.confirm('Trip saved', 'Your checklist is timed off ' + date + '.');
      return key;
    });
  });
})(window, document);
