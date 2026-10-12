package com.faraimpro.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FormatAlignLeft
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.faraimpro.app.data.ReaderPreferences
import kotlin.math.roundToInt

@Composable
fun ReaderControls(
    preferences: ReaderPreferences,
    onPreferencesChanged: (ReaderPreferences) -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.TextFields, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("Reader", style = MaterialTheme.typography.titleSmall)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        onPreferencesChanged(
                            preferences.copy(fontScaleIndex = (preferences.fontScaleIndex - 1).coerceAtLeast(0))
                        )
                    },
                    enabled = preferences.fontScaleIndex > 0
                ) {
                    Icon(Icons.Filled.Remove, contentDescription = "Decrease reader text size")
                }

                Text(
                    text = "${(preferences.fontScale * 100).roundToInt()}%",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(vertical = 12.dp)
                )

                IconButton(
                    onClick = {
                        onPreferencesChanged(
                            preferences.copy(
                                fontScaleIndex = (preferences.fontScaleIndex + 1)
                                    .coerceAtMost(ReaderPreferences.FONT_SCALES.lastIndex)
                            )
                        )
                    },
                    enabled = preferences.fontScaleIndex < ReaderPreferences.FONT_SCALES.lastIndex
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Increase reader text size")
                }

                Icon(
                    Icons.AutoMirrored.Filled.FormatAlignLeft,
                    contentDescription = null
                )

                IconButton(onClick = { onPreferencesChanged(ReaderPreferences()) }) {
                    Icon(Icons.Filled.Refresh, contentDescription = "Reset reader controls")
                }
            }

            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                ReaderPreferences.DENSITIES.forEach { density ->
                    FilterChip(
                        selected = preferences.density == density,
                        onClick = { onPreferencesChanged(preferences.copy(density = density)) },
                        label = { Text(readerDensityLabel(density)) }
                    )
                }
            }
        }
    }
}

private fun readerDensityLabel(density: String): String {
    return when (density) {
        "comfortable" -> "Comfort"
        else -> density.replaceFirstChar { it.uppercaseChar() }
    }
}
