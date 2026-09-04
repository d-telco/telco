package com.dtelco.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/* The catalogue, read from the same feed the website reads.
 *
 * Product ids, variant ids and category paths are identical across the two surfaces on purpose. A
 * person who views a phone in the browser and then opens it in the app must produce two rows about
 * the same product, not two rows about two products, or every segment built on product id splits
 * in half.
 */
data class Product(
  val id: String,
  val title: String,
  val description: String,
  val categoryPath: String,
  val brand: String,
  val productType: String,
  val price: Double,
  val discountedPrice: Double,
  val stockCount: Int?,
  val imageSlug: String?,
  val dataGb: Double?,
  val minutes: Int?,
  val validityDays: Int?,
) {
  val hasDiscount: Boolean get() = discountedPrice < price
  /* Omitted rather than guessed. A null stock count is unknown; a zero would announce the product
     out of stock, which is the standing check that has cost a build before. */
  val inStock: Boolean? get() = stockCount?.let { it > 0 }
  val isPlan: Boolean get() = productType == "plan"
}

data class CartLine(
  val product: Product,
  val variantId: String,
  val quantity: Int,
) {
  val unitPrice: Double get() = product.price
  val discountedPrice: Double get() = product.discountedPrice

  /* The shape shopping_cart_events takes. product_variant_id falls back to product_id, which is
     the documented behaviour and the reason distinct variants must keep distinct ids. */
  fun toEventMap(): HashMap<String, Any> = HashMap<String, Any>().apply {
    put("product_id", product.id)
    put("product_variant_id", variantId.ifBlank { product.id })
    put("quantity", quantity)
    put("unit_price", unitPrice)
    put("discounted_price", discountedPrice)
  }
}

object Catalogue {
  @Volatile private var cache: List<Product> = emptyList()

  val all: List<Product> get() = cache
  fun byId(id: String): Product? = cache.firstOrNull { it.id == id }
  fun byType(type: String): List<Product> = cache.filter { it.productType == type }

  fun categories(): List<String> =
    cache.map { it.categoryPath }.distinct().sorted()

  fun search(q: String): List<Product> {
    if (q.isBlank()) return emptyList()
    val needle = q.trim().lowercase()
    return cache.filter {
      it.title.lowercase().contains(needle) || it.brand.lowercase().contains(needle) ||
        it.categoryPath.lowercase().contains(needle)
    }
  }

  /* Loaded once at start and held. The feed is a few hundred rows and a demonstration that pauses
     to fetch a product on every tap is a demonstration about latency. */
  fun load(): String? {
    if (cache.isNotEmpty()) return null
    return try {
      val body = Http.get(Config.FEED) ?: return "the product feed did not answer"
      val products = JSONObject(body).optJSONArray("products") ?: JSONArray()
      val out = ArrayList<Product>(products.length())
      for (i in 0 until products.length()) {
        val p = products.getJSONObject(i)
        if (!p.optBoolean("is_active", true)) continue
        out.add(
          Product(
            id = p.getString("product_id"),
            title = p.optString("title"),
            description = p.optString("description"),
            categoryPath = p.optString("category_path"),
            brand = p.optString("brand"),
            productType = p.optString("product_type"),
            price = p.optDouble("price", 0.0),
            discountedPrice = p.optDouble("discounted_price", p.optDouble("price", 0.0)),
            stockCount = if (p.isNull("stock_count")) null else p.optInt("stock_count"),
            imageSlug = if (p.isNull("image_slug")) null else p.optString("image_slug"),
            dataGb = if (p.isNull("data_gb")) null else p.optDouble("data_gb"),
            minutes = if (p.isNull("minutes")) null else p.optInt("minutes"),
            validityDays = if (p.isNull("validity_days")) null else p.optInt("validity_days"),
          )
        )
      }
      cache = out
      null
    } catch (t: Throwable) {
      "the product feed could not be read: ${t.message}"
    }
  }
}

/* One place that makes an HTTP call, so a timeout, a header or a proxy setting is set once. */
object Http {
  fun get(url: String): String? = request(url, "GET", null)

  fun post(url: String, json: String): String? = request(url, "POST", json)

  private fun request(url: String, method: String, body: String?): String? = try {
    val c = URL(url).openConnection() as HttpURLConnection
    c.requestMethod = method
    c.connectTimeout = 12000
    c.readTimeout = 15000
    c.setRequestProperty("accept", "application/json")
    if (body != null) {
      c.doOutput = true
      c.setRequestProperty("content-type", "application/json")
      c.outputStream.use { it.write(body.toByteArray()) }
    }
    /* Read the body on a failure too. Every backend function here answers a refusal with a reason
       in the body, and a caller that reads only the status learns nothing from it. */
    val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
    val text = stream?.bufferedReader()?.use { it.readText() }
    c.disconnect()
    text
  } catch (t: Throwable) { null }
}
