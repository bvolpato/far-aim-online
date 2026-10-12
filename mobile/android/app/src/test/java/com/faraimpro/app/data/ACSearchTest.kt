package com.faraimpro.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ACSearchTest {
    @Test
    fun indexCandidatesIntersectTokensAndIgnoreInvalidPostings() {
        val candidates = findACIndexCandidates(
            tokens = listOf("runway", "incursion"),
            index = mapOf(
                "runway" to listOf(2, 1, 1, 99),
                "incursion" to listOf(1, 2, -1)
            ),
            documentCount = 3
        )

        assertEquals(listOf(1, 2), candidates)
    }

    @Test
    fun rankingCombinesFullTextCandidatesWithMetadataFallback() {
        val circulars = listOf(
            circular("surface", "10-1", "Surface Safety"),
            circular("avoidance", "10-2", "Runway Incursion Avoidance"),
            circular("reporting", "10-3", "Runway Incursion Reporting")
        )
        val ranked = rankAdvisoryCircularCandidates(
            tokens = listOf("runway", "incursion"),
            index = mapOf(
                "runway" to listOf(0, 1),
                "incursion" to listOf(0, 1)
            ),
            circulars = circulars
        )

        assertEquals(listOf(1, 2, 0), ranked.map { it.documentId })
        assertTrue(ranked.first { it.documentId == 1 }.matchedFullText)
        assertFalse(ranked.first { it.documentId == 2 }.matchedFullText)
        assertTrue(ranked.first().score > ranked[1].score)
    }

    @Test
    fun equalScoresUseStableAcNumberAndIdTieBreaks() {
        val circulars = listOf(
            circular("later", "20-1", "General Guidance"),
            circular("earlier", "10-1", "General Guidance")
        )
        val forward = rankAdvisoryCircularCandidates(
            tokens = listOf("icing"),
            index = mapOf("icing" to listOf(0, 1)),
            circulars = circulars
        )
        val reversed = rankAdvisoryCircularCandidates(
            tokens = listOf("icing"),
            index = mapOf("icing" to listOf(1, 0, 1)),
            circulars = circulars
        )

        assertEquals(listOf(1, 0), forward.map { it.documentId })
        assertEquals(forward, reversed)
    }

    @Test
    fun metadataFallbackNormalizesPunctuatedAcNumbers() {
        val ranked = rankAdvisoryCircularCandidates(
            tokens = listOf("6198d"),
            index = emptyMap(),
            circulars = listOf(circular("flight-review", "61-98D", "Currency Guidance"))
        )

        assertEquals(listOf(0), ranked.map { it.documentId })
        assertFalse(ranked.single().matchedFullText)
    }

    private fun circular(
        id: String,
        number: String,
        title: String,
        summary: String = "General aviation guidance"
    ) = AdvisoryCircular(
        id = id,
        number = number,
        title = title,
        status = "Active",
        issued = "2026-01-01",
        office = "AFS-800",
        category = "General Guidance",
        summary = summary,
        relatedCfr = emptyList(),
        documentUrl = "https://www.faa.gov/$id",
        tags = emptyList()
    )
}
