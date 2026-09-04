package com.dtelco.app.ui

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.dtelco.app.DengageBridge

/* The two places Dengage draws inside this app's own layout rather than over it.
 *
 * Both are SDK views. Nothing here composes a message, chooses one, or reports one: the content,
 * the targeting and the reporting are all Dengage's, and this file's whole job is to give each
 * view a rectangle and a name. That is the opposite of the recommendation rail, which this app
 * draws itself, and the difference is worth pointing at in the room.
 *
 * Two things had to be decided rather than copied.
 *
 * A WebView inside a vertically scrolling column has no height to measure against, so the slot
 * reserves one rather than letting the view collapse to nothing. It is a fixed number and it is
 * the one thing on this screen a designer would change per slot.
 *
 * A slot with nothing served into it is drawn as a labelled outline rather than as blank space.
 * An empty rectangle reads as a bug; a rectangle that says which property it is reads as a slot
 * waiting for content, which is what it is, and it is also what a presenter points at when
 * explaining where an in-app message would land.
 */

@Composable
fun InlineInAppSlot(
  activity: Activity,
  propertyId: String,
  screenName: String,
  modifier: Modifier = Modifier,
  height: Int = 180,
) = Slot(propertyId, "inline in-app", modifier, height) { ctx ->
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
) = Slot(propertyId, "App Stories", modifier, height) { ctx ->
  DengageBridge.storyRail(ctx)
    ?.also { DengageBridge.showStories(it, activity, propertyId, screenName) }
}

@Composable
private fun Slot(
  propertyId: String,
  kind: String,
  modifier: Modifier,
  height: Int,
  make: (android.content.Context) -> android.view.View?,
) {
  Box(
    modifier
      .fillMaxWidth()
      .height(height.dp)
      .border(1.dp, MaterialTheme.colorScheme.secondaryContainer)
      .background(Color.Transparent),
    contentAlignment = Alignment.Center,
  ) {
    /* Underneath, so anything Dengage draws covers it. */
    Text("$kind slot $propertyId", style = MaterialTheme.typography.labelSmall)
    if (DengageBridge.live) {
      /* factory runs once per composition slot; the show call goes with it, because asking the SDK
         to fill a view it has already filled is a second impression for one appearance. */
      AndroidView(
        factory = { ctx -> make(ctx) ?: android.view.View(ctx) },
        modifier = Modifier.fillMaxSize(),
      )
    }
  }
}
