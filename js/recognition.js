/* The recognition thread.
 *
 * Two views of one product makes it the focus product, and from then on the hero, the popup
 * and the rail all bend to it. The site draws that itself, instantly, for a visitor with no
 * identity at all, because rule 10 says realtime belongs to the page. Dengage gets the same
 * fact as an event and as contact columns, and serves the same experience through a dynamic
 * content creative for anyone who wants to see the platform do it: ?onsite=panel.
 *
 * Crossing the threshold is also the moment the visitor becomes addressable, so it is where an
 * anonymous device gets a DPS-DTELCO- key. That extends the usual mint triggers, which are push
 * permission, form submit and engine capture, and it is the honest production pattern: you
 * identify in order to personalise.
 */
(function (window) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var ID = window.DTelcoIdentity;
  var EV = window.DengageEvents;
  var THRESHOLD = cfg.recognition.threshold;
  var DECAY_MS = cfg.recognition.decayDays * 86400000;

  function load() {
    try { return JSON.parse(ID.read('views') || '{}'); } catch (e) { return {}; }
  }
  function save(v) { ID.write('views', JSON.stringify(v), false); }

  /* A product looked at five months ago is not what this visitor is shopping for now. */
  function fresh(views) {
    var cutoff = Date.now() - DECAY_MS, out = {};
    Object.keys(views).forEach(function (id) {
      if (views[id] && views[id].last >= cutoff) { out[id] = views[id]; }
    });
    return out;
  }

  /* The same page level channel the readout already listens on, so a relay refusal appears in
     ?debug=1 beside the SDK sends rather than nowhere. */
  function announce(form, accepted, detail) {
    window.dispatchEvent(new CustomEvent('dps:' + cfg.slug + ':event', {
      detail: { action: 'relay:' + form, payload: {}, accepted: accepted, note: detail }
    }));
  }

  var api = {
    /* Called from the product page, after pageView, never before it. */
    record: function (product) {
      if (!product || !product.product_id) { return null; }
      var views = fresh(load());
      var row = views[product.product_id] || { n: 0 };
      row.n += 1;
      row.last = Date.now();
      row.title = product.title;
      row.brand = product.brand;
      row.category = product.category_path;
      row.price = product.discounted_price !== undefined ? product.discounted_price : product.price;
      row.image = product.image_slug;
      views[product.product_id] = row;
      save(views);

      var crossed = row.n === THRESHOLD;      // exactly at, so it fires once per product
      if (crossed) { api.promote(product.product_id, row); }
      return { views: row.n, crossed: crossed };
    },

    /* The focus product: threshold reached, most recently seen wins a tie. */
    focus: function () {
      var views = fresh(load());
      var best = null;
      Object.keys(views).forEach(function (id) {
        var row = views[id];
        if (row.n < THRESHOLD) { return; }
        if (!best || row.last > views[best].last) { best = id; }
      });
      return best ? Object.assign({ product_id: best }, views[best]) : null;
    },

    views: function () { return fresh(load()); },

    promote: function (productId, row) {
      // Addressable now, so give the device a key it can be reached on.
      var key = ID.claim('recognition');

      var known = window.DTelcoCatalog && window.DTelcoCatalog.product(productId);
      EV.custom('product_focus', {
        product_id: productId,
        product_type: known ? known.product_type : undefined,
        note: row.brand,
        rule: 'focus_threshold_' + THRESHOLD,
        amount: String(row.n)
      });

      /* A page cannot write contact fields. The relay does, over REST, from the allowlisted IP,
         and it derives every product value from the id rather than trusting what a page sent. So
         only the id and the count travel: the page sent five more columns that the relay never
         read, and sent the count under a name the relay did not look for, so the view count
         reached the contact by no route at all. */
      api.publish({
        contact_key: key,
        form: 'recognition',
        product_id: productId,
        views: row.n
      });

      window.dispatchEvent(new CustomEvent('dps:' + cfg.slug + ':focus', {
        detail: { product_id: productId, views: row.n, contact_key: key }
      }));
    },

    /* Batched on a rolling minute, because bulk contact upsert is meant to be called about once
       a minute and A16 wants the columns current within one. Both are satisfied by waiting.

       Batched PER FORM. The first version merged every pending body into one object with
       Object.assign, so a wishlist save and a recommendation impression inside the same second
       became a single request carrying one form name and the other's columns riding along under
       it. Two forms, one truth, and whichever was assigned last won. */
    _pending: null,
    _timer: null,
    publish: function (body) {
      var form = body.form;
      if (!form) { return; }
      api._pending = api._pending || {};
      api._pending[form] = Object.assign(api._pending[form] || {}, body);
      if (api._timer) { return; }
      api._timer = window.setTimeout(function () {
        var pending = api._pending;
        api._pending = null;
        api._timer = null;
        if (!pending || !cfg.functions.base) { return; }
        Object.keys(pending).forEach(function (name) { api.send(pending[name]); });
      }, 1000);
    },

    /* A refusal has to be visible. The first version caught everything and said nothing, so the
       relay answered 400 unknown form to every recommendation for as long as the vocabulary was
       missing one entry, and the readout showed a clean page. The lead path still never costs the
       visitor their experience: it announces and moves on. */
    send: function (payload) {
      return fetch(cfg.functions.base + cfg.functions.relay, {
        method: 'POST', credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (r.ok) { announce(payload.form, true, null); return; }
        return r.text().then(function (t) {
          announce(payload.form, false, 'HTTP ' + r.status + ' ' + t.slice(0, 120));
        });
      }).catch(function (e) {
        announce(payload.form, false, String(e && e.message ? e.message : e));
      });
    },

    reset: function () { save({}); }
  };

  window.DTelcoRecognition = api;
})(window);
