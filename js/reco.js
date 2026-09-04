/* The recommendation engine.
 *
 * Decision 13: no Dengage recommendation widget. The site and the app decide, from the
 * catalogue and the profile, and Dengage is told the answer so it can reuse the same three
 * products in every channel. Nothing on the page is ever labelled a Dengage recommendation.
 *
 * Every rule names itself, so the readout can say why a card appeared. That is the difference
 * between a demo that shows recommendations and a demo that can be interrogated about them.
 */
(function (window) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var CAT = window.DTelcoCatalog;
  var EV = window.DengageEvents;
  var LIMIT = cfg.recognition.recommendations;

  function pushUnique(out, product, rule, why) {
    if (!product) { return; }
    if (!CAT.inStock(product.product_id)) { return; }     // never recommend what cannot be sold
    if (out.some(function (r) { return r.product.product_id === product.product_id; })) { return; }
    out.push({ product: product, rule: rule, why: why });
  }

  function related(id, relation, out, rule, why) {
    CAT.related(id, relation).forEach(function (r) { pushUnique(out, r.product, rule, why || r.note); });
  }

  /* Priority order. The bold entry is the recognition thread: on the home page there is no
     product in front of the visitor, so the focus rule wins there naturally; on a product page
     the product they are actually looking at wins, which is correct.
     1 requires, 2 usage upsell, 3 cart bundle, 4 focus cross sell, 5 current cross sell,
     6 travel and family, 7 alternative. */
  function recommend(context) {
    var ctx = context || {};
    var out = [];
    var current = ctx.currentProductId;
    var cart = ctx.cart || [];
    var profile = ctx.profile || null;
    var focus = ctx.focus || (window.DTelcoRecognition && window.DTelcoRecognition.focus());

    // 1. A plan that needs an internet package is not a recommendation, it is a requirement.
    if (current) {
      related(current, 'requires', out, 'requires', 'this plan needs an internet package');
    }

    // 2. Consumption, the one signal only a telco has.
    if (out.length < LIMIT && profile && profile.data_ratio >= 0.8 && profile.plan_id) {
      related(profile.plan_id, 'upsell', out, 'usage_80',
              'you are at ' + Math.round(profile.data_ratio * 100) + ' percent of your data');
    }

    // 3. A phone and a plan already in the basket are a bundle waiting to be pointed out.
    if (out.length < LIMIT && cart.length) {
      cart.forEach(function (item) {
        CAT.related(item.product_id, 'cross_sell').forEach(function (r) {
          if (r.product.product_type === 'bundle') {
            pushUnique(out, r.product, 'cart_bundle', 'cheaper as a bundle');
          }
        });
      });
    }

    // 4. The recognition thread. Two visits to one handset, so its accessories and its bundle.
    if (out.length < LIMIT && focus && focus.product_id !== current) {
      related(focus.product_id, 'cross_sell', out, 'focus_cross_sell',
              'goes with the ' + (focus.title || 'one you looked at'));
    }

    // 5. Whatever is in front of them right now.
    if (out.length < LIMIT && current) {
      related(current, 'cross_sell', out, 'cross_sell');
      related(current, 'upsell', out, 'upsell', 'the tier above');
    }

    // 6. Travel and family, read from the profile rather than guessed.
    if (out.length < LIMIT && profile) {
      if (profile.roaming_days > 0 || profile.frequent_traveller) {
        CAT.byCategory('Mobile>Roaming>Internet').slice(0, LIMIT).forEach(function (p) {
          pushUnique(out, p, 'traveller', 'for the next trip');
        });
      }
      if (profile.lines_at_address >= 2 && profile.family_lines === 1) {
        CAT.byCategory('Bundles>Family').forEach(function (p) {
          pushUnique(out, p, 'family', 'more than one line at this address');
        });
      }
    }

    // 7. The sibling at a similar price, for a visitor who has shown nothing else.
    if (out.length < LIMIT && current) {
      related(current, 'alternative', out, 'alternative', 'similar money, different family');
    }
    if (out.length < LIMIT && focus) {
      related(focus.product_id, 'alternative', out, 'alternative');
    }
    if (out.length < LIMIT) {
      CAT.byCategory('Mobile>Plans>Prepaid GO').forEach(function (p) {
        pushUnique(out, p, 'popular', 'what most people start on');
      });
    }

    return out.slice(0, LIMIT);
  }

  var api = {
    recommend: recommend,

    /* Reported to Dengage so a journey can react to an impression, and so the same three ids
       reach the contact columns the messages print from. */
    report: function (results, surface) {
      if (!results || !results.length) { return; }
      EV.custom('reco_shown', {
        product_id: results.map(function (r) { return r.product.product_id; }).join(','),
        rule: results[0].rule,
        source: surface || 'web',
        note: results.map(function (r) { return r.rule; }).join(',')
      });
      /* The three ids reach the contact so a marketing message can print the same three products.
         Ids only: the relay derives title, price and image from the id, because a page that passed
         a price could pass any price, and the price a message quotes has to be the operator's.

         Marketing channels only, decided this session. A transactional send cannot read a contact
         column at all, which the documentation states outright, so recommendations travel by email,
         WhatsApp, onsite and in app and never by a transactional push or SMS. */
      if (window.DTelcoRecognition) {
        var body = { form: 'recommendation', reco_rule: results[0].rule,
                     reco_at: new Date().toISOString() };
        results.forEach(function (r, i) {
          body['reco_product_id_' + (i + 1)] = r.product.product_id;
        });
        var key = window.DTelcoIdentity.get();
        if (key) { body.contact_key = key; window.DTelcoRecognition.publish(body); }
      }
    },

    clicked: function (productId, rule, surface) {
      EV.custom('reco_clicked', { product_id: productId, rule: rule, source: surface || 'web' });
    }
  };

  window.DTelcoReco = api;
})(window);
