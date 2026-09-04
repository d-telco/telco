/* D-TELCO configuration, baked at build time rather than fetched.
 *
 * A fetched config is one more network call between the visitor and the first pageView, and
 * the first pageView is what makes every later row findable. So this is a plain script.
 *
 * accountId and appGuid come from the web application defined in the panel. Until they are set
 * every value below is empty
 * and the SDK snippet in the head does not load a loader, dengageEvents logs [dengage dry] and
 * announces accepted:false, and the whole storefront runs exactly as it will with an account,
 * minus the writes. That is deliberate: the pages get built and checked now, not after.
 */
window.DTELCO_CONFIG = {
  slug: 'dtelco',

  /* Endpoints differ by datacenter, and dev.dengage.com names using the wrong ones as the most
   * common reason a first integration fails. https://api.dengage.com is the Istanbul datacenter
   * only. This account is in Turkey, so the `tr`
   * row below is the live one and every other row is kept because a datacenter is the first thing
   * a second deployment changes. Set `datacenter` and every URL follows. */
  datacenters: {
    tr: { api: 'https://tr-api.dengage.com', push: 'https://tr-push.dengage.com',
          event: 'https://tr-event.dengage.com', geofence: 'https://tr-push.dengage.com/geoapi/',
          inapp: 'https://tr-inapp.lib.dengage.com' },
    us: { api: 'https://us-api.dengage.com', push: 'https://us-push.dengage.com',
          event: 'https://us-event.dengage.com', geofence: 'https://us-push.dengage.com/geoapi/',
          inapp: 'https://us-inapp.lib.dengage.com' },
    eu: { api: 'https://eu-api.dengage.com', push: 'https://eu-push.dengage.com',
          event: 'https://eu-event.dengage.com', geofence: 'https://eu-push.dengage.com/geoapi/',
          inapp: 'https://eu-inapp.lib.dengage.com' },
    ru: { api: 'https://ru-api.dengage.com', push: 'https://ru-push.dengage.com',
          event: 'https://ru-event.dengage.com', geofence: 'https://ru-push.dengage.com/geoapi/',
          inapp: 'https://ru-inapp.lib.dengage.com' },
    sa: { api: 'https://sa-api.dengage.com', push: 'https://sa-push.dengage.com',
          event: 'https://sa-event.dengage.com', geofence: 'https://sa-push.dengage.com/geoapi/',
          inapp: 'https://sa-inapp.lib.dengage.com' }
  },
  datacenter: 'tr',                // CONFIRMED 4 September 2026: Turkey, Istanbul

  dengage: {
    accountId: '970',
    appGuid: '07d5e0f4-ffe2-404a-942d-31184957ff7d',
    loader: function (accountId, appGuid) {
      return 'https://pcdn.dengage.com/p/push/' + accountId + '/' + appGuid +
             '/dengage_sdk_loader.js';
    },
    eventTable: 'dtelco_events',   // the custom Data Space table, created in the panel first
    inboxLimit: 20
  },

  // language, currency and location are passed into initialize, which is where
  // reference/recommendation-web-sdk puts them: "we added new parameters and methods to provide
  // multilanguage, multilocation and multicurrency recommendations". location is a country string
  // and is a different thing from setCountry, which the SDK setup page asks for separately and
  // js/dengageEvents.js calls once per page.
  locale: { language: 'en', currency: 'USD', symbol: '$', decimals: 2,
            location: 'AZ', country: 'AZ' },

  origin: 'https://d-telco.github.io/telco/',

  // The stand-in backend. Public by design, like any form handler: a token shipped in a public
  // page is not a secret, so validation and rate caps are the defence, not obscurity.
  functions: {
    base: 'https://raextqlludkagdntyzwn.supabase.co/functions/v1/',
    relay: 'dtelco-lead-relay',
    message: 'dtelco-message',
    profile: 'dtelco-profile',
    operator: 'dtelco-operator',
    feed: 'dtelco-product-feed',
    counts: 'dtelco-dengage-tables',
    coupons: 'dtelco-coupons',
    personaSeed: 'dtelco-persona-seed',
    dataspace: 'dtelco-dataspace',
    ecomm: 'dtelco-ecomm',
    broadcast: 'dtelco-broadcast',
    inbox: 'dtelco-inbox',
    remote: 'dtelco-remote',
    preflight: 'dtelco-preflight'
  },

  // The six places this operator serves. One list, because the checkout writes a city onto a
  // contact and the outage broadcast puts a city in a push title, and two lists that drifted
  // apart would mean a fault announced for a town no customer is recorded in. check-contract
  // asserts this list and the one in dtelco-broadcast are the same six.
  cities: ['Baku', 'Ganja', 'Sumqayit', 'Mingachevir', 'Lankaran', 'Shirvan'],

  // The discount code the abandoned checkout journey carries. Dengage issues one code per
  // recipient from a coupon list and marks it taken, which is the difference between a code
  // that stays worth something and a shared word that reaches a forum by lunchtime.
  //
  // The shape is docs/coupon, Coupon Code Generation: a prefix is optional and "the system
  // automatically appends 8 random letters and numbers". The page recognises that shape and
  // nothing else, and says plainly what it can and cannot do with it: Dengage issues the code,
  // has no validate or redeem endpoint, and applying the discount is the operator's billing.
  coupon: {
    prefix: 'DTELCO-',
    shape: /^DTELCO-[A-Za-z0-9]{8}$/,
    redemption: 'Dengage issues this code and marks it taken. Applying the discount is the ' +
                'operator\'s billing system.'
  },

  contactKey: {
    prefix: 'DPS-DTELCO-',
    // Every server endpoint enforces this same shape. A typo mints a junk contact, and
    // setContactKey does not fail on an unknown key: it creates that contact.
    shape: /^DPS-[A-Za-z0-9_-]{1,44}$/,
    personas: 8
  },

  // Two views of one product makes it the focus product: the hero, the popup and the rail all
  // bend to it on the next page. Crossing this threshold is also a moment the visitor can be
  // addressed, so it is where an anonymous device gets a key.
  recognition: { threshold: 2, decayDays: 30, recommendations: 3 },

  // Measured values, kept here so a change is one edit rather than a search.
  timing: {
    storageLagMs: 120000,          // Data Space rows appear about two minutes later
    tokenFirstPollMs: 3000,        // getToken resolves to nothing until permission is granted
    tokenRefreshMs: 30000,         // a stale token is a send reported as delivered that is not
    inboxPollMs: 15000,
    creativeCooldownMs: 25000,
    relayThenMessageMs: 2500       // a slow relay must not cost the visitor their confirmation
  },

  demoNotice: 'A demonstration of Dengage for telecom. Every figure not published by a real ' +
              'operator is invented demo data.'
};

/* Resolve the datacenter once, so nothing downstream hard codes a regional host. */
window.DTELCO_CONFIG.endpoints =
  window.DTELCO_CONFIG.datacenters[window.DTELCO_CONFIG.datacenter];
