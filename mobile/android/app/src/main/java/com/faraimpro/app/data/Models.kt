package com.faraimpro.app.data

import com.google.gson.annotations.SerializedName

// FAR Data Models
data class FARPart(
    val part: Int,
    val title: String,
    val cfr: String,
    val subchapter: String? = null,
    val subchapterTitle: String? = null,
    val source: String? = null,
    val url: String? = null,
    val effectiveDate: String? = null,
    val sections: List<FARSection>? = null,
    val subparts: List<Subpart>? = null,
    val appendices: List<FARAppendix>? = null
)

data class Subpart(
    val subpart: String,
    val title: String,
    val sections: List<FARSection>
)

data class FARSection(
    val section: String,
    val title: String,
    val content: String,
    val definitions: List<Definition>? = null,
    val abbreviations: List<Abbreviation>? = null,
    val keyPoints: List<String>? = null,
    val figures: List<AIMFigure>? = null
) {
    val searchableText: String
        get() = buildString {
            append(content)
            figures.orEmpty().forEach { figure ->
                figure.alt?.takeIf { it.isNotBlank() }?.let { append(' ').append(it) }
                figure.caption?.takeIf { it.isNotBlank() }?.let { append(' ').append(it) }
            }
        }.trim()
}

data class FARAppendix(
    val appendix: String,
    val title: String,
    val content: String = "",
    val figures: List<AIMFigure>? = null
) {
    val searchableText: String
        get() = buildString {
            append(content)
            figures.orEmpty().forEach { figure ->
                figure.alt?.takeIf { it.isNotBlank() }?.let { append(' ').append(it) }
                figure.caption?.takeIf { it.isNotBlank() }?.let { append(' ').append(it) }
            }
        }.trim()
}

data class Definition(
    val term: String,
    val definition: String
)

data class Abbreviation(
    val abbr: String,
    val meaning: String
)

// FAR Index
data class FARIndex(
    val parts: List<FARIndexPart>
)

data class FARIndexPart(
    val part: Int,
    val title: String,
    val sectionCount: Int? = null,
    val isPilotIndex: Boolean? = null,
    val subchapter: String? = null,
    val subchapterTitle: String? = null
)

// AIM Data Models
data class AIMChapter(
    val chapter: Int,
    val title: String,
    val sections: List<AIMSection>
)

data class AIMSection(
    val section: String,
    val title: String,
    val content: String? = null,
    val definitions: List<Definition>? = null,
    val keyPoints: List<String>? = null,
    val subsections: List<AIMSubsection>? = null,
    val figures: List<AIMFigure>? = null,
    val tables: List<AIMTable>? = null
) {
    val searchableText: String
        get() = buildList {
            add(section)
            add(title)
            content?.let(::add)
            definitions?.forEach { add(it.term); add(it.definition) }
            keyPoints?.let(::addAll)
            subsections?.forEach { subsection ->
                add(subsection.subsection)
                add(subsection.title)
                add(subsection.content)
                subsection.keyPoints?.let(::addAll)
            }
            figures?.forEach { figure ->
                figure.alt?.let(::add)
                figure.caption?.let(::add)
            }
            tables?.forEach { table ->
                table.headers?.let(::addAll)
                table.rows?.forEach(::addAll)
                table.caption?.let(::add)
            }
        }.joinToString(" ")
}

data class AIMSubsection(
    val subsection: String,
    val title: String,
    val content: String,
    val keyPoints: List<String>? = null
)

data class AIMFigure(
    val src: String,
    val alt: String? = null,
    val caption: String? = null,
    val originalUrl: String? = null
)

data class AIMTable(
    val headers: List<String>? = null,
    val rows: List<List<String>>? = null,
    val caption: String? = null
)

// AIM Index
data class AIMIndex(
    val chapters: List<AIMIndexChapter>
)

data class AIMIndexChapter(
    val chapter: Int,
    val title: String,
    val sectionCount: Int? = null,
    val imageCount: Int? = null
)

// PCG (Pilot/Controller Glossary)
data class PCGData(
    val title: String,
    val source: String? = null,
    val lastUpdated: String? = null,
    val terms: List<PCGTerm>
)

data class PCGTerm(
    val term: String,
    val definition: String
)

// Quiz Data Models
data class Quiz(
    val id: String,
    val title: String,
    val description: String,
    val category: String,
    val chapter: Int? = null,
    val part: Int? = null,
    val difficulty: String,
    val targetCertificate: String? = null,
    val questionCount: Int,
    val passingScore: Int,
    val questions: List<QuizQuestion>
)

data class QuizQuestion(
    val id: String? = null,
    val question: String,
    val options: List<String>,
    val correctAnswer: Int,
    val explanation: String,
    val reference: String
)

// Flashcard Data Models
data class FlashcardDeck(
    val id: String,
    val title: String,
    val description: String,
    val category: String,
    val chapter: Int? = null,
    val part: Int? = null,
    val cardCount: Int,
    val cards: List<Flashcard>
)

data class Flashcard(
    val id: String? = null,
    val front: String,
    val back: String,
    val reference: String
)

// Study Paths
data class StudyPathsData(
    val version: Int,
    val updated: String,
    val paths: List<StudyPath>
)

data class StudyPath(
    val id: String,
    val title: String,
    val subtitle: String,
    val category: String,
    val description: String,
    val references: List<StudyPathReference>,
    val quizIds: List<String>,
    val flashcardDeckIds: List<String>
)

data class StudyPathReference(
    val type: String,
    val label: String,
    val title: String,
    val part: Int? = null,
    val chapter: Int? = null
)

// FAA Advisory Circulars
data class AdvisoryCircularsData(
    val version: Int,
    val updated: String,
    val source: String,
    val description: String,
    val items: List<AdvisoryCircular>
)

data class AdvisoryCircular(
    val id: String,
    val number: String,
    val title: String,
    val status: String,
    val issued: String,
    val office: String,
    val category: String,
    val summary: String,
    val relatedCfr: List<String>,
    val documentUrl: String,
    val pdfUrl: String? = null,
    val replaces: String? = null,
    val tags: List<String>,
    val contentPath: String? = null,
    val contentStatus: String? = null,
    val pageCount: Int? = null,
    val wordCount: Int? = null,
    val contentUpdated: String? = null
)

data class AdvisoryCircularContent(
    val version: Int,
    val id: String,
    val number: String,
    val title: String,
    val status: String,
    val fetched: String,
    val documentUrl: String,
    val pdfUrl: String,
    val sha256: String,
    val pageCount: Int,
    val extractedPageCount: Int? = null,
    val wordCount: Int,
    val pages: List<AdvisoryCircularPage>
)

data class AdvisoryCircularPage(
    val page: Int,
    val text: String
)

// Source Status
data class SourceStatusData(
    val version: Int,
    val generatedAt: String,
    val appVersion: String,
    val sources: List<SourceStatusItem>,
    val changeWatch: List<SourceChangeWatch>,
    val releaseNotes: List<SourceReleaseNote>,
    val limitations: List<String>,
    val nextChecks: List<String>
)

data class SourceStatusItem(
    val id: String,
    val label: String,
    val shortLabel: String,
    val source: String,
    val status: String,
    val lastUpdated: String,
    val itemCount: Int? = null,
    val sectionCount: Int? = null,
    val questionCount: Int? = null,
    val cardCount: Int? = null,
    val coverage: String,
    val officialUrl: String,
    val notes: List<String>
)

data class SourceReleaseNote(
    val date: String,
    val title: String,
    val details: List<String>
)

data class SourceChangeWatch(
    val id: String,
    val date: String,
    val sourceId: String,
    val severity: String,
    val title: String,
    val summary: String,
    val affectedReferences: List<String>,
    val actions: List<String>,
    val link: String
)

// Search Result
data class SearchResult(
    val type: String,  // "far", "aim", "pcg", "ac", "flashcard"
    val title: String,
    val content: String,
    val reference: String,
    val link: String
)

fun formatAIMChapterLabel(chapter: Int): String =
    if (chapter == 0) "General Information" else "Chapter $chapter"
