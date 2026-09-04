package com.dtelco.app

import android.content.Context

/* Category affinity, counted on the handset.
 *
 * The SDK sorts a list by a score per category. Dengage scores a contact across its whole
 * history; saveRFMScores is what puts those scores on the device and sortRFMItems is what uses
 * them. Until the account's own scores are wired through to the handset, this stands them in: it
 * counts the categories this person opens, the same way the website counts product views into its
 * focus state, and hands the counts over in the same call. Same shape of value, narrower history.
 *
 * Why it is worth doing on the handset rather than asking a server: the answer arrives while a
 * finger is still on the glass. A rail that reorders after a round trip is a rail that reorders
 * after the person has scrolled past it.
 *
 * Storage is namespaced by slug, the same rule everything else in this build follows, so this
 * demonstration can share a device with another without either reading the other's counts.
 */
object Affinity {
  private const val STORE = "dps:dtelco:affinity"

  /* The root of the category path, so Shop>Phones>Apple and Shop>Phones>Samsung are one interest
     rather than two. A score per leaf would need a history nobody has in a meeting. */
  fun root(categoryPath: String): String =
    categoryPath.substringBefore('>').trim().ifBlank { "Shop" }

  fun seen(c: Context, categoryPath: String) {
    val key = root(categoryPath)
    val prefs = c.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply()
  }

  /* Scores, not counts. The SDK takes a double per category and the relative order is what
     matters, so the raw count is the score and a category nobody opened is simply absent. Sending
     a zero for every unvisited category would say "measured, and it is nothing", which is not the
     same as "not measured" and is the mistake this build refuses everywhere else. */
  fun scores(c: Context): Map<String, Double> =
    c.getSharedPreferences(STORE, Context.MODE_PRIVATE).all
      .mapNotNull { (k, v) -> (v as? Int)?.let { k to it.toDouble() } }
      .toMap()

  fun clear(c: Context) =
    c.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().clear().apply()
}
