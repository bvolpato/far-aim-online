//
//  DataModels.swift
//  FARAIMPro
//
//  Data models for FAR/AIM content
//

import Foundation

// MARK: - FAR Models

struct FARPart: Codable, Identifiable {
    var id: Int { part }
    let part: Int
    let title: String
    let cfr: String
    let subchapter: String?
    let subchapterTitle: String?
    let effectiveDate: String?
    let source: String?
    let url: String?
    let sections: [FARSection]?
    let subparts: [FARSubpart]?
    let appendices: [FARAppendix]?
}

struct FARAppendix: Codable, Identifiable {
    var id: String { appendix }
    let appendix: String
    let title: String
    let content: String
    let figures: [AIMFigure]?

    var searchableText: String {
        ([appendix, title, content] + (figures?.map(\.searchableText) ?? [])).joined(separator: " ")
    }
}

struct FARSection: Codable, Identifiable {
    var id: String { section }
    let section: String
    let title: String
    let content: String
    let definitions: [Definition]?
    let abbreviations: [Abbreviation]?
    let keyPoints: [String]?
    let figures: [AIMFigure]?

    var searchableText: String {
        var fields = [section, title, content]
        fields.append(contentsOf: definitions?.flatMap { [$0.term, $0.definition] } ?? [])
        fields.append(contentsOf: abbreviations?.flatMap { [$0.abbr, $0.meaning] } ?? [])
        fields.append(contentsOf: keyPoints ?? [])
        fields.append(contentsOf: figures?.map(\.searchableText) ?? [])
        return fields.joined(separator: " ")
    }
}

struct FARSubpart: Codable, Identifiable {
    var id: String { subpart }
    let subpart: String
    let title: String
    let sections: [FARSection]
}

struct Definition: Codable, Identifiable {
    var id: String { term }
    let term: String
    let definition: String
}

struct Abbreviation: Codable, Identifiable {
    var id: String { abbr }
    let abbr: String
    let meaning: String
}

// MARK: - AIM Models

struct AIMChapter: Codable, Identifiable {
    var id: Int { chapter }
    let chapter: Int
    let title: String
    let sections: [AIMSection]
}

struct AIMSection: Codable, Identifiable {
    var id: String { section }
    let section: String
    let title: String
    let content: String?
    let subsections: [AIMSubsection]?
    let figures: [AIMFigure]?
    let tables: [AIMTable]?

    var searchableText: String {
        var fields = [section, title, content ?? ""]
        fields.append(contentsOf: subsections?.map(\.searchableText) ?? [])
        fields.append(contentsOf: figures?.map(\.searchableText) ?? [])
        fields.append(contentsOf: tables?.map(\.searchableText) ?? [])
        return fields.joined(separator: " ")
    }
}

struct AIMSubsection: Codable, Identifiable {
    var id: String { subsection }
    let subsection: String
    let title: String
    let content: String
    let keyPoints: [String]?

    var searchableText: String {
        ([subsection, title, content] + (keyPoints ?? [])).joined(separator: " ")
    }
}

struct AIMFigure: Codable {
    let src: String
    let alt: String?
    let caption: String?
    let originalUrl: String?

    var searchableText: String {
        [src, alt ?? "", caption ?? ""].joined(separator: " ")
    }
}

struct AIMTable: Codable {
    let headers: [String]?
    let rows: [[String]]?
    let caption: String?

    var searchableText: String {
        ((headers ?? []) + (rows ?? []).flatMap { $0 } + [caption ?? ""]).joined(separator: " ")
    }
}

func formatAIMChapterLabel(_ chapter: Int) -> String {
    chapter == 0 ? "General Information" : "Chapter \(chapter)"
}

func formatAIMChapterBadge(_ chapter: Int) -> String {
    chapter == 0 ? "GENERAL" : "CHAPTER \(chapter)"
}

// MARK: - PCG (Pilot/Controller Glossary) Models

struct PCGData: Codable {
    let title: String
    let source: String?
    let lastUpdated: String?
    let terms: [PCGTerm]
}

struct PCGTerm: Codable, Identifiable {
    var id: String { term }
    let term: String
    let definition: String
}

// MARK: - Index Models

struct FARIndex: Codable {
    let parts: [FARIndexPart]
}

struct FARIndexPart: Codable, Identifiable {
    var id: Int { part }
    let part: Int
    let title: String
    let sectionCount: Int?
    let isPilotIndex: Bool?
    let subchapter: String?
    let subchapterTitle: String?
}

struct AIMIndex: Codable {
    let chapters: [AIMIndexChapter]
}

struct AIMIndexChapter: Codable, Identifiable {
    var id: Int { chapter }
    let chapter: Int
    let title: String
    let sectionCount: Int?
    let imageCount: Int?
}

// MARK: - Embedded Quiz/Flashcard Models (inline in sections)

struct EmbeddedQuizQuestion: Codable {
    let question: String
    let options: [String]
    let answer: String
    let explanation: String
}

struct EmbeddedFlashcard: Codable {
    let front: String
    let back: String
}

// MARK: - Quiz Models

struct Quiz: Codable, Identifiable {
    let id: String
    let title: String
    let description: String
    let category: String
    let chapter: Int?
    let part: Int?
    let difficulty: String
    let targetCertificate: String
    let questionCount: Int
    let passingScore: Int
    let questions: [QuizQuestion]
}

struct QuizQuestion: Codable, Identifiable {
    let id: String
    let question: String
    let options: [String]
    let correctAnswer: Int
    let explanation: String
    let reference: String
}

// MARK: - Flashcard Models

struct FlashcardDeck: Codable, Identifiable {
    let id: String
    let title: String
    let description: String
    let category: String
    let chapter: Int?
    let part: Int?
    let cardCount: Int
    let cards: [Flashcard]
}

struct Flashcard: Codable, Identifiable {
    let id: String
    let front: String
    let back: String
    let reference: String
}

struct FlashcardStudyProgress: Equatable {
    private(set) var currentIndex = 0
    private(set) var knownCardIDs: Set<String> = []
    private(set) var learningCardIDs: Set<String> = []
    private(set) var isComplete = false

    var assessedCount: Int {
        knownCardIDs.union(learningCardIDs).count
    }

    mutating func classify(cardID: String, asKnown: Bool, cardIDs: [String]) {
        guard !isComplete,
              cardIDs.indices.contains(currentIndex),
              cardIDs[currentIndex] == cardID else { return }

        if asKnown {
            knownCardIDs.insert(cardID)
            learningCardIDs.remove(cardID)
        } else {
            learningCardIDs.insert(cardID)
            knownCardIDs.remove(cardID)
        }

        let uniqueCardCount = Set(cardIDs).count
        if assessedCount == uniqueCardCount {
            isComplete = true
            return
        }

        let assessedCardIDs = knownCardIDs.union(learningCardIDs)
        let isUnassessed: (Int) -> Bool = { !assessedCardIDs.contains(cardIDs[$0]) }
        let nextIndex = cardIDs.indices.dropFirst(currentIndex + 1).first(where: isUnassessed)
            ?? cardIDs.indices.prefix(currentIndex).first(where: isUnassessed)
        if let nextIndex {
            currentIndex = nextIndex
        }
    }

    mutating func moveNext(cardCount: Int) {
        guard currentIndex < cardCount - 1 else { return }
        currentIndex += 1
    }

    mutating func movePrevious() {
        guard currentIndex > 0 else { return }
        currentIndex -= 1
        isComplete = false
    }

    mutating func restart() {
        self = FlashcardStudyProgress()
    }
}

// MARK: - Study Path Models

struct StudyPathsData: Codable {
    let version: Int
    let updated: String
    let paths: [StudyPath]
}

struct StudyPath: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let category: String
    let description: String
    let references: [StudyPathReference]
    let quizIds: [String]
    let flashcardDeckIds: [String]
}

struct StudyPathReference: Codable, Identifiable {
    var id: String { "\(type)-\(label)" }
    let type: String
    let label: String
    let title: String
    let part: Int?
    let chapter: Int?
}

// MARK: - Advisory Circular Models

struct AdvisoryCircularsData: Codable {
    let version: Int
    let updated: String
    let source: String
    let description: String
    let items: [AdvisoryCircular]
}

struct AdvisoryCircular: Codable, Identifiable {
    let id: String
    let number: String
    let title: String
    let status: String
    let issued: String
    let office: String
    let category: String
    let summary: String
    let relatedCfr: [String]
    let documentUrl: String
    let pdfUrl: String?
    let replaces: String?
    let tags: [String]
    let contentPath: String?
    let contentStatus: String?
    let pageCount: Int?
    let wordCount: Int?
    let contentUpdated: String?
}

struct AdvisoryCircularContent: Codable {
    let version: Int
    let id: String
    let number: String
    let title: String
    let status: String
    let fetched: String
    let documentUrl: String
    let pdfUrl: String
    let sha256: String
    let pageCount: Int
    let extractedPageCount: Int?
    let wordCount: Int
    let pages: [AdvisoryCircularPage]
}

struct AdvisoryCircularPage: Codable, Identifiable {
    var id: Int { page }
    let page: Int
    let text: String
}

struct AdvisoryCircularSearchDocument {
    let title: String
    let metadata: String
}

struct AdvisoryCircularSearchCandidate: Equatable {
    let documentID: Int
    let score: Double
    let isFullTextOnly: Bool
}

enum AdvisoryCircularSearchEngine {
    private static let stopWords: Set<String> = [
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
        "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
        "will", "with", "or", "this", "which", "not", "but", "can", "all", "any"
    ]

    static func tokens(for query: String) -> [String] {
        var seen = Set<String>()
        return query
            .lowercased()
            .replacingOccurrences(of: "[^\\w\\s]", with: "", options: .regularExpression)
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
            .filter { token in
                token.count > 2 &&
                !stopWords.contains(token) &&
                seen.insert(token).inserted
            }
    }

    static func candidates(
        for query: String,
        index: [String: [Int]],
        documents: [AdvisoryCircularSearchDocument],
        limit: Int = 50
    ) -> [AdvisoryCircularSearchCandidate] {
        let queryTokens = tokens(for: query)
        guard !queryTokens.isEmpty, !index.isEmpty, !documents.isEmpty, limit > 0 else {
            return []
        }

        struct TokenMatch {
            let token: String
            let documentIDs: Set<Int>
            let idf: Double
            let isExact: Bool
        }

        var tokenMatches: [TokenMatch] = []
        for token in queryTokens {
            let exactDocumentIDs = index[token]
            let isExact = exactDocumentIDs != nil
            var rawDocumentIDs = Set<Int>()

            if let exactDocumentIDs {
                rawDocumentIDs.formUnion(exactDocumentIDs)
            } else {
                for (indexedToken, documentIDs) in index where indexedToken.hasPrefix(token) {
                    rawDocumentIDs.formUnion(documentIDs)
                }
            }

            let documentIDs = Set(rawDocumentIDs.filter(documents.indices.contains))
            guard !documentIDs.isEmpty else { return [] }

            let idf = log(
                (Double(documents.count) + 1) /
                (Double(documentIDs.count) + 1)
            ) + 1
            tokenMatches.append(TokenMatch(
                token: token,
                documentIDs: documentIDs,
                idf: idf,
                isExact: isExact
            ))
        }

        guard var matchingDocumentIDs = tokenMatches.first?.documentIDs else { return [] }
        for tokenMatch in tokenMatches.dropFirst() {
            matchingDocumentIDs.formIntersection(tokenMatch.documentIDs)
            if matchingDocumentIDs.isEmpty { return [] }
        }

        return matchingDocumentIDs
            .map { documentID in
                let document = documents[documentID]
                let title = document.title.lowercased()
                let metadata = document.metadata.lowercased()
                let titleWords = Set(tokens(for: title))
                let metadataWords = Set(tokens(for: metadata))
                var score = 0.0

                for tokenMatch in tokenMatches {
                    let token = tokenMatch.token
                    let idf = tokenMatch.idf
                    score += idf * (tokenMatch.isExact ? 1.5 : 0.5)

                    if titleWords.contains(token) {
                        score += idf * 3
                    } else if title.contains(token) {
                        score += idf * 0.5
                    }

                    if metadataWords.contains(token) {
                        score += idf
                    } else if metadata.contains(token) {
                        score += idf * 0.2
                    }
                }

                return AdvisoryCircularSearchCandidate(
                    documentID: documentID,
                    score: score,
                    isFullTextOnly: queryTokens.contains { !metadata.contains($0) && !title.contains($0) }
                )
            }
            .sorted {
                if $0.score == $1.score {
                    return $0.documentID < $1.documentID
                }
                return $0.score > $1.score
            }
            .prefix(limit)
            .map { $0 }
    }
}

// MARK: - Source Status Models

struct SourceStatusData: Codable {
    let version: Int
    let generatedAt: String
    let appVersion: String
    let sources: [SourceStatusItem]
    let changeWatch: [SourceChangeWatch]
    let releaseNotes: [SourceReleaseNote]
    let limitations: [String]
    let nextChecks: [String]
}

struct SourceStatusItem: Codable, Identifiable {
    let id: String
    let label: String
    let shortLabel: String
    let source: String
    let status: String
    let lastUpdated: String
    let itemCount: Int?
    let sectionCount: Int?
    let questionCount: Int?
    let cardCount: Int?
    let coverage: String
    let officialUrl: String
    let notes: [String]
}

struct SourceReleaseNote: Codable, Identifiable {
    var id: String { "\(date)-\(title)" }
    let date: String
    let title: String
    let details: [String]
}

struct SourceChangeWatch: Codable, Identifiable {
    let id: String
    let date: String
    let sourceId: String
    let severity: String
    let title: String
    let summary: String
    let affectedReferences: [String]
    let actions: [String]
    let link: String
}
