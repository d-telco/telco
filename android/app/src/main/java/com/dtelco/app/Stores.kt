package com.dtelco.app

/* The six places the operator serves, and the coordinates a geofence region in the panel is set
 * to.
 *
 * This file holds no Dengage call and creates no geofence. Regions live in the panel, which is the
 * whole point: an operator adds a store on a Tuesday and every handset picks it up at the next
 * refresh without an app release. What this list is for is the other half of that, the half a
 * demonstration needs: it names the coordinates the panel's regions are set to, so a presenter can
 * put a handset at one of them and watch what Dengage sends.
 *
 * The coordinates are the published centres of the six cities in js/config.js, which is the same
 * list the checkout writes onto an order and the broadcast function checks a city against. The
 * store at that point is invented, like everything else in this demonstration that nobody
 * published, and the screen says so.
 *
 * There is no store locator page on the website and there is not one here either. A store is a
 * reference table, it can never be a remote data source, and a screen that listed shops would
 * prove nothing Dengage does. These six exist because a region has to be somewhere.
 */
data class Store(
  val id: String,
  val name: String,
  val city: String,
  val latitude: Double,
  val longitude: Double,
  /* What the panel's region is set to, repeated here so a presenter reading the screen and a
     person reading the panel are looking at the same number. Dengage decides the real radius. */
  val radiusMeters: Int,
  val note: String,
)

object Stores {
  val all = listOf(
    Store("dtelco-store-baku", "D·TELCO Nizami", "Baku", 40.4093, 49.8671, 150,
          "The flagship. The one a device upgrade journey sends a collect in store offer to."),
    Store("dtelco-store-ganja", "D·TELCO Ganja Centre", "Ganja", 40.6828, 46.3606, 150,
          "The second city. The one the network operations broadcast names when there is a fault."),
    Store("dtelco-store-sumqayit", "D·TELCO Sumqayit", "Sumqayit", 40.5855, 49.6317, 150,
          "Commuter town. A person who lives here and works in Baku enters two regions a day."),
    Store("dtelco-store-mingachevir", "D·TELCO Mingachevir", "Mingachevir", 40.7700, 47.0489, 150,
          "Inland. Far enough from the others that no two regions overlap."),
    Store("dtelco-store-lankaran", "D·TELCO Lankaran", "Lankaran", 38.7529, 48.8475, 150,
          "The south. The furthest region from the flagship, which is what the nearest fifty rule " +
            "is about."),
    Store("dtelco-store-shirvan", "D·TELCO Shirvan", "Shirvan", 39.9266, 48.9206, 150,
          "The smallest of the six. Included so the list is the operator's whole footprint."),
  )

  /* The airport, which is not a store and is the second kind of region a telco cares about. A
     person arriving at one is the roaming arrival moment, and it is a different business moment
     from walking past a shop, so it is a different region rather than a seventh store. */
  val arrival = Store(
    "dtelco-arrival-gyd", "Heydar Aliyev International", "Baku", 40.4675, 50.0467, 1200,
    "Arrivals. The roaming welcome, in the moment, unplanned, which is the one journey no date " +
      "and no browsing behaviour can predict.",
  )

  val regions: List<Store> get() = all + arrival

  fun byId(id: String): Store? = regions.firstOrNull { it.id == id }
}
