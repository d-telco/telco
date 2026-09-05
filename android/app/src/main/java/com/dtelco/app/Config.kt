package com.dtelco.app

/* Baked in, not fetched, for the same reason js/config.js is: a fetched config is one more network
 * call between the person opening the app and the first page view, and the first page view is what
 * makes every later row findable.
 *
 * Every value supplied at setup is empty below, and the app runs anyway. That is deliberate. The screens get
 * built and checked now rather than after the account arrives, and each one says on its face which
 * half of it is live.
 */
object Config {
  const val SLUG = "dtelco"
  const val BRAND = "D·TELCO"

  /* The integration key the panel generated when the Android application was defined, supplied
     5 September 2026. reference/new-android-sdk- calls it a hash string containing application
     details. Like accountId and appGuid in js/config.js it ships inside the app it identifies,
     so it is client configuration rather than a secret, and the defence is the same as the
     web's: validation and rate caps on everything it can reach. */
  const val FIREBASE_INTEGRATION_KEY =
    "BF3y4_s_l__p_l_kMEF3p_s_l_www4yzZ415WeCCZKsGEX8THDHcTOLrhqFk0mK_s_l_vZTT4LUrz5ynHThgxoibfdCBfvHB0GpjmGwYDourdGSPtZXr3mc8MJIWF6bAkPHGVwwBEuuHpsXD"

  /* The custom Data Space table, the same one the web writes. It must exist in the account before
     a single row stores; a row sent to a table that does not exist is accepted and dropped. */
  const val EVENT_TABLE = "dtelco_events"

  /* The other custom table, for facts that belong to a person rather than to a handset. The star
     schema settles which rows go where: dtelco_events relates to master_device on device_id, so
     the SDK's own device id is the key that joins; dtelco_bss_events relates to master_contact on
     contact_key, so a row about the person goes there, keyed by the person, whichever system wrote
     it. The operator's backend writes it and so does this app's check in. */
  const val BSS_EVENT_TABLE = "dtelco_bss_events"

  const val COUNTRY = "AZ"
  /* Passed to the SDK so a recommendation and an in-app message come back in the right language.
     The same value js/config.js carries in locale.language, because a person who reads the site in
     one language and the app in another is one contact getting two experiences. */
  const val LANGUAGE = "en"
  const val CURRENCY = "USD"
  const val CURRENCY_SYMBOL = "$"

  /* The same public, validated, rate capped functions the web storefront uses. One backend, two
     surfaces, so a recommendation the web showed is the recommendation the app shows. */
  const val FUNCTIONS = "https://raextqlludkagdntyzwn.supabase.co/functions/v1/"
  const val FEED = FUNCTIONS + "dtelco-product-feed"
  const val PROFILE = FUNCTIONS + "dtelco-profile"
  const val MESSAGE = FUNCTIONS + "dtelco-message"
  const val RELAY = FUNCTIONS + "dtelco-lead-relay"


  /* The scheme the manifest answers, the catalogue's android_deep_link carries and an in-app
     message's button opens. One value, so a push, an in-app button and a story all land on the
     same screen rather than three near misses. */
  const val DEEP_LINK_SCHEME = "dtelco"

  /* The named places a Dengage in-app message can be injected into this app's own layout, and the
     rail App Stories are drawn into. The app declares the names and the panel matches them, which
     is the same contract the website's dn_inline_target_ ids carry. ACCOUNT-SETUP.md lists them
     for whoever creates the content. */
  const val INLINE_HOME = "dtelco_app_home"
  const val INLINE_PRODUCT = "dtelco_app_product"
  const val INLINE_CART = "dtelco_app_cart"
  const val STORY_RAIL = "dtelco_app_stories"

  /* The live update this app registers a handler for. One ongoing notification per order, edited
     in place by a push rather than replaced by a new one at every step. */
  const val LIVE_UPDATE_ACTIVITY_TYPE = "dtelco_order"

  /* The notification channel the SDK would otherwise call "General". A person who long presses a
     notification sees this name, so it is the brand rather than a default. */
  const val NOTIFICATION_CHANNEL = "D·TELCO"

  /* Every figure this demonstration shows that no operator published is a plausible demo figure,
     and it is marked as one wherever it appears. */
  const val DEMO_NOTICE =
    "D·TELCO is a demonstration. Prices are in US dollars and every figure nobody published " +
    "is demo data."
}
