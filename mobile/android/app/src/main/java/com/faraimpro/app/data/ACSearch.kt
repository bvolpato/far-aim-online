package com.faraimpro.app.data

import kotlin.math.ln

internal typealias ACInvertedIndex = Map<String, List<Int>>

internal data class ACSearchCandidate(
    val documentId: Int,
    val score: Double,
    val matchedFullText: Boolean
)

internal fun findACIndexCandidates(
    tokens: List<String>,
    index: ACInvertedIndex,
    documentCount: Int
): List<Int> {
    if (tokens.isEmpty() || documentCount <= 0) return emptyList()

    val postingSets = tokens.distinct().map { token ->
        index[token].orEmpty()
            .asSequence()
            .filter { it in 0 until documentCount }
            .toSet()
    }
    if (postingSets.any { it.isEmpty() }) return emptyList()

    return postingSets
        .drop(1)
        .fold(postingSets.first()) { candidates, postings -> candidates intersect postings }
        .sorted()
}

internal fun rankAdvisoryCircularCandidates(
    tokens: List<String>,
    index: ACInvertedIndex,
    circulars: List<AdvisoryCircular>
): List<ACSearchCandidate> {
    val normalizedTokens = tokens
        .map { normalizeACSearchText(it) }
        .filter { it.isNotBlank() }
        .distinct()
    if (normalizedTokens.isEmpty() || circulars.isEmpty()) return emptyList()

    val fullTextIds = findACIndexCandidates(normalizedTokens, index, circulars.size).toSet()
    val tokenWeights = normalizedTokens.associateWith { token ->
        val documentFrequency = index[token].orEmpty()
            .asSequence()
            .filter { it in circulars.indices }
            .distinct()
            .count()
        ln((circulars.size + 1.0) / (documentFrequency + 1.0)) + 1.0
    }

    return circulars.mapIndexedNotNull { documentId, circular ->
        val number = normalizeACSearchText("AC ${circular.number}")
        val title = normalizeACSearchText(circular.title)
        val summary = normalizeACSearchText(circular.summary)
        val supplemental = normalizeACSearchText(
            listOf(
                circular.category,
                circular.status,
                circular.office,
                circular.replaces.orEmpty(),
                circular.relatedCfr.joinToString(" "),
                circular.tags.joinToString(" ")
            ).joinToString(" ")
        )
        val metadata = "$number $title $summary $supplemental"
        val metadataMatch = normalizedTokens.all(metadata::contains)
        val fullTextMatch = documentId in fullTextIds
        if (!fullTextMatch && !metadataMatch) return@mapIndexedNotNull null

        var score = 0.0
        normalizedTokens.forEach { token ->
            val weight = tokenWeights.getValue(token)
            if (fullTextMatch) score += weight
            score += when {
                number.contains(token) -> weight * 4.0
                title.contains(token) -> weight * 3.0
                summary.contains(token) -> weight * 1.5
                supplemental.contains(token) -> weight * 0.75
                else -> 0.0
            }
        }

        ACSearchCandidate(
            documentId = documentId,
            score = score,
            matchedFullText = fullTextMatch
        )
    }.sortedWith(
        compareByDescending<ACSearchCandidate> { it.score }
            .thenBy { circulars[it.documentId].number.lowercase() }
            .thenBy { circulars[it.documentId].id }
    )
}

private val AC_NON_SEARCH_CHARACTERS = Regex("[^\\w\\s]")
private val AC_SEARCH_WHITESPACE = Regex("\\s+")

internal fun normalizeACSearchText(value: String): String = value
    .lowercase()
    .replace(AC_NON_SEARCH_CHARACTERS, "")
    .replace(AC_SEARCH_WHITESPACE, " ")
    .trim()
