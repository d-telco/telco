package com.dtelco.app

import android.content.Context
import android.content.SharedPreferences

/* The contact key, and the reason the app and the website are one profile rather than two.
 *
 * Storage is namespaced by slug, the same rule the web build follows, so this demonstration can
 * share a device with another one without either reading the other's key.
 *
 * SHAPE is the expression every server endpoint enforces and DengageBridge checks before it calls
 * setContactKey. It matters more here than anywhere: setContactKey does not fail on an unknown
 * key, it creates that contact, so a typed key with a typo in it becomes a permanent junk contact.
 */
object Identity {
  val SHAPE = Regex("^DPS-[A-Za-z0-9_-]{1,44}$")
  const val PREFIX = "DPS-DTELCO-"

  private const val STORE = "dps:dtelco"
  private const val KEY = "ck"

  private fun prefs(c: Context): SharedPreferences =
    c.getSharedPreferences(STORE, Context.MODE_PRIVATE)

  fun get(c: Context): String? = prefs(c).getString(KEY, null)

  /* Accepts only a well formed key. A caller that hands over something else gets null and no
     contact is created anywhere. */
  fun set(c: Context, key: String): String? {
    if (!SHAPE.matches(key)) return null
    prefs(c).edit().putString(KEY, key).apply()
    DengageBridge.contactKey(key)
    return key
  }

  /* A person who opens the app without signing in still deserves to be addressable, so a key is
     minted for the device on the same convention the web mints one. */
  fun claim(c: Context): String {
    get(c)?.let { return it }
    val minted = PREFIX + System.currentTimeMillis()
    return set(c, minted) ?: minted
  }

  fun clear(c: Context) = prefs(c).edit().remove(KEY).apply()

  /* The order id convention shared with the web, so an order placed on the phone and an order
     placed in a browser sort together and read alike in the panel. */
  fun orderId(kind: String): String = "DPS-dtelco-$kind-${System.currentTimeMillis()}"
}
