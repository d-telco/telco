package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.dtelco.app.DengageBridge

/* The two places the platform draws inside this app's own layout rather than over it.
 *
 * Both are SDK views. Nothing here composes a message, chooses one, or reports one: the content,
 * the targeting and the reporting all belong to the campaign, and this file's whole job is to give
 * each view a rectangle.
 *
 * Two things had to be decided rather than copied.
 *
 * A WebView inside a vertically scrolling column has no height to measure against, so the slot
 * reserves one rather than letting the view collapse to nothing. It is a fixed number and it is
 * the one thing on this screen a designer would change per slot.
 *
 * A slot draws nothing at all until the account has in-app switched on. It used to draw a labelled
 * outline naming its property id, which is exactly the sort of thing a customer should never read
 * on a shopping screen, and which left four empty boxes on the surfaces a prospect browses. The
 * device screen lists the four property ids and whether the account has answered, because that is
 * where somebody is asking that question.
 */

@Composable
fun InlineInAppSlot(
  activity: Activity,
  propertyId: String,
  screenName: String,
  modifier: Modifier = Modifier,
  height: Int = 180,
) = Slot(modifier, height) { ctx ->
  DengageBridge.inlineSlot(ctx)
    ?.also { DengageBridge.showInline(it, activity, propertyId, screenName) }
}

@Composable
fun StoryRail(
  activity: Activity,
  propertyId: String,
  screenName: String,
  modifier: Modifier = Modifier,
  height: Int = 120,
) = Slot(modifier, height) { ctx ->
  DengageBridge.storyRail(ctx)
    ?.also { DengageBridge.showStories(it, activity, propertyId, screenName) }
}

@Composable
private fun Slot(
  modifier: Modifier,
  height: Int,
  make: (android.content.Context) -> android.view.View?,
) {
  /* Read once per composition rather than on every frame: the account's answer arrives shortly
     after start and does not change again while the app is open. */
  val enabled = remember { DengageBridge.inAppEnabled() }
  if (!enabled) return

  Box(modifier.fillMaxWidth().height(height.dp)) {
    /* factory runs once per composition slot; the show call goes with it, because asking the SDK
       to fill a view it has already filled is a second impression for one appearance. */
    AndroidView(
      factory = { ctx -> make(ctx) ?: android.view.View(ctx) },
      modifier = Modifier.fillMaxSize(),
    )
  }
}
