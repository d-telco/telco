package com.dtelco.app.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.dtelco.app.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/* The app's answer to js/creatives.js gamification: the spin wheel, the scratch card and the
 * countdown, drawn natively rather than served, so the app has in app the same three experiences
 * the site has on site.
 *
 * This is not a screen and the file is not named *Screen.kt on purpose. On the web these are
 * creatives the engine draws onto whatever page the visitor is on, not a page of their own; here
 * they are composables drawn onto Home, Shop and Discover, so they carry no page view and add no
 * row to the capability map's screen list. The screens they sit on fire the page view.
 *
 * Three honesty rules hold them together, the same three the site's stand ins hold to, because a
 * prospect who saw the site must see the app tell the identical truth:
 *
 *   The surface is this app's, and each one says so on its face: the panel's Gamification template
 *   takes the surface over when it is enabled, which is confirm item 21 in ACCOUNT-SETUP.md.
 *
 *   The coupon list is the account's, read live at the moment of the win through dtelco-coupons,
 *   so the card quotes the list as it stands rather than a number typed here.
 *
 *   No surface but the platform's own ever shows a code. Measured: the API masks codes on read and
 *   offers no assignment call, so a full code exists only inside the message the platform sends,
 *   where it is also marked taken. This file records the win and reads the list, and never mints,
 *   holds or shows a code.
 *
 * The reporting is the site's too. Every appearance writes a creative_shown row and every win
 * writes a creative_action row, both through DengageBridge into dtelco_events, so a self drawn
 * experience on the handset reports exactly what an engine served one reports. Nothing here imports
 * the SDK: one module talks to it, and that module is DengageBridge.
 */

private data class WheelSeg(val face: String, val label: String, val coupon: Boolean, val color: Color)

/* Six wedges, the same set the site's wheel carries: a short face drawn on the wedge, the full
   prize the result spells out, and whether a coupon backs it. Try again is a wedge like any other
   so the wheel can land on nothing, which is what makes landing on something worth a confetti. */
private val WHEEL = listOf(
  WheelSeg("$5 OFF", "5 dollars off", true, Color(0xFFE4002B)),
  WheelSeg("10% ACC", "10 percent off accessories", true, Color(0xFF14161A)),
  WheelSeg("FREE\nSHIP", "Free shipping", true, Color(0xFFFF6B00)),
  WheelSeg("2X DATA", "Double data for a month", false, Color(0xFF00A878)),
  WheelSeg("TRY\nAGAIN", "Try again", false, Color(0xFF5A6270)),
  WheelSeg("$10 OFF", "10 dollars off a device", true, Color(0xFF8338EC)),
)

private const val STAND_IN =
  "The app draws this stand in. The panel's Gamification template takes the surface over when it " +
    "is enabled."

private val CONFETTI = listOf(
  Color(0xFFE4002B), Color(0xFFFF6B00), Color(0xFFFFC300),
  Color(0xFF00A878), Color(0xFF3A86FF), Color(0xFF8338EC),
)

/* creative_shown and creative_action, the same two rows the site's engine writes, so an impression
   and an action from this handset land in dtelco_events beside the ones a browser wrote. The bridge
   adds the source and the event type; the placement and the rule travel as fields. */
private fun reportShown(rule: String, placement: String) =
  DengageBridge.custom("creative_shown", mapOf("rule" to rule, "placement" to placement))

private fun reportWin(rule: String, placement: String, prize: String) =
  DengageBridge.custom("creative_action", mapOf("rule" to rule, "placement" to placement, "note" to "win: $prize"))

/* Whether the handset has animations switched off. The site respects prefers-reduced-motion; the
   handset's equivalent is the animator duration scale, and zero means a person asked for no motion.
   The wheel then jumps to its result and the confetti does not run. */
private fun motionOff(context: android.content.Context): Boolean =
  try { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
  catch (t: Throwable) { false }

@Composable
private fun Kicker(text: String) =
  Text(text.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)

/* ------------------------------------------------------------------ the win */

/* One win, three records, exactly as gameResult does on the site: the creative_action row above,
   the dtelco-games row here, and the live coupon list the card shows. Never a code. A win reaches
   this only for a prize worth having, so the arrival is celebrated. */
@Composable
private fun WinResult(game: String, placement: String, prize: String, couponBacked: Boolean) {
  val context = LocalContext.current
  var winId by remember { mutableStateOf<String?>(null) }
  var list by remember { mutableStateOf<CouponList?>(null) }
  var settled by remember { mutableStateOf(false) }

  LaunchedEffect(prize) {
    reportWin(game, placement, prize)
    val key = Identity.get(context) ?: Identity.claim(context)
    winId = withContext(Dispatchers.IO) { Games.recordWin(key, game, placement, prize) }
    if (couponBacked) list = withContext(Dispatchers.IO) { Games.couponList() }
    settled = true
  }

  Box(Modifier.fillMaxWidth()) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
      Text(prize, style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(6.dp))
      if (couponBacked) {
        val l = list
        Text(
          if (l != null && l.name != null)
            "${l.name}, read live from the account: ${l.available} of ${l.total} codes waiting. " +
              "Your code arrives inside the message the platform sends and is marked taken at that " +
              "moment: the API masks codes on read, so no surface but the platform's own ever shows one."
          else if (settled)
            "The coupon list could not be read just now. Your code still arrives inside the message " +
              "the platform sends, where it is marked taken: no surface but the platform's own shows one."
          else "Reading the coupon list from the account...",
          style = MaterialTheme.typography.bodySmall,
        )
      } else {
        Text("Recorded against your line as a demonstration reward.",
             style = MaterialTheme.typography.bodySmall)
      }
      Spacer(Modifier.height(6.dp))
      Text(
        "The win is on record: a creative action row in the platform's event table" +
          (winId?.let { ", and dtelco-games row $it" } ?: "") + ".",
        style = MaterialTheme.typography.labelSmall,
      )
    }
    /* The confetti sits over the whole card and clears itself. A prize is the only path here, so it
       always fires unless the handset asked for no motion. matchParentSize keeps it to the card's
       own bounds, which is why it is passed in from here where the Box scope has it. */
    if (!motionOff(context)) Confetti(Modifier.matchParentSize())
  }
}

@Composable
private fun Confetti(modifier: Modifier = Modifier) {
  data class Bit(val x0: Float, val vx: Float, val vy: Float, val w: Float, val h: Float,
                 val rot0: Float, val vr: Float, val color: Color)
  val bits = remember {
    List(44) {
      Bit(
        x0 = 0.5f + (Random.nextFloat() - 0.5f) * 0.3f,
        vx = (Random.nextFloat() - 0.5f) * 1.8f,
        vy = -1.2f - Random.nextFloat() * 1.6f,
        w = 6f + Random.nextFloat() * 6f,
        h = 8f + Random.nextFloat() * 7f,
        rot0 = Random.nextFloat() * 6.28f,
        vr = (Random.nextFloat() - 0.5f) * 6f,
        color = CONFETTI[it % CONFETTI.size],
      )
    }
  }
  val t = remember { Animatable(0f) }
  LaunchedEffect(Unit) { t.animateTo(1f, tween(1500, easing = LinearEasing)) }
  Canvas(modifier) {
    val p = t.value
    val time = p * 26f
    for (b in bits) {
      val x = b.x0 * size.width + b.vx * time * 6f
      val y = size.height * 0.15f + (b.vy * time + 0.5f * 0.6f * time * time) * 6f
      if (y > size.height + 20f) continue
      val alpha = (1f - p).coerceIn(0f, 1f)
      rotate(degrees = b.rot0 * 57.3f + b.vr * time, pivot = Offset(x, y)) {
        drawRect(
          color = b.color.copy(alpha = alpha),
          topLeft = Offset(x - b.w / 2f, y - b.h / 2f),
          size = androidx.compose.ui.geometry.Size(b.w, b.h),
        )
      }
    }
  }
}

/* ------------------------------------------------------------------ spin the wheel */

/* The wheel, fired at the telco moment gamification earns on a handset: a completed purchase, which
   is the app's recharge and win. A popup over the screen, the same placement the site uses. */
@Composable
fun SpinWheelDialog(onDismiss: () -> Unit) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val rotation = remember { Animatable(0f) }
  var spinning by remember { mutableStateOf(false) }
  var landed by remember { mutableStateOf<Int?>(null) }

  LaunchedEffect(Unit) { reportShown("spin_wheel", "popup") }

  Dialog(onDismissRequest = onDismiss) {
    Card {
      Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Kicker("Recharge and win")
        Text("Spin for your reward", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Box(contentAlignment = Alignment.TopCenter) {
          WheelDisc(rotation.value, Modifier.size(240.dp))
          /* The pointer, drawn over the wheel and never rotating with it, so the wedge under its
             tip is the result. */
          Canvas(Modifier.size(width = 22.dp, height = 20.dp)) {
            val p = Path().apply {
              moveTo(size.width / 2f, size.height); lineTo(0f, 0f); lineTo(size.width, 0f); close()
            }
            drawPath(p, Color(0xFF14161A))
          }
        }
        Spacer(Modifier.height(16.dp))

        val idx = landed
        if (idx == null) {
          Button(
            enabled = !spinning,
            onClick = {
              spinning = true
              val target = Random.nextInt(WHEEL.size)
              val seg = 360f / WHEEL.size
              /* Five full turns on top of where it rests, plus the offset that brings this wedge's
                 middle under the pointer, plus a jitter inside the wedge so two spins never stop at
                 the identical pixel. Cumulative, so it never jumps backwards. */
              val jitter = (Random.nextFloat() - 0.5f) * (seg - 14f)
              val landing = (360f - (target * seg + seg / 2f)) - jitter
              val cur = rotation.value
              val next = cur + 5 * 360f + (((landing - (cur % 360f)) % 360f + 360f) % 360f)
              if (motionOff(context)) {
                landed = target; spinning = false
              } else scope.launch {
                rotation.animateTo(next, tween(4200, easing = CubicBezierEasing(0.15f, 0.85f, 0.25f, 1f)))
                spinning = false
                landed = target
              }
            },
          ) { Text(if (spinning) "Spinning..." else "Spin the wheel") }
        } else {
          val seg = WHEEL[idx]
          if (!seg.coupon && seg.label == "Try again") {
            /* Reported once for this landing, not on every recomposition, which is why it sits in an
               effect keyed to the wedge rather than in the body. A try again is an action too. */
            LaunchedEffect(idx) { reportWin("spin_wheel", "popup", "try again") }
            Text("So close", style = MaterialTheme.typography.titleMedium)
            Text("The wheel landed on Try again. Give it another spin.",
                 style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Button(onClick = { landed = null }) { Text("Spin again") }
          } else {
            WinResult("spin_wheel", "popup", seg.label, seg.coupon)
          }
        }

        Spacer(Modifier.height(12.dp))
        Text(STAND_IN, style = MaterialTheme.typography.labelSmall)
      }
    }
  }
}

@Composable
private fun WheelDisc(angle: Float, modifier: Modifier = Modifier) {
  Canvas(modifier.graphicsLayer { rotationZ = angle }) {
    val n = WHEEL.size
    val seg = 360f / n
    val d = size.minDimension
    val r = d / 2f
    val topLeft = Offset((size.width - d) / 2f, (size.height - d) / 2f)
    val arc = androidx.compose.ui.geometry.Size(d, d)
    /* drawArc measures zero degrees at three o'clock and sweeps clockwise, so the top is minus
       ninety. Wedge i then spans the same clockwise slice from the top the site's SVG draws. */
    for (i in 0 until n) {
      drawArc(color = WHEEL[i].color, startAngle = -90f + i * seg, sweepAngle = seg,
              useCenter = true, topLeft = topLeft, size = arc)
      val edge = Math.toRadians((-90f + i * seg).toDouble())
      drawLine(Color.White, center,
               Offset(center.x + (r * cos(edge)).toFloat(), center.y + (r * sin(edge)).toFloat()),
               strokeWidth = 2f)
    }
    /* The wedge faces, baked into the rotating canvas so they turn with the disc, drawn radially and
       flipped on the left half so none reads upside down. */
    drawIntoCanvas { canvas ->
      val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.WHITE
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = r * 0.12f
        isAntiAlias = true
        isFakeBoldText = true
      }
      for (i in 0 until n) {
        val mid = -90f + i * seg + seg / 2f
        val rad = Math.toRadians(mid.toDouble())
        val lr = r * 0.62f
        val lx = (center.x + lr * cos(rad)).toFloat()
        val ly = (center.y + lr * sin(rad)).toFloat()
        canvas.nativeCanvas.save()
        var rot = mid + 90f
        if (mid > 90f && mid < 270f) rot += 180f
        canvas.nativeCanvas.rotate(rot, lx, ly)
        val lines = WHEEL[i].face.split("\n")
        val lh = paint.textSize * 1.05f
        val startY = ly - (lines.size - 1) * lh / 2f + paint.textSize / 3f
        for (k in lines.indices) canvas.nativeCanvas.drawText(lines[k], lx, startY + k * lh, paint)
        canvas.nativeCanvas.restore()
      }
    }
    drawCircle(Color.White, radius = r * 0.16f, center = center)
    drawCircle(Color(0xFFE4002B), radius = r * 0.05f, center = center)
  }
}

/* ------------------------------------------------------------------ scratch card */

/* The scratch card, offered as a reward on Discover, the app's surface for things worth a look. A
   foil covers the prize; a finger wears it away and, once enough is gone, it clears. */
@Composable
fun ScratchCardDialog(onDismiss: () -> Unit) {
  var revealed by remember { mutableStateOf(false) }
  LaunchedEffect(Unit) { reportShown("scratch_card", "popup") }

  Dialog(onDismissRequest = onDismiss) {
    Card {
      Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Kicker("Thank you for the feedback")
        Text("Scratch to reveal your reward", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(14.dp))
        Box(
          Modifier.fillMaxWidth().height(120.dp),
          contentAlignment = Alignment.Center,
        ) {
          /* The prize sits underneath, drawn first, so the foil clearing reveals it rather than
             the card redrawing. */
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("10% off", fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text("accessories", style = MaterialTheme.typography.bodySmall)
          }
          if (!revealed) ScratchFoil { revealed = true }
        }
        Spacer(Modifier.height(12.dp))
        if (!revealed) {
          Button(onClick = { revealed = true }) { Text("Reveal it for me") }
        } else {
          WinResult("scratch_card", "popup", "10 percent off accessories", true)
        }
        Spacer(Modifier.height(12.dp))
        Text(STAND_IN, style = MaterialTheme.typography.labelSmall)
      }
    }
  }
}

@Composable
private fun ScratchFoil(onRevealed: () -> Unit) {
  val scope = rememberCoroutineScope()
  val cols = 28
  val rows = 12
  val touched = remember { BooleanArray(cols * rows) }
  val erase = remember { Path() }
  var version by remember { mutableStateOf(0) }
  var done by remember { mutableStateOf(false) }
  val alpha = remember { Animatable(1f) }

  Canvas(
    Modifier
      .fillMaxSize()
      .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen; this.alpha = alpha.value }
      .pointerInput(Unit) {
        fun mark(o: Offset) {
          val cx = (o.x / size.width * cols).toInt().coerceIn(0, cols - 1)
          val cy = (o.y / size.height * rows).toInt().coerceIn(0, rows - 1)
          for (dx in -1..1) for (dy in -1..1) {
            val gx = cx + dx; val gy = cy + dy
            if (gx in 0 until cols && gy in 0 until rows) touched[gy * cols + gx] = true
          }
          if (!done && touched.count { it }.toFloat() / touched.size > 0.42f) {
            done = true
            scope.launch { alpha.animateTo(0f, tween(350)); onRevealed() }
          }
        }
        detectDragGestures(
          onDragStart = { o -> erase.moveTo(o.x, o.y); mark(o); version++ },
          onDrag = { change, _ -> val o = change.position; erase.lineTo(o.x, o.y); mark(o); version++ },
        )
      },
  ) {
    version // read so the canvas redraws as the erase path grows
    drawRect(
      brush = Brush.linearGradient(
        listOf(Color(0xFFC3C8D2), Color(0xFFD9DDE4), Color(0xFFB9BEC9)),
      ),
    )
    drawIntoCanvas { canvas ->
      val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.parseColor("#5A6270")
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = 34f
        isAntiAlias = true
        isFakeBoldText = true
      }
      canvas.nativeCanvas.drawText("Scratch to reveal", size.width / 2f, size.height / 2f + 12f, paint)
    }
    /* The strokes punch holes rather than paint over, so the prize below shows through. Clear needs
       the layer to render offscreen, which the graphicsLayer above arranges. */
    drawPath(erase, color = Color.Transparent,
             style = Stroke(width = 58f, cap = androidx.compose.ui.graphics.StrokeCap.Round,
                            join = androidx.compose.ui.graphics.StrokeJoin.Round),
             blendMode = BlendMode.Clear)
  }
}

/* ------------------------------------------------------------------ countdown */

private fun secondsToDayEnd(): Long {
  val now = Calendar.getInstance()
  val end = Calendar.getInstance().apply {
    add(Calendar.DAY_OF_YEAR, 1)
    set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
  }
  return ((end.timeInMillis - now.timeInMillis) / 1000L).coerceAtLeast(0L)
}

/* The countdown, inline on Home, between the things a person browses, which is where a deadline
   sells. It runs to the demo day's end because the dataset rolls daily, and it turns urgent under
   the last hour on its own, which is the whole point of a clock over a printed date. It never posts
   a win: urgency has no prize, which is the same reason the site's countdown never posts either. */
@Composable
fun CountdownOffer(modifier: Modifier = Modifier) {
  var remaining by remember { mutableStateOf(secondsToDayEnd()) }
  LaunchedEffect(Unit) {
    reportShown("countdown_offer", "inline")
    while (true) { remaining = secondsToDayEnd(); delay(500) }
  }
  val urgent = remaining < 3600
  val h = (remaining / 3600).toInt()
  val m = ((remaining % 3600) / 60).toInt()
  val s = (remaining % 60).toInt()

  Card(modifier) {
    Column(Modifier.padding(16.dp)) {
      Kicker("Seasonal offer")
      Spacer(Modifier.height(4.dp))
      Text("Offer ends in", style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(10.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        DigitBox(h, "hrs", urgent)
        Colon()
        DigitBox(m, "min", urgent)
        Colon()
        DigitBox(s, "sec", urgent)
      }
      Spacer(Modifier.height(10.dp))
      Text("The clock runs to the demo day's end, because the dataset rolls daily.",
           style = MaterialTheme.typography.bodySmall)
      Spacer(Modifier.height(8.dp))
      Text(STAND_IN, style = MaterialTheme.typography.labelSmall)
    }
  }
}

@Composable
private fun Colon() = Text(":", Modifier.padding(horizontal = 6.dp), fontSize = 22.sp, fontWeight = FontWeight.Bold)

@Composable
private fun DigitBox(value: Int, label: String, urgent: Boolean) {
  val bg = if (urgent) Color(0xFFE4002B) else MaterialTheme.colorScheme.secondaryContainer
  val fg = if (urgent) Color.White else MaterialTheme.colorScheme.onSecondaryContainer
  Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Surface(color = bg, shape = MaterialTheme.shapes.small) {
      Text(
        (if (value < 10) "0$value" else "$value"),
        color = fg,
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
      )
    }
    Spacer(Modifier.height(2.dp))
    Text(label, style = MaterialTheme.typography.labelSmall)
  }
}
