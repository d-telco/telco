package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dtelco.app.*

/* Screen 31. Capability L2: App Stories, served by Dengage and drawn by the SDK's own view.
 *
 * This is the screen an operator app actually has and a website cannot. Stories are full screen,
 * tappable, expire on their own and are edited in the panel between one commute and the next.
 * Nothing on the rail is composed here, chosen here or reported here: the SDK draws it and the SDK
 * reports it, which is exactly the opposite of the recommendation rail on the home screen, and
 * putting the two on adjacent tabs is the cheapest way to explain the difference.
 *
 * Underneath it, the same screen carries the other two things Dengage can put inside an app's own
 * layout rather than over it: an inline in-app property, and the values a template prints.
 *
 * The offers rail is ordered on the handset. Dengage's SDK sorts a list against a score per
 * category, this app supplies the scores from what has been opened, and the answer arrives with no
 * network call at all. It is the one piece of personalization in this build that is faster than a
 * round trip because it never makes one.
 */
@Composable
fun DiscoverScreen(activity: Activity, contactKey: String?, onOpenProduct: (String) -> Unit) {
  var ordered by remember { mutableStateOf<List<Product>>(emptyList()) }
  var reviewSaid by remember { mutableStateOf<String?>(null) }
  var infoSaid by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("discover")
    DengageBridge.screen(activity, "discover")
    DengageBridge.realTimeInApp(activity, "discover")
  }

  /* Save the scores, then sort. In that order, because sorting against scores the SDK has not been
     given yet returns the list as it went in and looks like the feature does nothing. */
  LaunchedEffect(contactKey) {
    DengageBridge.rfmScores(Affinity.scores(activity))
    val pool = Catalogue.all.filter { it.hasDiscount || it.isPlan }.take(24)
    val order = DengageBridge.rfmOrder(pool.map { it.id to Affinity.root(it.categoryPath) })
    val byId = pool.associateBy { it.id }
    ordered = order.mapNotNull { byId[it] }
  }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    ScreenTitle("Discover", "Content Dengage serves, in this app's own layout.")

    /* The rail. Everything about it is Dengage's, which is the point of showing it beside a rail
       that is entirely this app's. */
    StoryRail(activity, Config.STORY_RAIL, "discover",
              Modifier.padding(horizontal = 16.dp))
    Why(
      "App Stories. The content, the order, the expiry and the reporting are all Dengage's. " +
        "Nothing on this rail is drawn by the app, and nothing about it needs a release.",
    )

    /* An in-app message injected into the layout rather than drawn over it, which is the app's
       equivalent of the website's inline slots and behaves the same way: it scrolls with the page
       and it is part of the screen rather than an interruption. */
    Spacer(Modifier.height(8.dp))
    InlineInAppSlot(activity, Config.INLINE_HOME, "discover",
                    Modifier.padding(horizontal = 16.dp))
    Why(
      "An inline in-app property. Same engine as the message that covers the screen, placed in " +
        "the layout instead of over it, so a merchandising slot does not have to interrupt " +
        "anybody to be filled.",
    )

    ScreenTitle(
      "Offers, in your order",
      "Sorted on this handset against a score per category, with no network call.",
    )
    if (ordered.isEmpty()) {
      Why("Nothing to sort yet. Open a few categories on the Shop tab and come back.")
    } else {
      LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(ordered.size) { i -> ProductCard(ordered[i]) { onOpenProduct(ordered[i].id) } }
      }
      Why(
        "The scores are this handset's count of the categories opened on it. The sorting is the " +
          "SDK's. An operator that already scores its customers puts its own numbers in and " +
          "nothing else changes.",
      )
    }

    /* The values an in-app template prints. The template is written once in the panel and says the
       plan name; the handset says which plan. Without this the same message would need one version
       per plan, which is the difference between a campaign and a mail merge. */
    Card(Modifier.fillMaxWidth().padding(16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("What a template can print", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        val now = DengageBridge.inAppDeviceInfoNow()
        if (now.isEmpty()) {
          Text("Nothing set on this handset yet.", style = MaterialTheme.typography.bodySmall)
        } else {
          for ((k, v) in now) Fact(k, v)
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(
            enabled = DengageBridge.live,
            onClick = {
              DengageBridge.inAppDeviceInfo(mapOf(
                "surface" to "android",
                "cart_items" to Cart.count.toString(),
                "top_category" to (Affinity.scores(activity).maxByOrNull { it.value }?.key ?: ""),
              ))
              infoSaid = "Set. An in-app message written in the panel prints these without " +
                "knowing anything about this handset in advance."
            },
          ) { Text("Set from this handset") }
          OutlinedButton(
            enabled = DengageBridge.live,
            onClick = {
              DengageBridge.clearInAppDeviceInfo()
              infoSaid = "Cleared. The next person holding this phone is not this person."
            },
          ) { Text("Clear") }
        }
        infoSaid?.let { Spacer(Modifier.height(8.dp)); Why(it) }
      }
    }

    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("Two controls a demonstration needs", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(
            enabled = DengageBridge.live,
            onClick = { DengageBridge.dismissInApp() },
          ) { Text("Dismiss the in-app message") }
          /* The Play review sheet, raised at a moment worth reviewing rather than on the third
             launch. Play decides whether it appears and never says which, so the answer below
             reports what this app knows and stops there. */
          OutlinedButton(
            enabled = DengageBridge.live,
            onClick = { DengageBridge.askForReview(activity) { reviewSaid = it } },
          ) { Text("Ask for a store review") }
        }
        reviewSaid?.let { Spacer(Modifier.height(8.dp)); Why(it) }
      }
    }

    DemoNotice()
  }
}
