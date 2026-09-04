package com.dtelco.app.ui

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dtelco.app.*

/* Screen 33. Capability L5: the device subscription record, read back and drawn.
 *
 * Every other screen in this app sends something. This one reads, and it is the screen that
 * answers the questions a demonstration otherwise has to answer with a shrug.
 *
 *   Is this handset bound to the person who signed in, or to the handset?
 *   Is there a token at all, and is it the production one or the sandbox one?
 *   Is the inbox empty, or has the account never had the inbox switched on?
 *   Did the app ask for a permission, or did somebody grant one and the platform keep it?
 *
 * A push that goes nowhere and a push nobody subscribed to look identical from a screen. These
 * values tell them apart, which is the mobile half of what the website's verification console
 * does with channel readiness.
 *
 * It is also the consent screen, and the two belong together. A regulated operator has to be able
 * to show what it holds and what the customer allowed, on the same page, and the switches below
 * write to the device record in Dengage rather than to a preference in this app: somebody who
 * turns notifications off here is off in the platform, not merely off on this handset.
 */
@Composable
fun DeviceScreen(activity: Activity, contactKey: String?, onBack: () -> Unit) {
  var card by remember { mutableStateOf<DengageBridge.DeviceCard?>(null) }
  var switches by remember { mutableStateOf<DengageBridge.AccountSwitches?>(null) }
  var notify by remember { mutableStateOf(DengageBridge.notificationConsentNow()) }
  var track by remember { mutableStateOf(DengageBridge.trackingConsentNow()) }
  var said by remember { mutableStateOf<String?>(null) }
  var partner by remember { mutableStateOf("") }
  var rating by remember { mutableStateOf(8f) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("device")
    DengageBridge.screen(activity, "device")
  }

  /* Read on every entry rather than cached. A token arrives some seconds after a first launch and
     a card that cached the first answer would say "not issued yet" for the rest of the meeting. */
  LaunchedEffect(contactKey, said) {
    card = DengageBridge.deviceCard()
    switches = DengageBridge.accountSwitches()
    notify = DengageBridge.notificationConsentNow()
    track = DengageBridge.trackingConsentNow()
  }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
      TextButton(onClick = onBack) { Text("Back") }
    }
    ScreenTitle("This device", "What Dengage holds about this handset, read back rather than assumed.")

    val c = card
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("The subscription record", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (c == null) {
          Text(
            if (!DengageBridge.live)
              "The SDK is not started, so there is no record to read. " +
                (DengageBridge.lastError ?: "")
            else "The SDK has not built a subscription yet. It does that shortly after the first " +
              "launch, so give it a moment and come back.",
            style = MaterialTheme.typography.bodySmall,
          )
        } else {
          Fact("Contact key", c.contactKey ?: "none, so this is a device rather than a person")
          Fact("Device id", c.deviceId ?: "not issued yet")
          /* Shown as a fingerprint rather than in full. A whole FCM token is several hundred
             characters and unreadable on a phone, and the only question anybody asks of it is
             whether there is one and whether it changed. */
          Fact("Push token", c.token?.let { "${it.take(12)}… (${it.length} characters)" }
            ?: "not issued yet")
          Fact("Token type", c.tokenType ?: "unknown")
          Fact("Notification permission", c.notificationConsent?.toString() ?: "not set")
          Fact("Tracking permission", c.trackingConsent.toString())
          Fact("SDK version", c.sdkVersion ?: "unknown")
          Fact("App version", c.appVersion ?: "unknown")
          c.carrierId?.let { Fact("Carrier", it) }
          Fact("Advertising id", c.advertisingId ?: "not collected")
          Spacer(Modifier.height(8.dp))
          Text(
            "A token binds to the contact key that subscribed, and signing in afterwards does not " +
              "rebind it. That is why the sign in screen asks for notifications after the key is " +
              "set and not before, and it is why a message function has to be able to address a " +
              "device by token as well as a person by key.",
            style = MaterialTheme.typography.bodySmall,
          )
        }
      }
    }

    /* What the account has switched on. Read from Dengage, so an empty inbox and an inbox nobody
       enabled stop looking the same. */
    ScreenTitle("What this account has switched on")
    val s = switches
    if (s == null) {
      Why(
        "Not read yet. The SDK fetches these parameters shortly after start, so this fills in on " +
          "its own. Until it does, nothing below should be read as switched off.",
      )
    } else {
      Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(16.dp)) {
          s.accountName?.let { Fact("Account", it) }
          s.appId?.let { Fact("Application", it) }
          Fact("Events", yesNo(s.events))
          Fact("App Inbox", yesNo(s.inbox))
          Fact("In-app", yesNo(s.inApp))
          Fact("Real time in-app", yesNo(s.realTimeInApp))
          Fact("Geofence", yesNo(s.geofence))
          Fact("App presence", yesNo(s.appTracking))
          s.inAppFetchMinutes?.let { Fact("In-app refresh", "every $it minutes") }
          s.inAppMinSecondsBetween?.let { Fact("Minimum gap between messages", "$it seconds") }
          Fact("In-app list fetched", yesNo(DengageBridge.inAppFetched()))
          Spacer(Modifier.height(8.dp))
          Text(
            "These are the account's answers, not this app's. An inbox that is off here explains " +
              "an empty inbox screen, and no amount of sending will change it.",
            style = MaterialTheme.typography.bodySmall,
          )
        }
      }
    }

    /* Consent. Written to the device record rather than to this app's preferences. */
    ScreenTitle("Consent", "Held on the device record in Dengage, and read back from it.")
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
          Text("Notifications", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
          Switch(
            checked = notify == true,
            enabled = DengageBridge.live,
            onCheckedChange = {
              DengageBridge.notificationConsent(it)
              notify = it
              said = "Notification consent set to $it on the device record."
            },
          )
        }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
          Text("Behaviour tracking", Modifier.weight(1f),
               style = MaterialTheme.typography.bodyMedium)
          Switch(
            checked = track == true,
            enabled = DengageBridge.live,
            onCheckedChange = {
              DengageBridge.trackingConsent(it)
              track = it
              said = "Tracking consent set to $it. Events stop at the SDK rather than at a filter " +
                "somewhere downstream."
            },
          )
        }
        Spacer(Modifier.height(8.dp))
        Text(
          "Turning notifications off here does not revoke the Android permission and turning it " +
            "on does not grant one. They are two different consents, the platform holds one and " +
            "Dengage holds the other, and a person can withdraw the second without touching the " +
            "first. The location permissions live on the Near you screen for the same reason.",
          style = MaterialTheme.typography.bodySmall,
        )
      }
    }

    /* Device tags. The website writes contact tags through the engine's own question form; this
       writes them from code, which is the only way an answer given inside an app reaches a
       segment. */
    ScreenTitle("Tag this handset", "One question, answered in the app, readable as a segment.")
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("How is the network where you are, out of ten?",
             style = MaterialTheme.typography.bodyMedium)
        Slider(value = rating, onValueChange = { rating = it }, valueRange = 1f..10f, steps = 8)
        Text("${rating.toInt()}", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Button(
          enabled = DengageBridge.live,
          onClick = {
            DengageBridge.tags(mapOf(
              "app_network_rating" to rating.toInt().toString(),
              "app_surface" to "android",
            ))
            said = "Tagged. A tag keys on the device, so a segment built on it counts handsets " +
              "that answered rather than people who might have."
          },
        ) { Text("Send the tag") }
      }
    }

    /* App presence, behind a switch and bounded twice: by what the account asks for and by what
       the manifest is allowed to see. */
    ScreenTitle("App presence")
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        val wanted = switches?.appTrackingList.orEmpty()
        Text(
          if (wanted.isEmpty()) "The account has asked for no packages."
          else "The account asks about ${wanted.size}: ${wanted.joinToString(", ")}",
          style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))
        Text(
          "Android 11 hid the installed app list. This app answers only for the packages its " +
            "manifest declares, which are the D·TELCO family and nothing else. A real operator " +
            "declares the partner packages it has a business reason to ask about and no more, " +
            "so the honest answer is always the overlap of the two lists.",
          style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))
        Button(
          enabled = DengageBridge.live && switches?.appTracking == true,
          onClick = {
            DengageBridge.startAppPresence()
            said = "Started, for the account's list. Nothing is read for a package the manifest " +
              "does not declare."
          },
        ) { Text("Check, with consent") }
        if (switches?.appTracking != true) {
          Spacer(Modifier.height(8.dp))
          Why("The account has app presence switched off, so this does nothing and says so.")
        }
      }
    }

    /* The live update. One ongoing notification per order, edited in place by a push rather than
       replaced by a new one at every step. */
    ScreenTitle("Order progress, in one notification")
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Fact("Handler registered", yesNo(DengageBridge.liveUpdateRegistered()))
        Fact("Currently active", yesNo(DengageBridge.liveUpdateActive()))
        DengageBridge.lastLiveUpdate?.let { Fact("Last update received", it) }
        Spacer(Modifier.height(8.dp))
        Text(
          "An order that is packed, then collected, then out for delivery is one thing happening. " +
            "Three notifications about it is three interruptions about one thing. A live update " +
            "push edits the notification already on the lock screen instead.",
          style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))
        OutlinedButton(
          enabled = DengageBridge.live,
          onClick = { said = drawLocally(activity) },
        ) { Text("Preview it") }
        Spacer(Modifier.height(4.dp))
        Why(
          "The preview runs the same handler a live update push calls, so the notification on the " +
            "lock screen is the one the campaign produces. Press it again with a different step " +
            "and the same notification changes.",
        )
      }
    }

    /* An attribution platform's id, so one report can say the install and the purchase belong to
       the same handset. */
    ScreenTitle("Attribution")
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
      Column(Modifier.padding(16.dp)) {
        OutlinedTextField(
          value = partner,
          onValueChange = { partner = it },
          label = { Text("Partner device id") },
          singleLine = true,
          modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        Button(
          enabled = DengageBridge.live && partner.isNotBlank(),
          onClick = {
            DengageBridge.partnerDeviceId(partner.trim())
            said = "Sent. One handset, two systems, one id between them."
          },
        ) { Text("Send it") }
        Spacer(Modifier.height(8.dp))
        Text(
          "An attribution platform gives the handset its own id. Passing it here is what lets one " +
            "report say the install and the purchase belong to the same device. It is a value " +
            "this app is handed rather than one it invents, which is why the field is empty.",
          style = MaterialTheme.typography.bodySmall,
        )
      }
    }

    DengageBridge.lastPushPayload()?.takeIf { it.isNotBlank() }?.let {
      ScreenTitle("The last push this handset opened")
      Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(it, Modifier.padding(12.dp), style = MaterialTheme.typography.labelSmall)
      }
    }

    said?.let { Spacer(Modifier.height(8.dp)); Why(it) }
    DengageBridge.lastError?.let { Why("Last SDK problem: $it") }

    DemoNotice()
  }
}

private fun yesNo(v: Boolean?): String = when (v) {
  true -> "yes"
  false -> "no"
  null -> "not answered yet"
}

/* Posts the notification the live update handler builds. The channel is created here because the
   handler names one and a notification on a channel that does not exist is dropped without an
   error on Android 8 and above, which is the quietest failure on the platform. */
private fun drawLocally(activity: Activity): String {
  val (channelId, channelName, channelDescription) = DengageBridge.liveUpdateChannel()
  val manager = activity.getSystemService(NotificationManager::class.java)
    ?: return "this handset has no notification manager, which should not happen"
  if (android.os.Build.VERSION.SDK_INT >= 26) {
    manager.createNotificationChannel(
      NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
        .apply { description = channelDescription }
    )
  }
  val notification = DengageBridge.drawLiveUpdateLocally(activity, mapOf(
    "title" to "Your D·TELCO order",
    "step" to "Out for delivery",
    "detail" to "Arriving today between 14:00 and 18:00",
    "percent" to "66",
  )) ?: return "the handler returned nothing, so nothing was posted"
  return try {
    androidx.core.app.NotificationManagerCompat.from(activity).notify(4201, notification)
    "Posted. Press the button again after changing the step and the same notification changes " +
      "rather than a second one arriving."
  } catch (t: SecurityException) {
    "Android refused: the notification permission has not been granted on this handset."
  }
}
