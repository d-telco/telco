/* The catalogue, read once from the feed and indexed in memory.
 *
 * The same 245 products, 496 variants and 568 relations that Dengage holds in its own product
 * tables. The site reads this copy because a page must never wait on a Dengage call to draw
 * itself, and because the Dengage tables carry no room for a USSD code, an allowance in
 * gigabytes or an instalment term.
 */
(function (window) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var state = { loaded: false, products: {}, variants: {}, byProduct: {}, out: {}, inbound: {},
                order: [], waiting: [] };

  function index(feed) {
    feed.products.forEach(function (p) { state.products[p.product_id] = p; state.order.push(p.product_id); });
    feed.variants.forEach(function (v) {
      state.variants[v.product_variant_id] = v;
      (state.byProduct[v.product_id] = state.byProduct[v.product_id] || []).push(v);
    });
    feed.relations.forEach(function (r) {
      (state.out[r.from_product_id] = state.out[r.from_product_id] || []).push(r);
      (state.inbound[r.to_product_id] = state.inbound[r.to_product_id] || []).push(r);
    });
    Object.keys(state.out).forEach(function (k) {
      state.out[k].sort(function (a, b) { return a.rank - b.rank; });
    });
    state.loaded = true;
    state.waiting.splice(0).forEach(function (cb) { cb(api); });
  }

  var api = {
    ready: function (cb) { state.loaded ? cb(api) : state.waiting.push(cb); },
    loaded: function () { return state.loaded; },
    product: function (id) { return state.products[id] || null; },
    variant: function (id) { return state.variants[id] || null; },
    variantsOf: function (id) { return state.byProduct[id] || []; },
    all: function () { return state.order.map(function (id) { return state.products[id]; }); },

    /* Only in stock items are ever recommended. Plans, packs and services carry 9999 so they
       never read as out of stock; devices carry a real integer, zeros included. */
    inStock: function (id) {
      var p = state.products[id];
      return !!(p && p.is_active && (p.stock_count === null || p.stock_count > 0));
    },

    related: function (id, relation) {
      return (state.out[id] || [])
        .filter(function (r) { return !relation || r.relation === relation; })
        .map(function (r) {
          return { product: state.products[r.to_product_id], relation: r.relation,
                   rank: r.rank, note: r.note };
        })
        .filter(function (r) { return r.product; });
    },

    byCategory: function (path, exact) {
      return api.all().filter(function (p) {
        return p.is_active && (exact ? p.category_path === path
                                     : p.category_path.indexOf(path) === 0);
      });
    },

    search: function (q) {
      var needle = String(q || '').trim().toLowerCase();
      if (!needle) { return []; }
      return api.all().filter(function (p) {
        return p.is_active && (
          p.title.toLowerCase().indexOf(needle) >= 0 ||
          p.brand.toLowerCase().indexOf(needle) >= 0 ||
          p.category_path.toLowerCase().indexOf(needle) >= 0 ||
          (p.tags || []).join(' ').toLowerCase().indexOf(needle) >= 0);
      });
    },

    price: function (p) {
      var n = (p && (p.discounted_price !== undefined ? p.discounted_price : p.price));
      return cfg.locale.symbol + Number(n).toFixed(cfg.locale.decimals);
    },
    image: function (slugOrProduct, size) {
      var slug = typeof slugOrProduct === 'string' ? slugOrProduct
                                                   : (slugOrProduct && slugOrProduct.image_slug);
      return cfg.origin + 'assets/catalog/' + slug + '-' + (size || 400) + '.jpg';
    },
    link: function (id) { return cfg.origin + 'product.html?id=' + id; },

    load: function (feed) { index(feed); return api; }
  };

  api.fetch = function (base) {
    return fetch((base || '') + 'data/catalogue.json', { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (feed) { return index(feed), api; });
  };

  window.DTelcoCatalog = api;
})(window);
