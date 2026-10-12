package com.faraimpro.app.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DataRepositoryRuntimeTest {
    private lateinit var context: Context

    @Before
    fun resetPreferences() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("far_aim_pro_prefs", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun repositoryLoadsRealBundledAssetsAndAdvisoryCircularContent() {
        val repository = DataRepository(context)
        val sources = repository.getSourceStatus()?.sources?.associateBy { it.id }.orEmpty()

        assertEquals(sources["far"]?.itemCount, repository.getFARParts().size)
        assertEquals(sources["aim"]?.itemCount, repository.getAIMChapters().size)
        assertEquals(sources["pcg"]?.itemCount, repository.getPCGTerms().size)
        assertEquals(sources["ac"]?.itemCount, repository.getAdvisoryCirculars().size)
        assertTrue(repository.getQuizzes().isNotEmpty())
        assertTrue(repository.getFlashcardDecks().isNotEmpty())

        val circular = repository.getAdvisoryCirculars().first { it.contentPath != null }
        val content = repository.getAdvisoryCircularContent(circular)
        assertNotNull(content)
        assertEquals(circular.id, content?.id)
        assertTrue(content?.pages?.isNotEmpty() == true)
    }

    @Test
    fun searchHandlesCrossCatalogQueriesAndShortInput() {
        val repository = DataRepository(context)

        assertTrue(repository.search("m").isEmpty())
        val results = repository.search("middle marker")
        assertTrue(repository.search("SSV Designator").any { it.type == "aim" })
        assertTrue(repository.search("Private Pilot Minimum Age").any { it.type == "flashcard" })
        assertTrue(results.isNotEmpty())
        assertTrue(results.any { it.title.contains("MIDDLE MARKER", ignoreCase = true) })
    }

    @Test
    fun glossarySearchRanksExactTermsBeforeDefinitionMatches() {
        val repository = DataRepository(context)

        assertEquals("MIDDLE MARKER", repository.searchPCG("  middle marker ").first().term)
    }

    @Test
    fun corruptPreferencesFailClosedWithoutCrashing() {
        context.getSharedPreferences("far_aim_pro_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("far-aim-pro-far-reading-history", "{}")
            .putString("far-aim-pro-study-marks", "[{}]")
            .putString("search_history", "not-json")
            .commit()

        assertNull(ReadingHistoryManager.getFARReadingHistory(context))
        assertTrue(StudyMarkManager.getStudyMarks(context).isEmpty())
        assertTrue(SearchHistoryManager.getSearchHistory(context).isEmpty())
    }

    @Test
    fun studyPackRejectsUnknownSchemaAndPreservesPortableFields() {
        ReadingHistoryManager.saveAIMReadingHistory(context, 7, "AIM Chapter 7")

        assertThrows(IllegalArgumentException::class.java) {
            StudyPackManager.importStudyPackJson(
                context,
                """{"schemaVersion":2,"app":"FAR/AIM Pro"}"""
            )
        }

        val result = StudyPackManager.importStudyPackJson(
            context,
            """
            {
              "schemaVersion": 1,
              "app": "FAR/AIM Pro",
              "studyMarks": [
                {
                  "type": "far",
                  "reference": "61.57",
                  "title": "Recent flight experience",
                  "path": "/far/61#61.57",
                  "saved": true,
                  "highlighted": false,
                  "note": "Review currency",
                  "updatedAt": 200
                },
                {
                  "type": "ac",
                  "reference": "AC 61-98D",
                  "title": "Currency guidance",
                  "path": "/advisory-circulars/ac-61-98d",
                  "saved": true,
                  "updatedAt": 201
                },
                {
                  "type": "far",
                  "reference": "91.103",
                  "title": "Unsafe route",
                  "path": "https://example.com/phishing",
                  "updatedAt": 500
                },
                {
                  "type": "aim",
                  "reference": "AIM 4-3-1",
                  "title": "Missing timestamp",
                  "path": "/aim/4"
                }
              ],
              "readingHistory": [
                {
                  "type": "aim",
                  "id": "4",
                  "title": "AIM Chapter 4",
                  "path": "/aim/4",
                  "timestamp": 300
                },
                {
                  "type": "far",
                  "id": "61",
                  "title": "Missing timestamp",
                  "path": "/far/61"
                }
              ],
              "searchHistory": ["night currency", "Night Currency", "airspace"]
            }
            """.trimIndent()
        )

        assertEquals(2, result.marksImported)
        assertEquals(1, result.historyImported)
        assertEquals(2, result.searchHistoryImported)
        assertEquals(
            "Review currency",
            StudyMarkManager.getStudyMarks(context).single { it.type == "far" }.note
        )
        assertEquals(
            "far_part/61?section=61.57",
            StudyMarkManager.getStudyMarks(context).single { it.type == "far" }.route
        )
        assertEquals(
            "advisory_circulars/ac-61-98d",
            StudyMarkManager.getStudyMarks(context).single { it.type == "ac" }.route
        )
        assertEquals("7", ReadingHistoryManager.getAIMReadingHistory(context)?.identifier)
        assertEquals(
            listOf("night currency", "airspace"),
            SearchHistoryManager.getSearchHistory(context)
        )

        SearchHistoryManager.recordSearch(context, "weather")

        val exported = StudyPackManager.createStudyPackJson(context)
        assertTrue(exported.contains("night currency"))
        assertTrue(exported.contains("airspace"))
        assertTrue(exported.contains("weather"))
        assertTrue(exported.contains("/far/61#61.57"))
        assertTrue(exported.contains("/advisory-circulars/ac-61-98d"))
    }
}
