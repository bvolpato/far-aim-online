package com.faraimpro.app.data

import android.content.Context
import androidx.core.content.edit

data class ReaderPreferences(
    val fontScaleIndex: Int = 1,
    val density: String = "standard"
) {
    val fontScale: Float
        get() = FONT_SCALES[fontScaleIndex.coerceIn(FONT_SCALES.indices)]

    val lineHeightMultiplier: Float
        get() = when (density) {
            "compact" -> 1.35f
            "comfortable" -> 1.7f
            else -> 1.5f
        }

    val cardPadding: Int
        get() = when (density) {
            "compact" -> 12
            "comfortable" -> 20
            else -> 16
        }

    companion object {
        val FONT_SCALES = listOf(0.9f, 1f, 1.1f, 1.22f, 1.36f)
        val DENSITIES = listOf("compact", "standard", "comfortable")
    }
}

object ReaderPreferencesManager {
    private const val PREFS_NAME = "far_aim_pro_prefs"
    private const val FONT_SCALE_KEY = "far-aim-pro-reader-font-scale-index"
    private const val DENSITY_KEY = "far-aim-pro-reader-density"

    fun get(context: Context): ReaderPreferences {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return ReaderPreferences(
            fontScaleIndex = prefs.getInt(FONT_SCALE_KEY, 1).coerceIn(ReaderPreferences.FONT_SCALES.indices),
            density = prefs.getString(DENSITY_KEY, "standard")
                ?.takeIf { it in ReaderPreferences.DENSITIES }
                ?: "standard"
        )
    }

    fun save(context: Context, preferences: ReaderPreferences) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit {
                putInt(
                    FONT_SCALE_KEY,
                    preferences.fontScaleIndex.coerceIn(ReaderPreferences.FONT_SCALES.indices)
                )
                putString(
                    DENSITY_KEY,
                    preferences.density.takeIf { it in ReaderPreferences.DENSITIES } ?: "standard"
                )
            }
    }
}
