package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dtelco.app.*

/* Screen 30. Capability C3: app sourced rows landing in the same tables as the web.
 *
 * Search, cart and order, all writing to search_events, shopping_cart_events and order_events. The
 * proof is a count in the panel that moves when the phone is used and moves again when the browser
 * is used, with the same contact key on both. One customer, one history, two devices.
 */
@Composable
fun ShopScreen(activity: Activity, onOpenProduct: (String) -> Unit) {
  var query by remember { mutableStateOf("") }
  var results by remember { mutableStateOf<List<Product>>(emptyList()) }
  var showCart by remember { mutableStateOf(false) }
  var placed by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("category")
    DengageBridge.screen(activity, "shop")
  }

  Column(Modifier.fillMaxSize()) {
    ScreenTitle("Shop", "Everything here writes to the same tables the website writes to.")

    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
      OutlinedTextField(
        value = query,
        onValueChange = { query = it },
        label = { Text("Search") },
        singleLine = true,
        modifier = Modifier.weight(1f),
      )
      Spacer(Modifier.width(8.dp))
      Button(onClick = {
        results = Catalogue.search(query)
        /* search_events, with the result count as it actually was. A search reported with a count
           nobody counted is a row that lies quietly. */
        if (query.isNotBlank()) DengageBridge.search(query, results.size)
      }) { Text("Go") }
    }

    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      FilterChip(selected = !showCart, onClick = { showCart = false }, label = { Text("Catalogue") })
      FilterChip(
        selected = showCart,
        onClick = {
          showCart = true
          DengageBridge.viewCart()
          DengageBridge.pageView("cart")
        },
        label = { Text("Cart (${Cart.count})") },
      )
    }

    if (showCart) {
      CartPanel(onPlaced = { placed = it })
      placed?.let { Why("Order $it is placed. The confirmation card is drawn by this app; the " +
        "order row and the journey that follows it are Dengage's.") }
      return@Column
    }

    val shown = if (results.isNotEmpty()) results else Catalogue.all
    LazyColumn(Modifier.fillMaxSize()) {
      items(shown.size) { i ->
        val p = shown[i]
        ListItem(
          headlineContent = { Text(p.title) },
          supportingContent = { Text("${p.brand} · ${p.categoryPath}") },
          trailingContent = { Text(money(p.discountedPrice)) },
          modifier = Modifier.clickable { onOpenProduct(p.id) },
        )
        HorizontalDivider()
      }
    }
  }
}

@Composable
private fun CartPanel(onPlaced: (String) -> Unit) {
  Column(Modifier.fillMaxWidth().padding(16.dp)) {
    if (Cart.lines.isEmpty()) {
      Text("Nothing in the cart yet.", style = MaterialTheme.typography.bodyMedium)
      return@Column
    }
    for (line in Cart.lines.toList()) {
      Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text("${line.quantity} x ${line.product.title}", Modifier.weight(1f))
        Text(money(line.discountedPrice * line.quantity))
        Spacer(Modifier.width(8.dp))
        TextButton(onClick = { Cart.remove(line) }) { Text("Remove") }
      }
    }
    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    Row(Modifier.fillMaxWidth()) {
      Text("Total", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
      Text(money(Cart.total), style = MaterialTheme.typography.titleMedium)
    }
    Spacer(Modifier.height(12.dp))
    Button(
      modifier = Modifier.fillMaxWidth(),
      onClick = {
        /* beginCheckout waits until the cart names an item, which the bridge enforces, and the
           order id follows the same convention the website uses so both sort together. */
        DengageBridge.beginCheckout(Cart.lines.toList())
        val id = Identity.orderId("app")
        DengageBridge.order(id, Cart.lines.toList(), "credit_card", null)
        Cart.clear()
        onPlaced(id)
      },
    ) { Text("Place the order") }
    Why(
      "payment_method is one of the values Dengage's order API accepts. A word outside that list " +
        "is refused, so the app sends one from the list rather than whatever a screen felt like."
    )
  }
}
