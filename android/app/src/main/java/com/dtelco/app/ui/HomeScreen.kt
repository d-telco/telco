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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/* Screen 27. Capability F10: the mobile in-app message, the app's answer to an on-site campaign.
 *
 * The rail underneath is the same three products the website's rail shows, because both ask
 * dtelco-profile for them rather than each running its own rules. Two engines would give two
 * answers and a prospect switching between the two surfaces would notice within a minute.
 *
 * The rail is drawn by this app. Dengage carries the profile, the events and the segments, and
 * reuses the same three ids in email, push and WhatsApp. Nothing here is labelled a Dengage
 * recommendation, because it is not one.
 */
@Composable
fun HomeScreen(
  activity: Activity,
  contactKey: String?,
  onOpenProduct: (String) -> Unit,
  onOpenNearby: () -> Unit,
) {
  var answer by remember { mutableStateOf<ProfileAnswer?>(null) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("home")
    /* Both calls, every time this screen is shown. setNavigation is what makes an in-app campaign
       eligible to draw; showRealTimeInApp is the one that evaluates rules against the cart, the
       category and the city this app has already told the SDK about. */
    DengageBridge.screen(activity, "home")
    DengageBridge.realTimeInApp(activity, "home")
  }

  LaunchedEffect(contactKey) {
    val k = contactKey ?: return@LaunchedEffect
    val a = withContext(Dispatchers.IO) { Backend.profile(k) }
    answer = a
    /* The values an in-app template prints, taken from the operator's own record rather than from
       anything this screen made up. A message written once in the panel then says this person's
       plan name without the panel knowing a single plan name in advance. */
    a.line?.let { line ->
      DengageBridge.inAppDeviceInfo(buildMap {
        line.planName?.let { put("plan_name", it) }
        line.lifecycle?.let { put("lifecycle", it) }
        line.dataRatio?.let { put("data_used_percent", (it * 100).toInt().toString()) }
      })
      line.city?.let { DengageBridge.city(it) }
    }
  }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    ScreenTitle(Config.BRAND, "Tariffs, devices and add ons, on the same account as the website.")

    val line = answer?.line
    if (line != null) {
      /* The one number a telco customer opens an app to see. Drawn from the operator's own record
         rather than from anything this screen invented. */
      Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(16.dp)) {
          Text(line.planName ?: "Your plan", style = MaterialTheme.typography.titleMedium)
          val ratio = line.dataRatio
          if (ratio != null) {
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
              progress = { ratio.toFloat().coerceIn(0f, 1f) },
              modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(4.dp))
            Text("${(ratio * 100).toInt()} percent of your data used",
                 style = MaterialTheme.typography.bodySmall)
          }
          line.balance?.let {
            Spacer(Modifier.height(4.dp))
            Text("Balance ${money(it)}", style = MaterialTheme.typography.bodySmall)
          }
        }
      }
    }

    val picks = answer?.picks.orEmpty()
    if (picks.isNotEmpty()) {
      ScreenTitle("Picked for you")
      /* The rule is printed. A rail that cannot say why it chose something is decoration, and the
         rule name is also what a prospect checks against the segment in the panel. */
      picks.firstOrNull()?.why?.let { Why(it) }
      LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        items(picks.size) { i ->
          val pick = picks[i]
          Card(Modifier.width(180.dp).clickable { onOpenProduct(pick.productId) }) {
            Column(Modifier.padding(12.dp)) {
              Text(pick.title, style = MaterialTheme.typography.bodyMedium)
              Spacer(Modifier.height(4.dp))
              Text(money(pick.price), style = MaterialTheme.typography.titleSmall)
              Spacer(Modifier.height(4.dp))
              AssistChip(onClick = {}, label = { Text(pick.rule) })
            }
          }
        }
      }
    } else if (contactKey == null) {
      Why(
        "Sign in on the Account tab and this fills with the same three products the website's " +
          "rail shows for that person, chosen by the same engine rather than by a second one."
      )
    }

    /* An in-app message placed in the layout rather than over it, on the screen a person opens
       most. Dengage fills it or leaves it empty; nothing here decides. */
    Spacer(Modifier.height(8.dp))
    InlineInAppSlot(activity, Config.INLINE_HOME, "home",
                    Modifier.padding(horizontal = 16.dp))

    /* The one thing on this app no browser can do, one tap from the home screen because a person
       walking past a shop is not going to go looking for it in a menu. */
    Card(
      Modifier.fillMaxWidth().padding(16.dp).clickable { onOpenNearby() },
    ) {
      Column(Modifier.padding(16.dp)) {
        Text("Near you", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(
          "Seven regions, six shops and an airport. Dengage holds the circles and decides what " +
            "somebody entering one gets.",
          style = MaterialTheme.typography.bodySmall,
        )
      }
    }

    ScreenTitle("Tariffs")
    val plans = Catalogue.byType("plan").take(6)
    LazyRow(
      contentPadding = PaddingValues(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      items(plans.size) { i -> ProductCard(plans[i]) { onOpenProduct(plans[i].id) } }
    }

    ScreenTitle("Devices")
    val devices = Catalogue.byType("device").take(6)
    LazyRow(
      contentPadding = PaddingValues(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      items(devices.size) { i -> ProductCard(devices[i]) { onOpenProduct(devices[i].id) } }
    }

    DemoNotice()
  }
}

@Composable
fun ProductCard(product: Product, onClick: () -> Unit) {
  Card(Modifier.width(180.dp).clickable(onClick = onClick)) {
    Column(Modifier.padding(12.dp)) {
      Text(product.title, style = MaterialTheme.typography.bodyMedium)
      Spacer(Modifier.height(4.dp))
      Text(product.brand, style = MaterialTheme.typography.labelSmall)
      Spacer(Modifier.height(4.dp))
      Text(money(product.discountedPrice), style = MaterialTheme.typography.titleSmall)
      /* Printed only when it is known. A null stock count says nothing; printing "out of stock"
         from a null would take every product off the shelf. */
      product.inStock?.let {
        Spacer(Modifier.height(4.dp))
        Text(if (it) "In stock" else "Out of stock", style = MaterialTheme.typography.labelSmall)
      }
    }
  }
}
