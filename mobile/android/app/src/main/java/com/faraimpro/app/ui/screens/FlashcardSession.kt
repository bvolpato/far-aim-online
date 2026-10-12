package com.faraimpro.app.ui.screens

import com.faraimpro.app.data.Flashcard

internal enum class RecallRating {
    KNOWN,
    LEARNING
}

internal data class SessionCard(
    val key: Int,
    val flashcard: Flashcard
)

internal data class FlashcardSessionState(
    val originalCards: List<SessionCard>,
    val cards: List<SessionCard> = originalCards,
    val currentIndex: Int = 0,
    val ratings: Map<Int, RecallRating> = emptyMap(),
    val isComplete: Boolean = false
) {
    val currentCard: SessionCard
        get() = cards[currentIndex]

    val knownCount: Int
        get() = ratings.values.count { it == RecallRating.KNOWN }

    val learningCount: Int
        get() = ratings.values.count { it == RecallRating.LEARNING }

    val completedCount: Int
        get() = ratings.size

    fun rateCurrent(rating: RecallRating): FlashcardSessionState {
        if (isComplete) return this

        val updatedRatings = ratings + (currentCard.key to rating)
        if (updatedRatings.size == cards.size) {
            return copy(ratings = updatedRatings, isComplete = true)
        }

        val nextIndex = cards.indices
            .drop(currentIndex + 1)
            .firstOrNull { cards[it].key !in updatedRatings }
            ?: cards.indices.first { cards[it].key !in updatedRatings }
        return copy(currentIndex = nextIndex, ratings = updatedRatings)
    }

    fun moveTo(index: Int): FlashcardSessionState = copy(
        currentIndex = index.coerceIn(cards.indices),
        isComplete = false
    )

    fun restart(): FlashcardSessionState = copy(
        currentIndex = 0,
        ratings = emptyMap(),
        isComplete = false
    )

    fun reshuffle(shuffle: (List<SessionCard>) -> List<SessionCard> = { it.shuffled() }): FlashcardSessionState = copy(
        cards = shuffle(originalCards),
        currentIndex = 0,
        ratings = emptyMap(),
        isComplete = false
    )

    companion object {
        fun from(cards: List<Flashcard>): FlashcardSessionState {
            require(cards.isNotEmpty())
            val sessionCards = cards.mapIndexed { index, card -> SessionCard(index, card) }
            return FlashcardSessionState(originalCards = sessionCards)
        }
    }
}
