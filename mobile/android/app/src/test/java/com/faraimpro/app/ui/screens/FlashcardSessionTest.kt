package com.faraimpro.app.ui.screens

import com.faraimpro.app.data.Flashcard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlashcardSessionTest {
    private val cards = listOf(
        Flashcard(id = "one", front = "One", back = "First", reference = "AIM 1"),
        Flashcard(id = "two", front = "Two", back = "Second", reference = "AIM 2")
    )

    @Test
    fun finalCardIsCountedOnceAndCompletesSession() {
        var session = FlashcardSessionState.from(cards)
        session = session.rateCurrent(RecallRating.KNOWN)
        session = session.rateCurrent(RecallRating.LEARNING)

        assertTrue(session.isComplete)
        assertEquals(1, session.knownCount)
        assertEquals(1, session.learningCount)
        assertEquals(2, session.completedCount)

        val repeatedRating = session.rateCurrent(RecallRating.KNOWN)
        assertEquals(session, repeatedRating)
    }

    @Test
    fun restartAndReshuffleClearPriorResults() {
        val completed = FlashcardSessionState.from(cards)
            .rateCurrent(RecallRating.KNOWN)
            .rateCurrent(RecallRating.KNOWN)

        val restarted = completed.restart()
        assertFalse(restarted.isComplete)
        assertEquals(0, restarted.completedCount)
        assertEquals("one", restarted.currentCard.flashcard.id)

        val reshuffled = completed.reshuffle { it.reversed() }
        assertFalse(reshuffled.isComplete)
        assertEquals(0, reshuffled.completedCount)
        assertEquals("two", reshuffled.currentCard.flashcard.id)
    }
}
