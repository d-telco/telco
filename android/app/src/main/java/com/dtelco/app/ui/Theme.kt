package com.dtelco.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dtelco.app.Config

/* The D·TELCO palette and mark. Deliberately one palette rather than a theme system: this
 * app is shown next to the website in the same meeting, and the two have to look like one brand.
 */
private val Ink = Color(0xFF0B1B33)
private val Blue = Color(0xFF0A5CD8)
private val Sky = Color(0xFFE8F0FE)
private val Paper = Color(0xFFF7F8FA)

@Composable
fun DtelcoTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = lightColorScheme(
      primary = Blue,
      onPrimary = Color.White,
      surface = Color.White,
      onSurface = Ink,
      background = Paper,
      onBackground = Ink,
      secondaryContainer = Sky,
      onSecondaryContainer = Ink,
    ),
    content = content,
  )
}

@Composable
fun Loading() = Box(Modifier.fillMaxSize(), Alignment.Center) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    CircularProgressIndicator()
    Spacer(Modifier.height(12.dp))
    Text("Reading the catalogue", style = MaterialTheme.typography.bodyMedium)
  }
}

/* A problem is stated, never swallowed. A screen that fails quietly during a demonstration is a
   screen that fails loudly during the questions afterwards. */
@Composable
fun Problem(text: String) = Box(Modifier.fillMaxSize().padding(24.dp), Alignment.Center) {
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Text("That did not work", style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
    Text(text, style = MaterialTheme.typography.bodySmall)
  }
}

@Composable
fun ScreenTitle(title: String, subtitle: String? = null) {
  Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
    Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold)
    if (subtitle != null) {
      Spacer(Modifier.height(4.dp))
      Text(subtitle, style = MaterialTheme.typography.bodySmall)
    }
  }
}

/* Said on every screen, because non negotiable 7 says every figure nobody published is a plausible
   demo figure and is marked as one. */
@Composable
fun DemoNotice() = Text(
  Config.DEMO_NOTICE,
  style = MaterialTheme.typography.labelSmall,
  modifier = Modifier.padding(16.dp),
)

/* A labelled value, used on every screen that reads something back. Unknown values are omitted by
   the caller rather than printed as zero, which is the standing rule everywhere in this build: a
   zero is a measurement and a missing value is not. */
@Composable
fun Fact(label: String, value: String) {
  Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
    Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
    Text(value, style = MaterialTheme.typography.bodyMedium)
  }
}

@Composable
fun Why(text: String) = Text(
  text,
  style = MaterialTheme.typography.bodySmall,
  modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
)

fun money(v: Double): String = Config.CURRENCY_SYMBOL + String.format("%.2f", v)
