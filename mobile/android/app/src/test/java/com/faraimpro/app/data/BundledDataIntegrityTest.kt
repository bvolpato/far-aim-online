package com.faraimpro.app.data

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class BundledDataIntegrityTest {
    private val gson = Gson()
    private val assetsDir: Path = listOf(
        Paths.get("app/src/main/assets"),
        Paths.get("src/main/assets")
    ).first { Files.isDirectory(it) }

    private inline fun <reified T> load(relativePath: String): T =
        Files.newBufferedReader(assetsDir.resolve(relativePath)).use { reader ->
            gson.fromJson(reader, T::class.java)
        }

    @Test
    fun farIndexReferencesBundledParts() {
        val index = load<FARIndex>("far/index.json")

        assertTrue(index.parts.size >= 200)
        assertEquals(index.parts.size, index.parts.map { it.part }.distinct().size)
        index.parts.forEach { part ->
            assertTrue("Missing FAR part ${part.part}", Files.isRegularFile(assetsDir.resolve("far/part${part.part}.json")))
        }
    }

    @Test
    fun coreReferenceCatalogsContainUsableContent() {
        val aimIndex = load<AIMIndex>("aim/index.json")
        val glossary = load<PCGData>("aim/pcg.json")
        val circulars = load<AdvisoryCircularsData>("advisory-circulars/index.json")
        val sourceStatus = load<SourceStatusData>("source-status.json")
        val sourceById = sourceStatus.sources.associateBy { it.id }

        assertEquals((0..11).toList(), aimIndex.chapters.map { it.chapter })
        assertTrue(aimIndex.chapters.all { (it.sectionCount ?: 0) > 0 })
        assertTrue(glossary.terms.size >= 1_500)
        assertTrue(glossary.terms.all { it.term.isNotBlank() && it.definition.isNotBlank() })
        assertEquals(glossary.terms.size, glossary.terms.map { it.term }.distinct().size)
        assertTrue(circulars.items.size >= 750)
        assertEquals(circulars.items.size, circulars.items.map { it.id }.distinct().size)
        assertTrue(circulars.items.all { it.documentUrl.startsWith("https://www.faa.gov/") })
        assertEquals(aimIndex.chapters.size, sourceById.getValue("aim").itemCount)
        assertEquals(glossary.terms.size, sourceById.getValue("pcg").itemCount)
        assertEquals(circulars.items.size, sourceById.getValue("ac").itemCount)
    }

    @Test
    fun everyAdvisoryCircularContentFileLoadsAndMatchesItsIndex() {
        val circulars = load<AdvisoryCircularsData>("advisory-circulars/index.json")
        val referencedPaths = mutableSetOf<String>()

        circulars.items.forEach { circular ->
            val contentPath = circular.contentPath
            if (circular.contentStatus == "unavailable") {
                assertEquals(null, contentPath)
                return@forEach
            }

            assertTrue("Missing content path for ${circular.id}", !contentPath.isNullOrBlank())
            assertTrue("Duplicate content path $contentPath", referencedPaths.add(contentPath!!))
            val content = load<AdvisoryCircularContent>("advisory-circulars/$contentPath")
            assertEquals(circular.id, content.id)
            assertEquals(circular.number, content.number)
            assertEquals(circular.contentStatus, content.status)
            assertTrue("No pages for ${circular.id}", content.pages.isNotEmpty())
            assertEquals(content.pages.map { it.page }.distinct().sorted(), content.pages.map { it.page })
            assertTrue(content.pages.all { it.text.isNotBlank() })
            if (content.status == "partial") {
                assertEquals(content.pages.size, content.extractedPageCount)
                assertTrue(content.pages.size < content.pageCount)
            }
        }
    }

    @Test
    fun studyMaterialCountsAndAnswersAreValid() {
        val quizFiles = Files.list(assetsDir.resolve("quizzes")).use { paths ->
            paths.filter { it.fileName.toString().endsWith(".json") }.toList()
        }
        val flashcardFiles = Files.list(assetsDir.resolve("flashcards")).use { paths ->
            paths.filter { it.fileName.toString().endsWith(".json") }.toList()
        }

        quizFiles.forEach { path ->
            val quiz = load<Quiz>("quizzes/${path.fileName}")
            assertEquals(quiz.questionCount, quiz.questions.size)
            assertTrue(quiz.questions.isNotEmpty())
            assertEquals(quiz.questions.size, quiz.questions.map { it.id }.distinct().size)
            assertTrue(quiz.questions.all { it.options.size >= 2 && it.correctAnswer in it.options.indices })
            assertTrue(quiz.questions.all { it.reference.isNotBlank() })
        }
        flashcardFiles.forEach { path ->
            val deck = load<FlashcardDeck>("flashcards/${path.fileName}")
            assertEquals(deck.cardCount, deck.cards.size)
            assertTrue(deck.cards.isNotEmpty())
            assertEquals(deck.cards.size, deck.cards.map { it.id }.distinct().size)
            assertTrue(deck.cards.all { it.front.isNotBlank() && it.back.isNotBlank() })
            assertTrue(deck.cards.all { it.reference.isNotBlank() })
        }
    }
}
