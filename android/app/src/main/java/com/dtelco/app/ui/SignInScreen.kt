package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dtelco.app.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/* Screen 26. Capability A2: the same contact key, so the web session and the app session land on
 * one profile.
 *
 * This is the screen that answers the question a prospect asks first. They browsed on the phone's
 * browser, then opened the app. Are those the same person to your platform, or two? Sign in as the
 * key the browser is using and the account below fills with the line that browser has been
 * building all along.
 */
@Composable
fun SignInScreen(activity: Activity, contactKey: String?, onContactKey: (String?) -> Unit) {
  var typed by remember { mutableStateOf(contactKey ?: Identity.PREFIX) }
  var refused by remember { mutableStateOf<String?>(null) }
  var answer by remember { mutableStateOf<ProfileAnswer?>(null) }
  var busy by remember { mutableStateOf(false) }

  /* Fired first, before the screen does anything else. */
  LaunchedEffect(Unit) {
    DengageBridge.pageView("account")
    DengageBridge.screen(activity, "account")
  }

  LaunchedEffect(contactKey) {
    val k = contactKey ?: return@LaunchedEffect
    busy = true
    answer = withContext(Dispatchers.IO) { Backend.profile(k) }
    busy = false
  }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    ScreenTitle(
      "Your account",
      "One contact key, two surfaces. Sign in with the key the browser is using and this is the " +
        "same person to Dengage.",
    )

    OutlinedTextField(
      value = typed,
      onValueChange = { typed = it; refused = null },
      label = { Text("Contact key") },
      singleLine = true,
      modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    )

    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = {
        /* Validated before it is passed on. setContactKey does not fail on an unknown key, it
           creates that contact, so a typo here would mint a permanent junk contact. */
        val ok = Identity.set(activity, typed.trim())
        if (ok == null) {
          refused = "That is not a contact key this operator issues. The shape is DPS- followed " +
            "by up to 44 letters, digits, underscores or hyphens, and a key that does not match " +
            "is refused here rather than creating a contact nobody wanted."
        } else {
          refused = null
          onContactKey(ok)
        }
      }) { Text("Sign in") }

      OutlinedButton(onClick = {
        Identity.clear(activity)
        onContactKey(null)
        answer = null
      }) { Text("Sign out") }

      OutlinedButton(onClick = {
        onContactKey(Identity.claim(activity))
      }) { Text("Use this device") }
    }

    refused?.let { Why(it) }

    /* Push permission belongs on this screen because it is the screen where a person has just said
       who they are, and a token binds to the key that subscribed. Asking before the key is set
       binds the token to nobody. */
    Card(Modifier.fillMaxWidth().padding(16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("Notifications", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(
          "A device token binds to the contact key that subscribed. Signing in first and asking " +
            "second is the order that makes a push reach this person rather than this handset.",
          style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))
        Button(
          enabled = DengageBridge.live,
          onClick = { DengageBridge.askForNotifications(activity) },
        ) { Text("Allow notifications") }
        Spacer(Modifier.height(8.dp))
        Text(
          if (!DengageBridge.live)
            "The SDK is not started, so nothing here subscribes. " +
              (DengageBridge.lastError ?: "")
          else "Token: " + (DengageBridge.token() ?: "not issued yet"),
          style = MaterialTheme.typography.labelSmall,
        )
      }
    }

    when {
      busy -> Box(Modifier.fillMaxWidth().padding(24.dp)) { CircularProgressIndicator() }
      contactKey == null -> Why(
        "Nobody is signed in. The app still fires its page views and still has a device, which " +
          "is exactly the anonymous state the website has before somebody identifies themselves."
      )
      answer?.knownToOperator == false -> Why(
        "$contactKey is a real contact and has no line with this operator. That is not an error: " +
          "somebody who registered on the website has a profile and no subscription until one is " +
          "created. The website's operator console can give this key a line."
      )
      answer?.line != null -> LineCard(answer!!.line!!)
      answer?.why != null -> Why(answer!!.why!!)
    }

    DemoNotice()
  }
}

@Composable
private fun LineCard(line: Line) {
  Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
    Column(Modifier.padding(16.dp)) {
      Text(line.fullName ?: "Your line", style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(8.dp))
      /* Unknown values are omitted rather than printed as zero. A zero is a measurement. */
      line.msisdn?.let { Fact("Number", it) }
      line.planName?.let { Fact("Plan", it + (line.planType?.let { t -> " ($t)" } ?: "")) }
      line.dataRatio?.let { Fact("Data used", "${(it * 100).toInt()} percent") }
      if (line.dataUsedGb != null && line.dataCapGb != null) {
        Fact("Allowance", "${line.dataUsedGb} of ${line.dataCapGb} GB")
      }
      line.balance?.let { Fact("Balance", money(it)) }
      line.contractDays?.let { Fact("Contract ends in", "$it days") }
      line.roamingDays?.takeIf { it > 0 }?.let { Fact("Roaming days this period", "$it") }
      line.linesAtAddress?.takeIf { it > 1 }?.let { Fact("Lines at this address", "$it") }
      line.city?.let { Fact("City", it) }
    }
  }
}

@Composable
private fun Fact(label: String, value: String) {
  Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
    Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
    Text(value, style = MaterialTheme.typography.bodyMedium)
  }
}
