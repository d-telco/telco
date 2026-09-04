package com.dtelco.app.ui

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.dtelco.app.*
import kotlinx.coroutines.delay

/* Screen 32. Capability L8: a geofence region, defined in the panel, entered by a handset.
 *
 * This is the one thing on any surface in this demonstration that a browser cannot do. Everything
 * else the app proves, the website proves in a different way. A person walking past a shop, or
 * landing at an airport with roaming off, is a moment that exists only because there is an app on
 * the phone, and it is the moment a telco asks about first.
 *
 * The division of labour is the point and it is drawn on the screen.
 *
 *   Dengage holds the circles. An operator adds a store on a Tuesday and every handset picks it up
 *   at the next refresh, with no app release. Nothing below creates a region.
 *   Dengage decides what a person entering one gets, and sends it.
 *   This app starts the tracker, asks for the permissions the platform requires, and draws its own
 *   card beside whatever Dengage sent, exactly as the website's creatives sit beside a campaign.
 *
 * The documented behaviour this screen works within, and says out loud rather than discovering in
 * a meeting: the nearest fifty regions are monitored, the list refreshes about every fifteen
 * minutes, a second signal for the same region inside five minutes is suppressed, and a fix
 * accurate to worse than a kilometre is thrown away.
 */
@Composable
fun NearbyScreen(activity: Activity, contactKey: String?, onBack: () -> Unit) {
  var tracking by remember { mutableStateOf(false) }
  var entered by remember { mutableStateOf<DengageBridge.GeofenceEnter?>(null) }
  var said by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("nearby")
    DengageBridge.screen(activity, "nearby")
    DengageBridge.realTimeInApp(activity, "nearby")
  }

  /* The interceptor fires on whichever thread the SDK is on, so the screen reads the value rather
     than being called back into. One second is well inside the five minute suppression window and
     nowhere near often enough to matter for battery. */
  LaunchedEffect(Unit) {
    while (true) {
      entered = DengageBridge.lastGeofence
      delay(1000)
    }
  }

  val fine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) ==
    PackageManager.PERMISSION_GRANTED
  val background = android.os.Build.VERSION.SDK_INT < 29 ||
    ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
      TextButton(onClick = onBack) { Text("Back") }
    }
    ScreenTitle(
      "Near you",
      "Regions live in the Dengage panel. This screen starts the tracker and shows what came back.",
    )

    Card(Modifier.fillMaxWidth().padding(16.dp)) {
      Column(Modifier.padding(16.dp)) {
        Text("Permissions", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Fact("Precise location", if (fine) "granted" else "not granted")
        Fact("While closed", if (background) "granted" else "not granted")
        Spacer(Modifier.height(8.dp))
        Text(
          "Background location is what makes a region worth having. Without it a person only " +
            "enters a store's circle while the app is already open, which is the one moment they " +
            "did not need telling about the store. Android 10 and above refuses to grant it in " +
            "the same dialog as the other two, so the SDK asks in the order the platform requires.",
          style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(enabled = DengageBridge.live,
                 onClick = { DengageBridge.askForLocation(activity) }) { Text("Ask") }
          Button(
            enabled = DengageBridge.live && fine,
            onClick = { DengageBridge.startGeofence(); tracking = true },
          ) { Text("Start tracking") }
          OutlinedButton(
            enabled = DengageBridge.live && tracking,
            onClick = { DengageBridge.stopGeofence(); tracking = false },
          ) { Text("Stop") }
        }
        if (!DengageBridge.live) {
          Spacer(Modifier.height(8.dp))
          Why("The SDK is not started, so nothing here tracks anything.")
        }
      }
    }

    /* What the SDK reported, drawn by this app. The message a prospect sees arrive on the handset
       is Dengage's; this card is the proof of what the region actually was. */
    ScreenTitle("The last region entered")
    val e = entered
    if (e == null) {
      Why(
        "Nothing yet. Either no region has been entered, or the account has no regions in it. " +
          "Both are worth saying: an empty answer here is not a failure, and the device screen " +
          "reports whether the account has the geofence feature switched on at all.",
      )
    } else {
      Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(16.dp)) {
          Text(e.geofenceItemName ?: "Region ${e.geofenceItemId}",
               style = MaterialTheme.typography.titleMedium)
          Spacer(Modifier.height(8.dp))
          e.clusterName?.let { Fact("Cluster", it) }
          Fact("Centre", "${e.latitude}, ${e.longitude}")
          Fact("Radius", "${e.radius.toInt()} m")
          Fact("Region id", "${e.geofenceItemId}")
          Spacer(Modifier.height(8.dp))
          Text(
            "Dengage raised this and decides what to send for it. The card is drawn here so the " +
              "room can see the region as well as the message.",
            style = MaterialTheme.typography.bodySmall,
          )
        }
      }
    }

    /* The check in, which is a different moment from entering a circle and is why it is a separate
       row rather than a second reading of the same one. Walking past a shop is something the
       network noticed. Saying "I am here, show my collection code" is something the customer did,
       and only the second one should start a collect in store journey. */
    val here = entered?.geofenceItemName
    if (contactKey != null) {
      Button(
        modifier = Modifier.padding(16.dp),
        enabled = DengageBridge.live,
        onClick = {
          DengageBridge.contactEvent(contactKey, "store_checkin",
            mapOf("store_name" to here, "geofence_id" to entered?.geofenceItemId))
          said = "Checked in. That row is keyed to $contactKey rather than to this handset, so it " +
            "still reads correctly after a sign out."
        },
      ) { Text("Check in at this store") }
      said?.let { Why(it) }
    } else {
      Why("Sign in on the Account tab to check in. A check in belongs to a person, not a handset.")
    }

    ScreenTitle(
      "The places the panel's regions are set to",
      "Seven regions, six shops and an airport. The coordinates are the published city centres; " +
        "the shops at them are demo data like everything else nobody published.",
    )

    for (store in Stores.regions) {
      Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
          Text(store.name, style = MaterialTheme.typography.titleSmall)
          Text("${store.city} · ${store.latitude}, ${store.longitude} · ${store.radiusMeters} m",
               style = MaterialTheme.typography.labelSmall)
          Spacer(Modifier.height(4.dp))
          Text(store.note, style = MaterialTheme.typography.bodySmall)
          Spacer(Modifier.height(8.dp))
          /* Handing the SDK a fix, which is what a meeting room needs and what the SDK has an
             entry point for. GeofenceLocationSource carries a MOCK_LOCATION value, so a fix that
             did not come from the handset's radios reaches Dengage labelled as exactly that rather
             than dressed up as a real one. Walking there takes the same road. */
          OutlinedButton(
            enabled = DengageBridge.live,
            onClick = {
              DengageBridge.standAt(activity, store.latitude, store.longitude, store.id)
              DengageBridge.city(store.city)
              said = "Handed the SDK a fix at ${store.name}, reported as a mock location. If the " +
                "account has a region there, the signal follows."
            },
          ) { Text("Stand here") }
        }
      }
    }

    Why(
      "Two ways to reach the same place. The button above hands the SDK a fix through its own " +
        "entry point, labelled a mock location, which is what a demonstration indoors needs. " +
        "Walking to the shop, or moving the handset with the emulator's location control, goes " +
        "through the handset's radios instead and everything after that is identical.",
    )

    DemoNotice()
  }
}
