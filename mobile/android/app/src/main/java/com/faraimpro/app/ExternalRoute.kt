package com.faraimpro.app

import java.net.URI

internal object ExternalRoute {
    private val acIdentifier = Regex("^[A-Za-z0-9._~%+-]+$")
    private val sectionIdentifier = Regex("^[A-Za-z0-9._~%+-]+$")

    fun fromUrl(rawUrl: String?): String? {
        val uri = rawUrl?.let { runCatching { URI(it) }.getOrNull() } ?: return null
        val segments = when {
            uri.scheme == "https" && uri.host == "faraim.online" -> uri.rawPath.segments()
            uri.scheme == "faraimpro" && uri.host != null -> listOf(uri.host) + uri.rawPath.segments()
            uri.scheme == "faraimpro" -> uri.rawPath.segments()
            else -> return null
        }
        if (segments.isEmpty()) return "home"

        return when (segments.first()) {
            "far" -> readerRoute("far_part", segments.getOrNull(1), uri.rawFragment)
                ?: if (segments.size == 1) "far" else null
            "aim" -> readerRoute("aim_chapter", segments.getOrNull(1), uri.rawFragment)
                ?: if (segments.size == 1) "aim" else null
            "advisory-circulars" -> segments.getOrNull(1)
                ?.takeIf { it != "." && it != ".." && it.matches(acIdentifier) }
                ?.let { "advisory_circulars/$it" }
                ?: if (segments.size == 1) "advisory_circulars" else null
            else -> null
        }
    }

    private fun readerRoute(prefix: String, identifier: String?, section: String?): String? {
        val id = identifier?.takeIf { it.matches(Regex("^\\d+$")) } ?: return null
        val validSection = section?.takeIf { it.matches(sectionIdentifier) }
        return "$prefix/$id" + validSection?.let { "?section=$it" }.orEmpty()
    }

    private fun String.segments(): List<String> {
        return split('/').filter(String::isNotEmpty)
    }
}
