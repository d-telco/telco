package com.dtelco.app

import android.app.Activity
import android.app.Notification
import android.content.Context
import android.location.Location
import android.view.View
import androidx.core.app.NotificationCompat
import com.dengage.geofence.DengageGeofence
import com.dengage.geofence.GeofenceInterceptor
import com.dengage.sdk.Dengage
import com.dengage.sdk.callback.DengageCallback
import com.dengage.sdk.callback.DengageError
import com.dengage.sdk.callback.ReviewDialogCallback
import com.dengage.sdk.domain.geofence.model.GeofenceLocationSource
import com.dengage.sdk.domain.inappmessage.model.Cart as InAppCart
import com.dengage.sdk.domain.inappmessage.model.CartItem as InAppCartItem
import com.dengage.sdk.domain.inappmessage.model.CartSummary
import com.dengage.sdk.domain.inboxmessage.model.InboxMessage
import com.dengage.sdk.domain.rfm.model.RFMGender
import com.dengage.sdk.domain.rfm.model.RFMItem
import com.dengage.sdk.domain.rfm.model.RFMScore
import com.dengage.sdk.domain.tag.model.TagItem
import com.dengage.sdk.liveupdate.LiveUpdateHandler
import com.dengage.sdk.liveupdate.LiveUpdatePayload
import com.dengage.sdk.ui.inappmessage.InAppInlineElement
import com.dengage.sdk.ui.story.StoriesListView

/* The only file in this app that imports com.dengage.sdk or com.dengage.geofence.
 *
 * One module talks to the SDK on each surface. On the web that is js/dengageEvents.js. Here it is
 * this file. Every screen calls these functions and none of them knows the SDK exists, which is
 * what keeps a call from being written twice with two spellings and what makes a documentation
 * change one edit rather than a search.
 *
 * The two SDK views are handed back as android.view.View for the same reason. A Compose screen
 * that named InAppInlineElement would be a second file reaching for the SDK, and the type it
 * actually needs is the one AndroidView takes.
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
 *   sendCustomEvent A caller supplied key instead of the device id. Which table it belongs in is
 *                   settled by the star schema, not by taste: a contact key only joins in a table
 *                   related to master_contact, so contact keyed rows go to the contact linked
 *                   table and never to the device linked one, where they would store and join to
 *                   nobody.
 *
 * WHAT THE MOBILE SDK HAS AND THE WEB SDK DOES NOT
 *
 * These are the reason the app is not the website in a smaller window. Each is called below and
 * each has a screen behind it: geofence regions, App Stories, an inline in-app element placed in
 * the app's own layout, device tags, the subscription record read back, the consent switches, RFM
 * ordering computed on the handset, a live update notification a push edits in place, the store
 * review prompt, and app presence.
 *
 * WHERE THE DOCUMENTATION AND THE SHIPPED SDK DISAGREE
 *
 * Read from the 6.0.99 AAR with javap on 4 September 2026, because a signature copied from a code
 * sample is a signature nobody has compiled. Three differences, each of which fails the build or,
 * worse, compiled and behaved oddly:
 *
 *   setNavigation takes android.app.Activity. The guide writes every call site as
 *   `activity as AppCompatActivity`. appcompat does arrive transitively with the SDK, so the cast
 *   compiles, and then it throws at runtime on a ComponentActivity, which is what Compose gives
 *   you. Same for showRealTimeInApp.
 *
 *   Every event method takes a trailing Context with a default. The guide never mentions it, and
 *   every call here leaves it defaulted.
 *
 * One thing the AAR appeared to contradict and did not: getInboxMessages reads as
 * DengageCallback<List<InboxMessage>> under javap, because Kotlin's MutableList erases to
 * java.util.List. The guide's MutableList is correct and is what compiles. Recorded because
 * reading an erased signature and calling the documentation wrong is the easy mistake here.
 *
 * WHAT IS DELIBERATELY NOT CALLED
 *
 *   setDeviceId       replaces the id the SDK minted. A push token is bound to the device the SDK
 *                     knows about, so replacing the id mid demonstration is the fastest way to
 *                     make every later push land nowhere. It is read back on the device screen
 *                     and never written.
 *   setLocationPermission  the geofence module calls it itself, with the handset's real permission
 *                     state, every time tracking starts. Calling it here as well would let the app
 *                     tell Dengage something the operating system disagrees with.
 *   showTestPage      the SDK's own diagnostic page. The device screen shows the same values in
 *                     this app's own words, which is what a prospect can read.
 *
 * Nothing here invents a method. If a capability is not in the SDK it is not called, and the
 * screen that wanted it says so on its face.
 */
object DengageBridge {

  /* The app runs before an integration key is issued, exactly as the web build runs in dry mode
     before accountId and appGuid arrive. Every function below is a no-op then, and the sign in
     screen says so rather than pretending. */
  @Volatile var live: Boolean = false
    private set

  @Volatile var lastError: String? = null
    private set

  /* What the geofence module last reported entering, held for the screen to draw. The SDK raises
     the signal and Dengage decides what to send; this is the local card beside it, which is the
     same division of labour the website's creatives follow. */
  @Volatile var lastGeofence: GeofenceEnter? = null
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
      /* A button inside an in-app message can carry a link, and without this the SDK has no scheme
         to open it with. The same scheme the manifest answers and the catalogue's
         android_deep_link carries, so an in-app button and a push land on the same screen. */
      Dengage.inAppLinkConfiguration(Config.DEEP_LINK_SCHEME)
      /* One ongoing notification whose content a push edits in place, rather than a new
         notification per step. Registered at start because a live update can arrive while the app
         is in the background, and a handler registered on a screen would not be there yet. */
      Dengage.liveUpdateManager.register(Config.LIVE_UPDATE_ACTIVITY_TYPE, OrderLiveUpdate)
      DengageGeofence.geofenceInterceptor = Interceptor
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
  fun language(code: String) = guard { Dengage.setLanguage(language = code) }

  /* The three identity moments the SDK names in their own right. A page view called "login" would
     be a row about a screen; these are rows about the account, and a welcome journey triggers on
     the register one rather than guessing from a page. */
  fun signedIn() = guard { Dengage.sendLoginEvent() }
  fun signedOut() = guard { Dengage.sendLogoutEvent() }
  fun registered() = guard { Dengage.sendRegisterEvent() }

  /* An attribution platform gives the handset its own id. Passing it here is what lets one report
     say the install and the purchase belong to the same device, and it is a string this app is
     handed rather than one it invents, so it is only sent when there is one. */
  fun partnerDeviceId(id: String) = guard {
    if (id.isBlank()) return@guard
    Dengage.setPartnerDeviceId(id)
  }

  /* ------------------------------------------------------------------ events */

  /* Every screen fires this first, before anything else it does. A screen whose page view arrives
     late, or not at all, has rows in Dengage that nothing can find. */
  fun pageView(pageType: String, extra: Map<String, Any> = emptyMap()) = guard {
    Dengage.pageView(HashMap<String, Any>().apply { put("page_type", pageType); putAll(extra) })
  }

  /* A category opened is its own event rather than a page view with a field on it, and a browse
     abandonment journey reads it directly. */
  fun categoryView(path: String) = guard { Dengage.categoryView(path) }

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

  /* The reversal, naming the order it reverses. reference/upsertorders closes the status
     vocabulary at success and refund, so this is how an order stops counting, and it is the same
     event the website's orders page fires. */
  fun cancelOrder(orderId: String) = guard {
    Dengage.cancelOrder(HashMap<String, Any>().apply { put("order_id", orderId) })
  }

  fun search(keywords: String, resultCount: Int) = guard {
    Dengage.search(HashMap<String, Any>().apply {
      put("keywords", keywords); put("result_count", resultCount)
    })
  }

  fun addToWishlist(productId: String, listName: String = "wishlist") = guard {
    Dengage.addToWishList(HashMap<String, Any>().apply {
      put("product_id", productId); put("list_name", listName)
    })
  }

  fun removeFromWishlist(productId: String, listName: String = "wishlist") = guard {
    Dengage.removeFromWishList(HashMap<String, Any>().apply {
      put("product_id", productId); put("list_name", listName)
    })
  }

  /* The custom Data Space table, the same one the web writes: dtelco_events. The SDK fills key and
     event_date, so this app sends neither. Unknown values are omitted rather than sent as zero,
     because a zero is a measurement and a missing value is not. */
  fun custom(eventType: String, fields: Map<String, Any?> = emptyMap()) = guard {
    Dengage.sendDeviceEvent(Config.EVENT_TABLE, fieldsFor(eventType, fields))
  }

  /* A fact about the person, into the contact linked table, keyed by the contact.
     The difference from custom() is not cosmetic and the star schema enforces it: dtelco_events
     joins key to master_device.device_id, so a contact key written there stores and joins to
     nobody; dtelco_bss_events joins key to master_contact.contact_key, so this row reads
     correctly after a sign out, however the person arrived. The row takes that table's shape,
     event_name, source and note, which is the same shape the operator's backend writes, so one
     table carries one vocabulary whichever system wrote the row. */
  fun contactEvent(contactKey: String, eventName: String, note: String? = null,
                   source: String = "app") =
    guard {
      if (!Identity.SHAPE.matches(contactKey)) {
        lastError = "refused a contact event for a key of the wrong shape: $contactKey"
        return@guard
      }
      val data = HashMap<String, Any>()
      data["event_name"] = eventName
      data["source"] = source
      if (!note.isNullOrBlank()) data["note"] = note
      Dengage.sendCustomEvent(Config.BSS_EVENT_TABLE, contactKey, data)
    }

  private fun fieldsFor(eventType: String, fields: Map<String, Any?>): HashMap<String, Any> {
    val data = HashMap<String, Any>()
    data["event_type"] = eventType
    data["source"] = "android"
    for ((k, v) in fields) if (v != null) data[k] = v
    return data
  }

  /* ------------------------------------------------------------------ push */

  /* reference/new-android-sdk-, Asking User Permission for Notification. Below Android 13 the call
     has no effect, which is documented, and is why nothing here branches on the version. */
  fun askForNotifications(activity: Activity) = guard {
    Dengage.requestNotificationPermission(activity)
  }

  /* Android returns the token rather than handing it to a callback, which is the opposite of the
     Web SDK and the difference most likely to be written wrongly out of web habit. */
  fun token(): String? = read { Dengage.getToken() }

  fun notificationChannel(name: String) = guard { Dengage.setNotificationChannelName(name) }

  /* A development build takes the sandbox route rather than the production one. Set from the build
     type so a debug handset in the room cannot consume a production send. */
  fun developmentStatus(isDevelopment: Boolean) = guard {
    Dengage.setDevelopmentStatus(isDevelopment)
  }

  /* The payload of the last push this handset opened, printed on the device screen. It is the
     answer to the question a prospect asks after a notification lands: what was actually in it. */
  fun lastPushPayload(): String? = read { Dengage.getLastPushPayload() }

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

  /* Dismiss whatever is on screen. The one control that lets a presenter clear a message and
     carry on rather than wait it out. */
  fun dismissInApp() = guard { Dengage.removeInAppMessageDisplay() }

  /* The comparison values a real time in-app rule reads, set from this app's own state so a rule
     written in the panel about a cart over a certain amount has something true to compare. */
  fun cartFacts(count: Int, amount: Double) = guard {
    Dengage.setCartItemCount(count = count.toString())
    Dengage.setCartAmount(amount = amount.toString())
  }

  /* Dengage's structured cart carries integer prices, so a dollar value with cents in it cannot be
     sent as written. Rounding to whole dollars would turn 2.99 into 3, and 216 of this
     catalogue's 490 prices have a fractional part, so rounding is not a rounding error here, it is
     a different catalogue. Minor units lose nothing, which is why they are what is sent.
     The consequence is that a panel rule about a line price is written in cents while a rule about
     setCartAmount is written in dollars, and that is stated in ACCOUNT-SETUP.md rather than left
     for somebody to discover from a rule that never fires. One constant, so it is one edit if the
     account wants it the other way. */
  private const val MINOR_UNITS = 100
  private fun minor(v: Double): Int = Math.round(v * MINOR_UNITS).toInt()

  fun structuredCart(lines: List<CartLine>) = guard {
    val items = lines.map { line ->
      InAppCartItem(
        productId = line.product.id,
        productVariantId = line.variantId.ifBlank { line.product.id },
        categoryPath = line.product.categoryPath,
        price = minor(line.unitPrice),
        discountedPrice = minor(line.discountedPrice),
        hasDiscount = line.product.hasDiscount,
        hasPromotion = false,
        quantity = line.quantity,
        attributes = mapOf("product_type" to line.product.productType),
      )
    }
    Dengage.setCart(InAppCart(items, CartSummary.calculate(items)))
  }

  fun categoryPath(path: String) = guard { Dengage.setCategoryPath(path = path) }
  fun city(name: String) = guard { Dengage.setCity(name = name) }
  fun state(name: String) = guard { Dengage.setState(name = name) }

  /* Values this app supplies for an in-app template to print. The template is written once in the
     panel and says the plan name; the handset supplies which plan. Without this the same template
     would need one version per plan, which is the difference between a campaign and a mail merge.
     Cleared on sign out, because the next person holding the phone is not this person. */
  fun inAppDeviceInfo(values: Map<String, String>) = guard {
    for ((k, v) in values) Dengage.setInAppDeviceInfo(k, v)
  }

  fun clearInAppDeviceInfo() = guard { Dengage.clearInAppDeviceInfo() }

  fun inAppDeviceInfoNow(): Map<String, String> = read { Dengage.getInAppDeviceInfo() } ?: emptyMap()

  /* The app's answer to the website's inline slots. An inline in-app message is injected into the
     app's own layout at a named property rather than drawn over it, so it reads as part of the
     screen and scrolls with it. The view is handed back as a plain View so no screen has to name
     an SDK type. */
  fun inlineSlot(context: Context): View? = read { InAppInlineElement(context) }

  /* screenName has no default, which javap could not show and the compiler did. It is what the
     panel targets on, so it is passed from the screen rather than left to whatever setNavigation
     happened to say last. */
  fun showInline(slot: View, activity: Activity, propertyId: String, screenName: String) = guard {
    if (slot !is InAppInlineElement) return@guard
    Dengage.showInlineInApp(
      propertyId = propertyId,
      inAppInlineElement = slot,
      activity = activity,
      screenName = screenName,
    )
  }

  /* App Stories: the full screen tappable rail an operator app puts at the top of its home screen.
     Served by Dengage, rendered by the SDK's own view, and reported by the SDK. Nothing about it
     is drawn by this app, which is the point of showing it. */
  fun storyRail(context: Context): View? = read { StoriesListView(context) }

  fun showStories(rail: View, activity: Activity, propertyId: String, screenName: String) = guard {
    if (rail !is StoriesListView) return@guard
    Dengage.showStoriesList(
      storyPropertyId = propertyId,
      storiesListView = rail,
      activity = activity,
      screenName = screenName,
    )
  }

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

  /* The two controls a real mailbox has and a demonstration usually leaves out. They are still a
     hand pressing a button, so the rule above holds: nothing is marked read that nobody chose to
     mark read. */
  fun inboxAllRead() = guard { Dengage.setAllInboxMessagesAsClicked() }
  fun inboxEmptied() = guard { Dengage.deleteAllInboxMessages() }

  /* ------------------------------------------------------------------ tags */

  /* Device level tags, written from the app. The website writes contact tags through the engine's
     own question form; this writes them from code, which is the only way an answer given inside an
     app reaches a segment. Both end up segmentable and they are different writers, so both are
     shown. */
  fun tags(values: Map<String, String>) = guard {
    if (values.isEmpty()) return@guard
    Dengage.setTags(values.map { (tag, value) -> TagItem(tag, value) })
  }

  /* ------------------------------------------------------------------ consent */

  /* The three switches a regulated operator has to be able to show a regulator, held on the device
     record rather than in this app's own preferences. A person who turns notifications off here is
     off in Dengage, not merely off on this handset. */
  fun notificationConsent(granted: Boolean) = guard { Dengage.setUserPermission(granted) }
  fun trackingConsent(granted: Boolean) = guard { Dengage.setTrackingPermission(granted) }

  fun notificationConsentNow(): Boolean? = read { Dengage.getUserPermission() }
  fun trackingConsentNow(): Boolean? = read { Dengage.getTrackingPermission() }

  /* App presence, and the reason it is behind a switch. The list is the account's rather than this
     app's: the panel names the packages an operator has a business reason to look for, the SDK
     reads it back, and this passes it on only after somebody said yes. Android 11 and above will
     only answer for packages the manifest declares in its queries block, so the honest answer on a
     modern handset is the intersection of what the account asked for and what the manifest
     declares, and the device screen shows both. */
  fun startAppPresence() = guard {
    Dengage.startAppTracking(Dengage.getSdkParameters()?.appTrackingList)
  }

  /* ------------------------------------------------------------------ ordering */

  /* RFM ordering, computed on the handset. Dengage scores a contact per category; the app hands
     the SDK the list it is about to draw and gets it back in the order those scores put it. No
     network call, so a rail reorders while a finger is still on the glass, and the scores come
     from the platform's view of the whole contact rather than from a rule written here.
     saveRFMScores is what puts the scores on the device. Until the account's own scores are wired
     through, this build stands them in from the categories opened on the handset, which is the
     same shape of value in the same call and keeps the ordering reproducible in a meeting. The
     route the account's scores take to the device is on the panel verify list. */
  fun rfmScores(scores: Map<String, Double>) = guard {
    if (scores.isEmpty()) return@guard
    /* A MutableList, which the erased signature reads as List and the compiler does not. The same
       shape of difference as the inbox callback, and the same lesson: javap tells you what is
       there and only the compiler tells you what it means. */
    Dengage.saveRFMScores(
      scores.map { (categoryId, score) -> RFMScore(categoryId, score) }.toMutableList())
  }

  /* Returns the ids in the order the scores put them, or the ids as given when the SDK is not
     started. A screen that got an empty list back would draw an empty rail, which is a worse
     answer than an unsorted one. */
  fun rfmOrder(idsByCategory: List<Pair<String, String>>): List<String> {
    if (!live || idsByCategory.isEmpty()) return idsByCategory.map { it.first }
    return try {
      val items = idsByCategory.mapIndexed { i, (id, category) ->
        RFMItem(id, category, true, RFMGender.NEUTRAL, i)
      }.toMutableList()
      val sorted: List<RFMItem> = Dengage.sortRFMItems(RFMGender.NEUTRAL, items)
      sorted.map { it.id }
    } catch (t: Throwable) {
      lastError = t.message
      idsByCategory.map { it.first }
    }
  }

  /* ------------------------------------------------------------------ store review */

  /* The Play in-app review flow, raised at a moment worth reviewing rather than on the third
     launch. Play decides whether the sheet actually appears and never says which, so the callback
     reports what this app knows and nothing more. */
  fun askForReview(activity: Activity, then: (String) -> Unit) {
    if (!live) { then("the SDK is not started, so nothing was asked"); return }
    try {
      Dengage.showRatingDialog(activity, object : ReviewDialogCallback {
        override fun onCompletion() =
          then("the flow finished. Play does not say whether the sheet was shown.")
        override fun onError() = then("Play refused the flow on this build")
      })
    } catch (t: Throwable) { then(t.message ?: "the flow could not be started") }
  }

  /* ------------------------------------------------------------------ live update */

  /* One ongoing notification that a push edits in place, rather than a new notification per step.
     An order that is packed, then collected, then out for delivery is one thing happening, and
     three notifications about it is three interruptions about one thing.
     The handler below is what Dengage calls when a live update push arrives. The device screen can
     also post it directly, which draws exactly this notification from exactly this code and says
     on its face that it was drawn locally rather than delivered. */
  private object OrderLiveUpdate : LiveUpdateHandler {
    override val channelId: String = "dtelco_live_update"
    override val channelName: String = Config.BRAND + " order progress"
    override val channelDescription: String =
      "One notification per order, updated in place as the order moves"

    override fun buildNotification(context: Context, payload: LiveUpdatePayload): Notification {
      val state = payload.contentState ?: emptyMap()
      val step = state["step"] ?: "In progress"
      val detail = state["detail"] ?: ""
      val percent = state["percent"]?.toIntOrNull()
      val b = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(android.R.drawable.stat_sys_upload)
        .setContentTitle(state["title"] ?: (Config.BRAND + " order"))
        .setContentText(if (detail.isBlank()) step else "$step. $detail")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
      if (percent != null) b.setProgress(100, percent.coerceIn(0, 100), false)
      return b.build()
    }

    override fun onUpdate(context: Context, payload: LiveUpdatePayload) {
      lastLiveUpdate = (payload.contentState ?: emptyMap()).entries
        .joinToString(", ") { "${it.key}=${it.value}" }
    }
  }

  @Volatile var lastLiveUpdate: String? = null
    private set

  fun liveUpdateRegistered(): Boolean =
    read { Dengage.liveUpdateManager.isRegistered(Config.LIVE_UPDATE_ACTIVITY_TYPE) } ?: false

  fun liveUpdateActive(): Boolean =
    read { Dengage.liveUpdateManager.isActive(Config.LIVE_UPDATE_ACTIVITY_TYPE) } ?: false

  /* Draws the notification the handler above builds, from the same code, without a push. Labelled
     on screen as drawn locally, because a notification a presenter posted is not a notification
     Dengage delivered and the difference is the whole point of this build. */
  fun drawLiveUpdateLocally(context: Context, state: Map<String, String>): Notification? = read {
    OrderLiveUpdate.buildNotification(
      context,
      LiveUpdatePayload(
        Config.LIVE_UPDATE_ACTIVITY_TYPE,
        com.dengage.sdk.liveupdate.LiveUpdateEvent.UPDATE,
        Config.LIVE_UPDATE_ACTIVITY_TYPE,
        state,
        null,
      ),
    )
  }

  fun liveUpdateChannel(): Triple<String, String, String> =
    Triple(OrderLiveUpdate.channelId, OrderLiveUpdate.channelName, OrderLiveUpdate.channelDescription)

  /* ------------------------------------------------------------------ geofence */

  /* Regions are defined in the panel, never here. The app starts the tracker, asks for the
     permissions and listens; Dengage holds the circles, decides what a person entering one gets,
     and sends it. Stores.kt names the places whose coordinates the panel's regions are set to, so
     a presenter can put the handset at one of them.
     The documented behaviour this build works within: the nearest fifty regions are monitored,
     the list is refreshed about every fifteen minutes, a repeat signal for the same region inside
     five minutes is suppressed, and a fix accurate to worse than a kilometre is discarded. */
  fun startGeofence() = guard { DengageGeofence.startGeofence() }
  fun stopGeofence() = guard { DengageGeofence.stopGeofence() }
  fun askForLocation(activity: Activity) = guard {
    DengageGeofence.requestLocationPermissions(activity)
  }

  /* Handing the SDK a fix, which is what a demonstration in a meeting room needs and what the SDK
     has an entry point for. GeofenceLocationSource carries a MOCK_LOCATION value, so a fix that
     did not come from the handset's own radios is reported to Dengage as exactly that rather than
     dressed up as a real one. Walking to the store still works and takes the same road. */
  fun standAt(context: Context, latitude: Double, longitude: Double, label: String) = guard {
    val fix = Location("dtelco-demo").apply {
      this.latitude = latitude
      this.longitude = longitude
      accuracy = 10f
      time = System.currentTimeMillis()
      elapsedRealtimeNanos = android.os.SystemClock.elapsedRealtimeNanos()
    }
    DengageGeofence.handleLocation(context, fix, GeofenceLocationSource.MOCK_LOCATION, label)
  }

  data class GeofenceEnter(
    val latitude: Double, val longitude: Double, val radius: Double,
    val clusterId: Int, val clusterName: String?,
    val geofenceItemId: Int, val geofenceItemName: String?,
    val at: Long = System.currentTimeMillis(),
  )

  private object Interceptor : GeofenceInterceptor {
    override fun onGeofenceEnter(
      latitude: Double, longitude: Double, radius: Double,
      clusterId: Int, clusterName: String?, geofenceItemId: Int, geofenceItemName: String?,
    ) {
      lastGeofence = GeofenceEnter(latitude, longitude, radius,
                                   clusterId, clusterName, geofenceItemId, geofenceItemName)
    }
  }

  /* ------------------------------------------------------------------ read back */

  /* What Dengage holds about this handset, in this app's own words. It is the mobile answer to the
     verification console's channel readiness: a push that goes nowhere and a push nobody
     subscribed to look identical from a screen, and these values tell them apart. */
  data class DeviceCard(
    val contactKey: String?, val deviceId: String?, val token: String?, val tokenType: String?,
    val notificationConsent: Boolean?, val trackingConsent: Boolean,
    val sdkVersion: String?, val appVersion: String?, val carrierId: String?,
    val advertisingId: String?, val integrationKey: String?,
  )

  fun deviceCard(): DeviceCard? = read {
    val s = Dengage.getSubscription() ?: return@read null
    DeviceCard(
      contactKey = s.contactKey, deviceId = s.deviceId, token = s.token, tokenType = s.tokenType,
      notificationConsent = s.permission, trackingConsent = s.trackingPermission,
      sdkVersion = s.sdkVersion, appVersion = s.appVersion, carrierId = s.carrierId,
      advertisingId = s.advertisingId, integrationKey = s.integrationKey,
    )
  }

  /* What the account has switched on, read from Dengage rather than assumed. An empty inbox and an
     inbox the account has not enabled look the same on a screen, and this is the difference. */
  data class AccountSwitches(
    val accountName: String?, val accountId: Int?, val appId: String?,
    val events: Boolean, val inbox: Boolean?, val inApp: Boolean?, val realTimeInApp: Boolean?,
    val geofence: Boolean, val appTracking: Boolean, val subscription: Boolean?,
    val appTrackingList: List<String>,
    val inAppFetchMinutes: Int?, val inAppMinSecondsBetween: Int?,
  )

  fun accountSwitches(): AccountSwitches? = read {
    val p = Dengage.getSdkParameters() ?: return@read null
    AccountSwitches(
      accountName = p.accountName, accountId = p.accountId, appId = p.appId,
      events = p.eventsEnabled, inbox = p.inboxEnabled, inApp = p.inAppEnabled,
      realTimeInApp = p.realTimeInAppEnabled, geofence = p.geofenceEnabled,
      appTracking = p.appTrackingEnabled, subscription = p.subscriptionEnabled,
      appTrackingList = (p.appTrackingList ?: emptyList()).mapNotNull { it.packageName },
      inAppFetchMinutes = p.inAppFetchIntervalInMin,
      inAppMinSecondsBetween = p.inAppMinSecBetweenMessages,
    )
  }

  fun inAppFetched(): Boolean = read { Dengage.isInAppFetched() } ?: false

  /* Whether the account has in-app switched on for this application. The slots draw nothing until
     it does, because an empty labelled box on a shopping screen is worse than no box: it is the
     one thing on that screen a customer has no use for. */
  fun inAppEnabled(): Boolean = accountSwitches()?.inApp == true

  private inline fun guard(body: () -> Unit) {
    if (!live) return
    try { body() } catch (t: Throwable) { lastError = t.message ?: t.javaClass.simpleName }
  }

  private inline fun <T> read(body: () -> T?): T? {
    if (!live) return null
    return try { body() } catch (t: Throwable) { lastError = t.message; null }
  }
}
