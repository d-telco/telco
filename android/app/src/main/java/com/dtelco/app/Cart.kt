package com.dtelco.app

import androidx.compose.runtime.mutableStateListOf

/* The cart, held in memory for the length of a demonstration.
 *
 * Remove before add when a selection changes. shopping_cart_events rebuilds the cart from the
 * stream, so a changed quantity sent as a second add reads in Dengage as two of the thing rather
 * than one of it changed. That is the standing check, and it is enforced here rather than at each
 * call site so no screen can forget it.
 */
object Cart {
  val lines = mutableStateListOf<CartLine>()

  val count: Int get() = lines.sumOf { it.quantity }
  val total: Double get() = lines.sumOf { it.discountedPrice * it.quantity }

  fun add(product: Product, variantId: String = product.id, quantity: Int = 1) {
    val existing = lines.indexOfFirst { it.product.id == product.id && it.variantId == variantId }
    if (existing >= 0) {
      val was = lines[existing]
      DengageBridge.removeFromCart(was)
      val now = was.copy(quantity = was.quantity + quantity)
      lines[existing] = now
      DengageBridge.addToCart(now)
    } else {
      val line = CartLine(product, variantId, quantity)
      lines.add(line)
      DengageBridge.addToCart(line)
    }
    facts()
  }

  fun remove(line: CartLine) {
    lines.remove(line)
    DengageBridge.removeFromCart(line)
    facts()
  }

  fun clear() {
    for (l in lines.toList()) DengageBridge.removeFromCart(l)
    lines.clear()
    facts()
  }

  /* What a real time in-app rule compares against. Set every time the cart moves, because a rule
     about a cart over a threshold is only true at the moment it is read.
     Two shapes, because the SDK takes two and a rule can be written against either. The count and
     the amount answer "is this cart worth interrupting". The structured cart answers "what is in
     it", which is what a rule about a handset with no case in the basket needs and what a count
     can never say. */
  private fun facts() {
    DengageBridge.cartFacts(count, total)
    DengageBridge.structuredCart(lines.toList())
  }
}
