package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dengage.sdk.domain.inboxmessage.model.InboxMessage
import com.dtelco.app.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/* Screen 29. Capability F11: the Dengage App Inbox rendered natively and reported back.
 *
 * Two lists, drawn one above the other and never merged into one.
 *
 * The top list is Dengage's. Messages a campaign or a journey saved to the inbox, read through the
 * SDK, and marked read only when a person taps one. The standing rule cuts both ways: an
 * impression is never reported for a message Dengage did not issue, and a message Dengage did
 * issue is marked read only when a hand did it.
 *
 * The bottom list is this demonstration's own message centre, the same one the website's drawer
 * shows. It exists because the App Inbox fills from campaigns and journeys and never from a
 * transactional send, so the same-second confirmation has to live somewhere else. Showing them
 * side by side and labelling each is the honest version of that, and the version that survives a
 * prospect asking which is which.
 */
@Composable
fun InboxScreen(activity: Activity, contactKey: String?) {
  var dengageMessages by remember { mutableStateOf<List<InboxMessage>>(emptyList()) }
  var dengageProblem by remember { mutableStateOf<String?>(null) }
  var ours by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
  var loaded by remember { mutableStateOf(false) }

  LaunchedEffect(Unit) {
    DengageBridge.pageView("inbox")
    DengageBridge.screen(activity, "inbox")
  }

  LaunchedEffect(contactKey) {
    DengageBridge.inbox { messages, error ->
      dengageMessages = messages
      dengageProblem = error
      loaded = true
    }
    contactKey?.let { k -> ours = withContext(Dispatchers.IO) { Backend.ownMessages(k) } }
  }

  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    ScreenTitle("Messages", "Two lists, kept apart on purpose.")

    Text("From Dengage", Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
    Why(
      "Saved to the inbox by a campaign or a journey. A transactional send never appears here, " +
        "which is how the channel is designed rather than anything this app decides."
    )

    when {
      !loaded -> Box(Modifier.padding(16.dp)) { CircularProgressIndicator() }
      dengageProblem != null -> Why("Nothing was read: $dengageProblem")
      dengageMessages.isEmpty() -> Why(
        "Empty, and that is a real answer rather than a failure. Two things fill this list and " +
          "both are set in the panel: the account is enabled for App Inbox, and the push content " +
          "has Save To Inbox switched on with an expiry date."
      )
      else -> for (m in dengageMessages) DengageMessageCard(m)
    }

    HorizontalDivider(Modifier.padding(16.dp))

    Text("From D·TELCO", Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium)
    Why(
      "This app's own message centre, the same one the website's drawer shows. It answers in the " +
        "same second, which is what a confirmation needs and what a campaign inbox is not for."
    )
    if (contactKey == null) {
      Why("Sign in on the Account tab to see this person's messages.")
    } else if (ours.isEmpty()) {
      Why("Nothing yet. Place an order or fire an operator signal from the website's console.")
    } else {
      for ((title, body) in ours) {
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
          Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(body, style = MaterialTheme.typography.bodySmall)
          }
        }
      }
    }

    DemoNotice()
  }
}

@Composable
private fun DengageMessageCard(m: InboxMessage) {
  var read by remember(m.id) { mutableStateOf(m.isClicked) }
  Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
    Column(Modifier.padding(12.dp)) {
      Text(m.data.title ?: "", style = MaterialTheme.typography.titleSmall)
      Spacer(Modifier.height(4.dp))
      Text(m.data.message ?: "", style = MaterialTheme.typography.bodySmall)
      Spacer(Modifier.height(8.dp))
      /* receiveDate arrives as UTC and the SDK guide says an app displaying it must convert. This
         one prints it as Dengage sent it and says so, because a wrong local time on a screen is
         worse than an honest UTC stamp. */
      m.data.receiveDate?.let {
        Text("received $it UTC", style = MaterialTheme.typography.labelSmall)
      }
      Spacer(Modifier.height(8.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!read) {
          TextButton(onClick = {
            /* Reported because a person just pressed it. Nothing on this screen reports an open
               for a message nobody touched. */
            DengageBridge.inboxOpened(m.id)
            read = true
          }) { Text("Open") }
        } else {
          Text("Read", style = MaterialTheme.typography.labelSmall)
        }
        TextButton(onClick = { DengageBridge.inboxDeleted(m.id) }) { Text("Delete") }
      }
    }
  }
}
