package com.faraimpro.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

@Composable
fun AirplaneCelebration(show: Boolean) {
    if (!show) return

    var isVisible by remember { mutableStateOf(true) }

    LaunchedEffect(show) {
        isVisible = true
        delay(6000) // Match React implementation duration
        isVisible = false
    }

    if (!isVisible) return

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val width = with(density) { maxWidth.toPx() }
        val height = with(density) { maxHeight.toPx() }

        // Airplanes
        repeat(8) {
            FlyingAirplane(
                type = if (Random.nextBoolean()) AirplaneType.Jet else AirplaneType.Propeller,
                delay = Random.nextLong(0L, 2000L),
                screenWidth = width
            )
        }

        // Contrails
        repeat(3) { i ->
            FlyingAirplane(
                type = AirplaneType.Contrail,
                delay = i * 500L,
                screenWidth = width
            )
        }

        // Confetti
        val confettiColors = listOf(
            Color(0xFF10B981), Color(0xFF3B82F6), Color(0xFF8B5CF6),
            Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFEC4899)
        )

        repeat(50) {
            FallingConfetti(
                color = confettiColors.random(),
                delay = Random.nextLong(0L, 3000L)
            )
        }

        // Center Burst
        CenterBurst()
    }
}

enum class AirplaneType { Jet, Propeller, Contrail }

@Composable
fun FlyingAirplane(type: AirplaneType, delay: Long, screenWidth: Float) {
    val startX = if (type == AirplaneType.Contrail) -100f else Random.nextFloat() * screenWidth
    val startY = Random.nextFloat() * 600f + 100f

    val offsetX = remember { Animatable(startX) }
    val offsetY = remember { Animatable(startY) }
    val alpha = remember { Animatable(0f) }
    val scale = remember { Animatable(if (type == AirplaneType.Contrail) 1f else Random.nextFloat() * 0.5f + 0.5f) }
    val rotation = remember { Animatable(if (type == AirplaneType.Contrail) 0f else Random.nextFloat() * 30f - 15f) }

    LaunchedEffect(Unit) {
        delay(delay)
        launch {
            alpha.animateTo(1f, animationSpec = tween(200)) // Fade in
        }

        if (type == AirplaneType.Contrail) {
            // Fly across
            launch {
                offsetX.animateTo(screenWidth + 200f, animationSpec = tween(durationMillis = Random.nextInt(3000, 5000), easing = LinearEasing))
            }
            launch {
                delay(3000) // Fade out at end
                alpha.animateTo(0f, animationSpec = tween(500))
            }
        } else {
            // Float up
            launch {
                offsetX.animateTo(startX + 100f, animationSpec = tween(durationMillis = Random.nextInt(3000, 5000), easing = FastOutSlowInEasing))
            }
            launch {
                offsetY.animateTo(-200f, animationSpec = tween(durationMillis = Random.nextInt(3000, 5000), easing = FastOutSlowInEasing))
            }
            launch {
                delay(2500)
                alpha.animateTo(0f, animationSpec = tween(500))
            }
        }
    }

    Box(
        modifier = Modifier
            .graphicsLayer {
                translationX = offsetX.value
                translationY = offsetY.value
                scaleX = scale.value
                scaleY = scale.value
                rotationZ = rotation.value
                this.alpha = alpha.value
            }
    ) {
        when (type) {
            AirplaneType.Jet -> Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = null,
                tint = Color(0xFF334155), // Slate 700
                modifier = Modifier.size(48.dp).rotate(-45f)
            )
            AirplaneType.Propeller -> Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = null,
                tint = Color(0xFF059669), // Emerald 600
                modifier = Modifier.size(40.dp).rotate(-45f)
            )
            AirplaneType.Contrail -> {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(32.dp).rotate(-45f)
                )
            }
        }
    }
}

@Composable
fun FallingConfetti(color: Color, delay: Long) {
    val startX = Random.nextFloat() * 1000f // Approximate
    val startY = -50f

    val offsetX = remember { Animatable(startX) }
    val offsetY = remember { Animatable(startY) }
    val rotation = remember { Animatable(0f) }
    val alpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        delay(delay)
        alpha.snapTo(1f)
        launch {
            offsetY.animateTo(2000f, animationSpec = tween(durationMillis = 4000, easing = LinearEasing))
        }
        launch {
            rotation.animateTo(720f, animationSpec = tween(durationMillis = 4000, easing = LinearEasing))
        }
        launch {
            delay(3500)
            alpha.animateTo(0f, animationSpec = tween(500))
        }
    }

    Box(
        modifier = Modifier
            .size(12.dp)
            .graphicsLayer {
                translationX = offsetX.value
                translationY = offsetY.value
                rotationZ = rotation.value
                this.alpha = alpha.value
            }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(color = color)
        }
    }
}

@Composable
fun CenterBurst() {
    val scale = remember { Animatable(0f) }
    val alpha = remember { Animatable(0.8f) }

    LaunchedEffect(Unit) {
        launch {
            scale.animateTo(4f, animationSpec = tween(1500, easing = FastOutSlowInEasing))
        }
        launch {
            alpha.animateTo(0f, animationSpec = tween(1500))
        }
    }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(150.dp)) {
            drawCircle(
                color = Color(0xFF10B981).copy(alpha = 0.3f), // Emerald
                radius = size.minDimension / 2 * scale.value,
                alpha = alpha.value,
                style = Stroke(width = 4.dp.toPx())
            )
        }
    }
}
