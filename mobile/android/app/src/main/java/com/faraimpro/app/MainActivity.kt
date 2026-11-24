package com.faraimpro.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.faraimpro.app.ui.FARAIMProApp
import com.faraimpro.app.ui.theme.FARAIMProTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val pendingRoute = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            routeFrom(intent)?.takeIf { it != "home" }?.let {
                pendingRoute.value = it
            }
        }
        setContent {
            FARAIMProTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val requestedRoute by pendingRoute.collectAsState()
                    FARAIMProApp(
                        pendingDeepLinkRoute = requestedRoute,
                        onDeepLinkConsumed = { pendingRoute.value = null }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        routeFrom(intent)?.let { pendingRoute.value = it }
    }

    private fun routeFrom(intent: Intent): String? {
        return intent.getStringExtra("initial_route")
            ?: ExternalRoute.fromUrl(intent.dataString)
    }
}
