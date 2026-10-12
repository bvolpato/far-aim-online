package com.faraimpro.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.faraimpro.app.ui.FARAIMProApp
import com.faraimpro.app.ui.theme.FARAIMProTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val initialRoute = routeFrom(intent)
        val hasRequestedRoute = intent.hasExtra("initial_route") || ExternalRoute.fromUrl(intent.dataString) != null
        val activityState = if (hasRequestedRoute) null else savedInstanceState
        super.onCreate(activityState)
        render(initialRoute)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        render(routeFrom(intent))
    }

    private fun routeFrom(intent: Intent): String {
        return intent.getStringExtra("initial_route")
            ?: ExternalRoute.fromUrl(intent.dataString)
            ?: "home"
    }

    private fun render(initialRoute: String) {
        setContent {
            FARAIMProTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    FARAIMProApp(initialRoute = initialRoute)
                }
            }
        }
    }
}
