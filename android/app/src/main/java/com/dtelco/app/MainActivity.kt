package com.dtelco.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.dtelco.app.ui.*

/* Eight screens, and each exists because it proves one thing no other screen proves.
 *
 *   SignIn    the same contact key as the browser, so two surfaces are one profile
 *   Home      a mobile in-app message, the app's answer to an on-site campaign
 *   Shop      app sourced rows landing in the same tables the web writes
 *   Discover  App Stories, served and reported by Dengage, drawn by nothing here
 *   Product   a push opening this screen through the deep link it carried
 *   Inbox     the Dengage App Inbox drawn natively, beside the demo's own message centre
 *   Nearby    a geofence region, which is the one moment a browser can never have
 *   Device    what Dengage holds about this handset, and the consent that governs it
 *
 * Five of them are tabs because a customer moves between them. Three are pushed on top, because
 * each is somewhere a customer arrives from something rather than somewhere they browse to: a
 * product from a notification, the nearby screen from a store card, the device screen from the
 * account.
 *
 * setNavigation is called on every screen change rather than once at start, because that is what
 * the SDK guide requires and a screen that skips it is a screen where an in-app campaign silently
 * never appears with no error to notice.
 */
class MainActivity : ComponentActivity() {

  private var pendingProductId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    pendingProductId = productIdFrom(intent)

    setContent {
      DtelcoTheme {
        var loadError by remember { mutableStateOf<String?>(null) }
        var loaded by remember { mutableStateOf(false) }
        var tab by remember { mutableStateOf(Tab.Home) }
        var pushed by remember {
          mutableStateOf<Pushed?>(pendingProductId?.let { Pushed.Product(it) })
        }
        var contactKey by remember { mutableStateOf(Identity.get(this@MainActivity)) }

        LaunchedEffect(Unit) {
          loadError = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            Catalogue.load()
          }
          loaded = true
        }

        /* A push that arrived while the app was already open lands here rather than in onCreate. */
        DisposableEffect(Unit) {
          val listener = { id: String -> pushed = Pushed.Product(id); tab = Tab.Shop }
          deepLinkListener = listener
          onDispose { deepLinkListener = null }
        }

        Scaffold(
          bottomBar = {
            NavigationBar {
              for (t in Tab.entries) {
                NavigationBarItem(
                  selected = tab == t && pushed == null,
                  onClick = { tab = t; pushed = null },
                  icon = { Text(t.glyph) },
                  label = { Text(t.label) },
                )
              }
            }
          }
        ) { pad ->
          Box(Modifier.padding(pad).fillMaxSize()) {
            val here = pushed
            when {
              !loaded -> Loading()
              loadError != null && Catalogue.all.isEmpty() -> Problem(loadError!!)
              here is Pushed.Product -> ProductScreen(
                activity = this@MainActivity,
                productId = here.id,
                onBack = { pushed = null },
              )
              here is Pushed.Nearby -> NearbyScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
                onBack = { pushed = null },
              )
              here is Pushed.Device -> DeviceScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
                onBack = { pushed = null },
              )
              tab == Tab.Home -> HomeScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
                onOpenProduct = { pushed = Pushed.Product(it) },
                onOpenNearby = { pushed = Pushed.Nearby },
              )
              tab == Tab.Shop -> ShopScreen(
                activity = this@MainActivity,
                onOpenProduct = { pushed = Pushed.Product(it) },
              )
              tab == Tab.Discover -> DiscoverScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
                onOpenProduct = { pushed = Pushed.Product(it) },
              )
              tab == Tab.Inbox -> InboxScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
              )
              tab == Tab.Account -> SignInScreen(
                activity = this@MainActivity,
                contactKey = contactKey,
                onContactKey = { contactKey = it },
                onOpenDevice = { pushed = Pushed.Device },
              )
            }
          }
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    productIdFrom(intent)?.let { id -> deepLinkListener?.invoke(id) }
  }

  /* dtelco://product/<product_id>, which is what the catalogue's android_deep_link carries while
     App Links verification waits on a release signing key. An https URL is
     accepted too, so the same link works from an email once verification is set up. */
  private fun productIdFrom(intent: Intent?): String? {
    val data = intent?.data ?: return null
    val id = when {
      data.scheme == Config.DEEP_LINK_SCHEME && data.host == "product" ->
        data.pathSegments.firstOrNull()
      data.scheme?.startsWith("http") == true ->
        data.getQueryParameter("id")
      else -> null
    } ?: return null
    return id.takeIf { Catalogue.byId(it) != null || Catalogue.all.isEmpty() }
  }

  companion object {
    @Volatile private var deepLinkListener: ((String) -> Unit)? = null
  }
}

enum class Tab(val label: String, val glyph: String) {
  Home("Home", "⌂"),
  Shop("Shop", "▦"),
  Discover("Discover", "◍"),
  Inbox("Inbox", "✉"),
  Account("Account", "●"),
}

/* The screens a person arrives at rather than browses to. Kept as a type rather than three
   nullable strings, because three independent nullables is three ways to be on two screens at
   once and the compiler cannot see any of them. */
sealed interface Pushed {
  data class Product(val id: String) : Pushed
  data object Nearby : Pushed
  data object Device : Pushed
}
