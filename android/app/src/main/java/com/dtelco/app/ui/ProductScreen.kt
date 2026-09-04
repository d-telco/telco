package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.ExperimentalMaterial3Api
import com.dtelco.app.*

/* Screen 28. Capability F9: an app push through Firebase, opening this screen from the
 * notification.
 *
 * This is the screen a push lands on. The catalogue's android_deep_link carries
 * dtelco://product/<product_id>, the manifest answers that scheme, MainActivity turns it into a
 * product id and this screen draws it. A push about a phone that opens the phone is the difference
 * between a notification and a campaign.
 *
 * The page view carries product_id, which is what makes the row findable and what a browse
 * abandonment journey triggers on. Fired first, before anything else this screen does.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductScreen(activity: Activity, productId: String, onBack: () -> Unit) {
  val product = Catalogue.byId(productId)

  LaunchedEffect(productId) {
    DengageBridge.pageView("product", mapOf("product_id" to productId))
    DengageBridge.screen(activity, "product")
    product?.let {
      DengageBridge.categoryPath(it.categoryPath)
      /* The custom row the website writes for the same moment, so a segment about people who
         looked at a handset fills from both surfaces rather than only from the browser. */
      DengageBridge.custom("product_view", mapOf(
        "product_id" to it.id,
        "category_path" to it.categoryPath,
      ))
    }
    DengageBridge.realTimeInApp(activity, "product")
  }

  if (product == null) {
    Column(Modifier.fillMaxSize()) {
      TopAppBar(title = { Text("Not in the catalogue") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } })
      Why(
        "A push carried the id $productId and this catalogue has no product with it. That is worth " +
          "showing rather than hiding: it is what happens when a message outlives the product it " +
          "was about, and it is why the id in a deep link has to come from the same feed the app " +
          "reads."
      )
    }
    return
  }

  var added by remember { mutableStateOf(false) }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    TopAppBar(title = { Text(product.title) },
              navigationIcon = { TextButton(onClick = onBack) { Text("Back") } })

    Column(Modifier.padding(16.dp)) {
      Text(product.brand, style = MaterialTheme.typography.labelMedium)
      Spacer(Modifier.height(8.dp))
      Text(money(product.discountedPrice), style = MaterialTheme.typography.headlineSmall)
      if (product.hasDiscount) {
        Text("was ${money(product.price)}", style = MaterialTheme.typography.bodySmall)
      }
      Spacer(Modifier.height(12.dp))
      Text(product.description, style = MaterialTheme.typography.bodyMedium)

      /* The plan facts a telco customer actually compares, printed only where the catalogue has
         them. An add on has no minutes and a handset has no data allowance. */
      Spacer(Modifier.height(12.dp))
      product.dataGb?.let { Text("Data: $it GB", style = MaterialTheme.typography.bodySmall) }
      product.minutes?.let { Text("Minutes: $it", style = MaterialTheme.typography.bodySmall) }
      product.validityDays?.let {
        Text("Valid for $it days", style = MaterialTheme.typography.bodySmall)
      }
      product.inStock?.let {
        Text(if (it) "In stock" else "Out of stock", style = MaterialTheme.typography.bodySmall)
      }

      Spacer(Modifier.height(16.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { Cart.add(product); added = true }) {
          Text(if (product.isPlan) "Choose this tariff" else "Add to cart")
        }
        OutlinedButton(onClick = { DengageBridge.addToWishlist(product.id) }) {
          Text("Save it")
        }
      }
      if (added) {
        Spacer(Modifier.height(8.dp))
        /* Drawn by this app, not fetched. Non negotiable 2: confirmations are local, and Dengage
           carries the profile, the events and the channels. No round trip for a card. */
        Text("${product.title} is in your cart.", style = MaterialTheme.typography.bodySmall)
      }
    }

    DemoNotice()
  }
}
