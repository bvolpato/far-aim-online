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
        exactIndex: [String: [Int]]? = nil,
        limit: Int = 50
    ) -> [AdvisoryCircularSearchCandidate] {
        let queryTokens = exactIndex == nil ? tokens(for: query) : SearchQueryMatcher.tokens(for: query)
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
            let requiresExactIndex = token.count <= 2 || token.contains(where: { $0 == "." || $0 == "-" || $0 == "/" })
            let tokenIndex = requiresExactIndex ? (exactIndex ?? index) : index
            let exactDocumentIDs = tokenIndex[token]
            let isExact = exactDocumentIDs != nil
            var rawDocumentIDs = Set<Int>()

            if let exactDocumentIDs {
                rawDocumentIDs.formUnion(exactDocumentIDs)
            } else if token.count > 2 {
                for (indexedToken, documentIDs) in tokenIndex
                where indexedToken.hasPrefix(token) && SearchQueryMatcher.textContainsToken(indexedToken, token: token) {
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
                let titleWords = Set(exactIndex == nil ? tokens(for: title) : SearchQueryMatcher.tokens(for: title))
                let metadataWords = Set(exactIndex == nil ? tokens(for: metadata) : SearchQueryMatcher.tokens(for: metadata))
                var score = 0.0

                for tokenMatch in tokenMatches {
                    let token = tokenMatch.token
                    let idf = tokenMatch.idf
                    score += idf * (tokenMatch.isExact ? 1.5 : 0.5)

                    if titleWords.contains(token) {
                        score += idf * 3
                    } else if SearchQueryMatcher.textContainsToken(title, token: token) {
                        score += idf * 0.5
                    }

                    if metadataWords.contains(token) {
                        score += idf
                    } else if SearchQueryMatcher.textContainsToken(metadata, token: token) {
                        score += idf * 0.2
                    }
                }

                return AdvisoryCircularSearchCandidate(
                    documentID: documentID,
                    score: score,
                    isFullTextOnly: queryTokens.contains {
                        !SearchQueryMatcher.textContainsToken(metadata, token: $0) &&
                            !SearchQueryMatcher.textContainsToken(title, token: $0)
                    }
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

// MARK: - Shared Search Query Matching

enum SearchQueryMatcher {
    static let stopWords: Set<String> = [
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
        "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
        "will", "with", "or", "this", "which", "not", "but", "can", "all", "any",
        "no", "so", "do", "if", "up"
    ]

    /// Extracts lowercase search tokens while preserving regulation identifiers
    /// (such as `61.57`, `4-3-2`, `61-98d`, `70/7460-1n`) and 2-character aviation terms (`da`, `cg`, `61`).
    static func tokens(for query: String) -> [String] {
        let lowercased = query.lowercased()
        let chars = Array(lowercased)
        var rawTokens: [String] = []
        var current = ""

        var index = 0
        while index < chars.count {
            let ch = chars[index]
            if isTokenAlphaNumeric(ch) {
                current.append(ch)
            } else if (ch == "." || ch == "-" || ch == "/") &&
                      !current.isEmpty &&
                      index + 1 < chars.count &&
                      isTokenAlphaNumeric(chars[index + 1]) {
                current.append(ch)
            } else if !current.isEmpty {
                rawTokens.append(current)
                current = ""
            }
            index += 1
        }
        if !current.isEmpty {
            rawTokens.append(current)
        }

        var filtered: [String] = []
        var seen = Set<String>()
        for token in rawTokens where token.count >= 2 && !stopWords.contains(token) {
            if seen.insert(token).inserted {
                filtered.append(token)
            }
        }

        if filtered.isEmpty {
            for token in rawTokens where token.count >= 2 {
                if seen.insert(token).inserted {
                    filtered.append(token)
                }
            }
        }

        return filtered
    }

    static func textContainsWholeToken(_ lowercasedText: String, token: String) -> Bool {
        guard !token.isEmpty else { return false }
        var searchRange = lowercasedText.startIndex..<lowercasedText.endIndex
        while let range = lowercasedText.range(of: token, range: searchRange) {
            if hasTokenBoundaries(in: lowercasedText, range: range) {
                return true
            }
            searchRange = range.upperBound..<lowercasedText.endIndex
        }
        return false
    }

    static func textContainsToken(_ lowercasedText: String, token: String) -> Bool {
        guard !token.isEmpty else { return false }
        if tokenRequiresBoundaries(token) {
            return textContainsWholeToken(lowercasedText, token: token)
        }
        return lowercasedText.contains(token)
    }

    static func countTokenOccurrences(_ lowercasedText: String, token: String) -> Int {
        guard !token.isEmpty else { return 0 }
        let requireBoundaries = tokenRequiresBoundaries(token)
        var count = 0
        var searchRange = lowercasedText.startIndex..<lowercasedText.endIndex
        while let range = lowercasedText.range(of: token, range: searchRange) {
            if !requireBoundaries || hasTokenBoundaries(in: lowercasedText, range: range) {
                count += 1
            }
            searchRange = range.upperBound..<lowercasedText.endIndex
        }
        return count
    }

    static func matches(text: String, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        let lowerText = text.lowercased()
        let lowerQuery = trimmed.lowercased()
        let queryTokens = tokens(for: lowerQuery)
        guard !queryTokens.isEmpty else {
            return lowerText.contains(lowerQuery)
        }
        if !queryTokens.contains(where: tokenRequiresBoundaries) && lowerText.contains(lowerQuery) {
            return true
        }
        return queryTokens.allSatisfy { textContainsToken(lowerText, token: $0) }
    }

    /// Applies to both individual tokens and the full phrases used for highlighting and snippets.
    static func requiresTokenBoundaries(for term: String) -> Bool {
        term.count <= 2 || tokens(for: term).contains(where: tokenRequiresBoundaries)
    }

    private static func tokenRequiresBoundaries(_ token: String) -> Bool {
        if token.count <= 2 { return true }
        guard token.first?.isNumber == true else { return false }

        // FAR and AIM section references identify complete sections. AC numbers such as
        // 61-65 and 70/7460-1 retain their revision-prefix matching behavior.
        let separator: Character = token.contains(".") ? "." : "-"
        let components = token.split(separator: separator, omittingEmptySubsequences: false)
        let expectedCount = separator == "." ? 2 : 3
        return components.count == expectedCount && components.allSatisfy {
            !$0.isEmpty && $0.allSatisfy(\.isNumber)
        }
    }

    static func highlightTerms(for query: String) -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return [] }

        var result: [String] = []
        var seen = Set<String>()
        if seen.insert(trimmed).inserted {
            result.append(trimmed)
        }
        for token in tokens(for: trimmed) where seen.insert(token).inserted {
            result.append(token)
        }
        return result
    }

    static func hasTokenBoundaries(in text: String, range: Range<String.Index>) -> Bool {
        if range.lowerBound > text.startIndex {
            let prev = text[text.index(before: range.lowerBound)]
            if isTokenAlphaNumeric(prev) { return false }
        }
        if range.upperBound < text.endIndex {
            let next = text[range.upperBound]
            if isTokenAlphaNumeric(next) { return false }
        }
        return true
    }

    private static func isTokenAlphaNumeric(_ character: Character) -> Bool {
        character.isLetter || character.isNumber
    }
}
