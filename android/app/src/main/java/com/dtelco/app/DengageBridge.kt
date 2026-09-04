package com.dtelco.app

import android.app.Activity
import android.content.Context
import com.dengage.sdk.Dengage
import com.dengage.sdk.callback.DengageCallback
import com.dengage.sdk.callback.DengageError
import com.dengage.sdk.domain.inboxmessage.model.InboxMessage

/* The only file in this app that imports com.dengage.sdk.
 *
 * One module talks to the SDK on each surface. On the web that is
 * js/dengageEvents.js. Here it is this file. Every screen calls these functions and none of them
 * knows the SDK exists, which is what keeps a call from being written twice with two spellings and
 * what makes a documentation change one edit rather than a search.
 *
 * WHERE THE MOBILE SDK DIFFERS FROM THE WEB SDK
 *
 *   getToken        Android returns the token. The Web SDK is callback style and needs caching.
 *   addToWishList   Capital L. The Web SDK's event is ec:addToWishlist, lower case l.
 *   pageView        Takes a map with page_type. The Web SDK takes a page type string.
 *   setNavigation   Has no Web SDK equivalent at all. In-app messages are never drawn without it,
 *                   so it is called on every screen change rather than once at start.
 *   sendDeviceEvent Table name first, then the map. The SDK fills key and event_date, so this app
 *                   must not send them.
 *
 * WHERE THE DOCUMENTATION AND THE SHIPPED SDK DISAGREE
 *
 * Read from the 6.0.99 AAR on 4 September 2026, because a signature copied from a code sample is a
 * signature nobody has compiled. Three differences, each of which fails the build or,
 * worse, compiled and behaved oddly:
 *
 *   setNavigation takes android.app.Activity. reference/new-android-sdk- writes every call site as
 *   `activity as AppCompatActivity`, which would drag in appcompat for nothing and crash a cast on
 *   a ComponentActivity. Same for showRealTimeInApp.
 *
 *   Every event method takes a trailing Context with a default. The guide never mentions it, and
 *   every call here leaves it defaulted.
 *
 * One thing the AAR appeared to contradict and did not: getInboxMessages reads as
 * DengageCallback<List<InboxMessage>> under javap, because Kotlin's MutableList erases to
 * java.util.List. The guide's MutableList is correct and is what compiles. Recorded because
 * reading an erased signature and calling the documentation wrong is the easy mistake here.
 *
 * Nothing here invents a method. If a capability is not in the SDK it is not called, and the screen
 * that wanted it says so on its face.
 */
object DengageBridge {

  /* The app runs before an integration key is issued, exactly as the web build
     runs in dry mode before accountId and appGuid arrive. Every function below is a no-op then,
     and the sign in screen says so rather than pretending. */
  @Volatile var live: Boolean = false
    private set

  @Volatile var lastError: String? = null
    private set

  fun start(context: Context, firebaseIntegrationKey: String) {
    if (firebaseIntegrationKey.isBlank()) {
      live = false
      lastError = "no Firebase integration key, so the SDK was not started"
      return
    }
    try {
      /* reference/new-android-sdk-, Initialization. disableOpenWebUrl stays false so a push
         carrying a target URL opens it. deviceConfigurationPreference is left at its default:
         the Huawei value would need the sdk-hms module this build does not carry. */
      Dengage.init(
        context = context,
        firebaseIntegrationKey = firebaseIntegrationKey,
        disableOpenWebUrl = false,
      )
      Dengage.setLogStatus(enable = true)
      live = true
      lastError = null
    } catch (t: Throwable) {
      live = false
      lastError = t.message ?: t.javaClass.simpleName
    }
  }

  /* ------------------------------------------------------------------ identity */

  /* The same key the web storefront uses, so one person browsing both surfaces is one contact.
     Validated before it is passed, because setContactKey with an unknown key CREATES that contact
     and a typo would mint a junk one that never goes away. Identity.SHAPE is the same expression
     every server endpoint enforces. */
  fun contactKey(key: String) = guard {
    if (!Identity.SHAPE.matches(key)) {
      lastError = "refused a contact key of the wrong shape: $key"
      return@guard
    }
    Dengage.setContactKey(contactKey = key)
  }

  fun country(code: String) = guard { Dengage.setCountry(country = code) }

  /* ------------------------------------------------------------------ events */

  /* Every screen fires this first, before anything else it does. A screen whose page view arrives
     late, or not at all, has rows in Dengage that nothing can find. */
  fun pageView(pageType: String, extra: Map<String, Any> = emptyMap()) = guard {
    Dengage.pageView(HashMap<String, Any>().apply { put("page_type", pageType); putAll(extra) })
  }

  fun addToCart(line: CartLine) = guard { Dengage.addToCart(line.toEventMap()) }
  fun removeFromCart(line: CartLine) = guard { Dengage.removeFromCart(line.toEventMap()) }
  fun viewCart() = guard { Dengage.viewCart(HashMap()) }

  /* Held until the cart names an item. beginCheckout on an empty cart is a row saying somebody
     started to buy nothing, and it is the same guard the web build applies. */
  fun beginCheckout(lines: List<CartLine>) = guard {
    if (lines.isEmpty()) return@guard
    Dengage.beginCheckout(HashMap())
  }

  /* order_events, with item_count and total_amount computed here from the lines rather than
     accepted from a caller, for the same reason the backend computes them: a total a screen passed
     is a total a screen could get wrong. */
  fun order(orderId: String, lines: List<CartLine>, paymentMethod: String, coupon: String?) = guard {
    if (lines.isEmpty()) return@guard
    val data = HashMap<String, Any>()
    data["order_id"] = orderId
    data["item_count"] = lines.sumOf { it.quantity }
    data["total_amount"] = lines.sumOf { it.unitPrice * it.quantity }
    data["discounted_price"] = lines.sumOf { it.discountedPrice * it.quantity }
    data["payment_method"] = paymentMethod
    if (!coupon.isNullOrBlank()) data["coupon_code"] = coupon
    Dengage.order(data)
  }

  fun search(keywords: String, resultCount: Int) = guard {
    Dengage.search(HashMap<String, Any>().apply {
      put("keywords", keywords); put("result_count", resultCount)
    })
  }

  fun addToWishlist(productId: String) = guard {
    Dengage.addToWishList(HashMap<String, Any>().apply { put("product_id", productId) })
  }

  fun removeFromWishlist(productId: String) = guard {
    Dengage.removeFromWishList(HashMap<String, Any>().apply { put("product_id", productId) })
  }

  /* The custom Data Space table, the same one the web writes: dtelco_events. The SDK fills key and
     event_date, so this app sends neither. Unknown values are omitted rather than sent as zero,
     because a zero is a measurement and a missing value is not. */
  fun custom(eventType: String, fields: Map<String, Any?> = emptyMap()) = guard {
    val data = HashMap<String, Any>()
    data["event_type"] = eventType
    data["source"] = "android"
    for ((k, v) in fields) if (v != null) data[k] = v
    Dengage.sendDeviceEvent(Config.EVENT_TABLE, data)
  }

  /* ------------------------------------------------------------------ push */

  /* reference/new-android-sdk-, Asking User Permission for Notification. Below Android 13 the call
     has no effect, which is documented, and is why nothing here branches on the version. */
  fun askForNotifications(activity: Activity) = guard {
    Dengage.requestNotificationPermission(activity)
  }

  /* Android returns the token rather than handing it to a callback, which is the opposite of the
     Web SDK and the difference most likely to be written wrongly out of web habit. */
  fun token(): String? = if (!live) null else try {
    Dengage.getToken()
  } catch (t: Throwable) { lastError = t.message; null }

  fun notificationChannel(name: String) = guard { Dengage.setNotificationChannelName(name) }

  /* ------------------------------------------------------------------ in app */

  /* reference/new-android-sdk-, In-App Messaging: "you just have to add setNavigation function to
     every page navigation". Not once at start. A screen that forgets this is a screen where an
     in-app campaign silently never appears, and there is no error to notice. */
  fun screen(activity: Activity, screenName: String) = guard {
    Dengage.setNavigation(activity = activity, screenName = screenName)
  }

  fun realTimeInApp(activity: Activity, screenName: String,
                    params: HashMap<String, String>? = null) = guard {
    Dengage.showRealTimeInApp(activity = activity, screenName = screenName, params = params)
  }

  /* The comparison values a real time in-app rule reads, set from this app's own state so a rule
     written in the panel about a cart over a certain amount has something true to compare. */
  fun cartFacts(count: Int, amount: Double) = guard {
    Dengage.setCartItemCount(count = count.toString())
    Dengage.setCartAmount(amount = amount.toString())
  }

  fun categoryPath(path: String) = guard { Dengage.setCategoryPath(path = path) }
  fun city(name: String) = guard { Dengage.setCity(name = name) }

  /* ------------------------------------------------------------------ inbox */

  /* reference/new-android-sdk-, App Inbox. Two things gate this and both are account
     rather than this app's: the account is enabled for the feature by writing to tech@dengage.com,
     and each push content has Save To Inbox switched on with an expiry. Until both are true this
     returns an empty list, which the inbox screen reports as an empty list rather than as a
     failure, because an empty mailbox is a real answer. */
  fun inbox(limit: Int = 20, offset: Int = 0, then: (List<InboxMessage>, String?) -> Unit) {
    if (!live) { then(emptyList(), "the SDK is not started"); return }
    try {
      Dengage.getInboxMessages(limit, offset,
        object : DengageCallback<MutableList<InboxMessage>> {
        override fun onResult(result: MutableList<InboxMessage>) = then(result, null)
        override fun onError(error: DengageError) = then(emptyList(), error.errorMessage)
      })
    } catch (t: Throwable) { then(emptyList(), t.message) }
  }

  /* Reported only when a person actually opened the message on this screen. The standing rule is
     that impressions, opens and deletes are never reported for messages Dengage did not issue; the
     inverse holds too, so a message Dengage did issue is marked read only when a hand did it. */
  fun inboxOpened(messageId: String) = guard { Dengage.setInboxMessageAsClicked(messageId) }
  fun inboxDeleted(messageId: String) = guard { Dengage.deleteInboxMessage(messageId) }

  private inline fun guard(body: () -> Unit) {
    if (!live) return
    try { body() } catch (t: Throwable) { lastError = t.message ?: t.javaClass.simpleName }
  }
}
