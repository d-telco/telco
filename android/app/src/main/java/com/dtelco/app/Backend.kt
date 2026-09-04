package com.dtelco.app

import org.json.JSONObject

/* The operator's own systems, reached through the same functions the website reaches.
 *
 * Nothing here talks to Dengage. The profile is the operator's BSS, the recommendation is the
 * demonstration's own engine, and the relay is the only thing that writes a contact field, because
 * a page cannot write contact fields and neither can an app: a backend does, over REST, from an
 * allowlisted address.
 *
 * The recommendation is asked for rather than recomputed. dtelco-profile?reco=1 returns the same
 * three ids the web engine would choose for this contact, so a person who saw a rail in the
 * browser sees the same three products in the app, with the same rule named. Two engines would
 * mean two answers and a prospect noticing.
 */

data class Line(
  val msisdn: String?,
  val fullName: String?,
  val city: String?,
  val planName: String?,
  val planType: String?,
  val lifecycle: String?,
  val deviceModel: String?,
  val dataCapGb: Double?,
  val dataUsedGb: Double?,
  val dataRatio: Double?,
  val balance: Double?,
  val roamingDays: Int?,
  val contractDays: Int?,
  val linesAtAddress: Int?,
  val planExpiresOn: String?,
)

/* One product, and the rule that chose it. The rule travels with the product because a rail that
   cannot say why it chose something is decoration. */
data class Pick(
  val productId: String,
  val title: String,
  val price: Double,
  val rule: String,
  val why: String?,
) {
  val product: Product? get() = Catalogue.byId(productId)
}

data class ProfileAnswer(
  val knownToOperator: Boolean,
  val line: Line?,
  val picks: List<Pick>,
  val why: String?,
)

object Backend {

  /* One call for the line and the recommendation together. Not an optimisation: it is the
     guarantee that the rail and the numbers on the account screen describe the same moment. */
  fun profile(contactKey: String): ProfileAnswer {
    val body = Http.get("${Config.PROFILE}?key=$contactKey&reco=1")
      ?: return ProfileAnswer(false, null, emptyList(), "the profile function did not answer")
    return try {
      val o = JSONObject(body)
      if (o.has("error")) return ProfileAnswer(false, null, emptyList(), o.optString("error"))

      /* A visitor who has browsed but never had a line is not an error. The function says so
         plainly and this screen repeats it plainly. */
      if (!o.optBoolean("known_to_operator", false)) {
        return ProfileAnswer(false, null, emptyList(), null)
      }

      val line = Line(
        msisdn = o.str("msisdn"),
        fullName = o.str("full_name"),
        city = o.str("city"),
        planName = o.str("plan_name"),
        planType = o.str("plan_type"),
        lifecycle = o.str("lifecycle"),
        deviceModel = o.str("device_model"),
        dataCapGb = o.dbl("data_cap_gb"),
        dataUsedGb = o.dbl("data_used_gb"),
        dataRatio = o.dbl("data_ratio"),
        balance = o.dbl("balance"),
        roamingDays = o.int("roaming_days"),
        contractDays = o.int("contract_days"),
        linesAtAddress = o.int("lines_at_address"),
        planExpiresOn = o.str("plan_expires_on"),
      )

      val arr = o.optJSONArray("recommendations")
      val picks = if (arr == null) emptyList() else (0 until arr.length()).mapNotNull { i ->
        val p = arr.optJSONObject(i) ?: return@mapNotNull null
        Pick(
          productId = p.optString("product_id"),
          title = p.optString("title"),
          price = p.optDouble("price", 0.0),
          rule = p.optString("rule", "popular"),
          why = p.str("why"),
        )
      }
      ProfileAnswer(true, line, picks, null)
    } catch (t: Throwable) {
      ProfileAnswer(false, null, emptyList(), "the profile answer could not be read: ${t.message}")
    }
  }

  /* A lead, stored by the relay BEFORE Dengage is called, with the relay recording what Dengage
     answered on the row. An HTTP 200 cannot tell anybody a contact was created. That row can. */
  fun lead(form: String, contactKey: String, fields: Map<String, Any?>): String? {
    val payload = JSONObject()
    payload.put("form", form)
    payload.put("contact_key", contactKey)
    for ((k, v) in fields) if (v != null) payload.put(k, v)
    val body = Http.post(Config.RELAY, payload.toString()) ?: return "the relay did not answer"
    return try {
      val o = JSONObject(body)
      if (o.has("error")) o.optString("error") else null
    } catch (t: Throwable) { "the relay answer could not be read" }
  }

  /* The demonstration's own message centre, a different thing from the Dengage App Inbox and drawn
     beside it rather than mixed into it. A message this app composed is not a message Dengage
     issued, and a screen that blurred the two would make the exact claim this build exists to
     avoid making. */
  fun ownMessages(contactKey: String): List<Pair<String, String>> {
    val body = Http.get("${Config.MESSAGE}?inbox=$contactKey") ?: return emptyList()
    return try {
      val arr = JSONObject(body).optJSONArray("messages") ?: return emptyList()
      (0 until arr.length()).mapNotNull { i ->
        val m = arr.optJSONObject(i) ?: return@mapNotNull null
        m.optString("title") to m.optString("body")
      }
    } catch (t: Throwable) { emptyList() }
  }
}

/* org.json hands back the string "null" for a JSON null, which reads as a real value and puts the
   word null on a screen. These read it properly, and an unknown number stays unknown rather than
   becoming a zero. */
private fun JSONObject.str(k: String): String? =
  if (isNull(k)) null else optString(k).ifBlank { null }
private fun JSONObject.dbl(k: String): Double? =
  if (isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
private fun JSONObject.int(k: String): Int? = if (isNull(k)) null else optInt(k)
