//
//  DataService.swift
//  FARAIMPro
//
//  Service for loading and managing FAR/AIM data from bundled JSON files
//

import Foundation

// MARK: - Reading History
struct ReadingHistory: Codable {
    var type: String  // "aim" or "far"
    var identifier: String  // chapter number or part number
    var title: String
    var section: String?  // optional section for deeper navigation
    var timestamp: Date
}

struct StudyMark: Codable, Identifiable, Equatable {
    var id: String { key }
    let key: String
    let type: String
    let reference: String
    let title: String
    let route: String
    var saved: Bool
    var highlighted: Bool?
    var note: String
    var savedAt: Date?
    var reviewedAt: Date?
    var updatedAt: Date
}

struct StudyMarkInput {
    let type: String
    let reference: String
    let title: String
    let route: String

    var key: String { "\(type):\(reference)" }
}

struct StudyPackImportResult {
    let marksImported: Int
    let historyImported: Int
    let searchHistoryImported: Int
}

enum DataCatalog: String, Hashable {
    case far
    case aim
    case quizzes
    case flashcards
    case studyPaths
    case advisoryCirculars
    case sourceStatus
    case pcg
}

enum FigureAssetCatalog: String {
    case aim
    case far
}

enum DataLoadState: Equatable {
    case loading
    case loaded
    case failed(Set<DataCatalog>)
}

class DataService: ObservableObject {
    static let shared = DataService()

    @Published var farParts: [FARPart] = []
    @Published var farIndex: [FARIndexPart] = []
    @Published var aimChapters: [AIMChapter] = []
    @Published var aimIndex: [AIMIndexChapter] = []
    @Published var quizzes: [Quiz] = []
    @Published var flashcardDecks: [FlashcardDeck] = []
    @Published var studyPaths: [StudyPath] = []
    @Published var advisoryCirculars: [AdvisoryCircular] = []
    @Published var sourceStatus: SourceStatusData?
    @Published var pcgTerms: [PCGTerm] = []
    @Published var studyMarks: [StudyMark] = []
    @Published private(set) var searchHistory: [String] = []
    @Published private(set) var loadState = DataLoadState.loading

    private var failedCatalogs: Set<DataCatalog> = []
    private var advisoryCircularSearchIndex: [String: [Int]] = [:]
    private var advisoryCircularExactSearchIndex: [String: [Int]] = [:]
    private var advisoryCircularSearchIndexLoaded = false
    private let advisoryCircularSearchIndexLock = NSLock()
    private let catalogLock = NSLock()
    private let searchIndexLock = NSLock()
    private var isLoadingCatalogs = false
    private var catalogGeneration = 0
    private var catalogSnapshot = LoadedCatalogSnapshot.empty
    private var cachedSearchIndex: SearchIndexSnapshot?
    private var cachedSearchIndexGeneration = -1

    private struct SearchCorpusEntry {
        let type: String // "far", "aim", "pcg", "ac", "flashcard"
        let displayTitle: String
        let reference: String
        let link: String
        let snippetSource: String
        let lowercasedTitle: String
        let lowercasedDocument: String
        let farPartNumber: Int?
        let aimChapterNumber: Int?
        let acIndex: Int?
    }

    private struct SearchIndexSnapshot {
        let searchCorpus: [SearchCorpusEntry]
        let farEntriesByPart: [Int: [Int]]
        let aimEntriesByChapter: [Int: [Int]]
        let farHeaderByPart: [Int: String]
        let aimHeaderByChapter: [Int: String]
        let acSearchDocuments: [AdvisoryCircularSearchDocument]
    }

    private struct LoadedCatalogSnapshot {
        let farIndex: [FARIndexPart]
        let farParts: [FARPart]
        let aimIndex: [AIMIndexChapter]
        let aimChapters: [AIMChapter]
        let quizzes: [Quiz]
        let flashcardDecks: [FlashcardDeck]
        let studyPaths: [StudyPath]
        let advisoryCirculars: [AdvisoryCircular]
        let sourceStatus: SourceStatusData?
        let pcgTerms: [PCGTerm]
        let failedCatalogs: Set<DataCatalog>

        static let empty = LoadedCatalogSnapshot(
            farIndex: [],
            farParts: [],
            aimIndex: [],
            aimChapters: [],
            quizzes: [],
            flashcardDecks: [],
            studyPaths: [],
            advisoryCirculars: [],
            sourceStatus: nil,
            pcgTerms: [],
            failedCatalogs: []
        )
    }

    // Reading history
    @Published var aimReadingHistory: ReadingHistory?
    @Published var farReadingHistory: ReadingHistory?

    private let aimHistoryKey = "far-aim-pro-aim-reading-history"
    private let farHistoryKey = "far-aim-pro-far-reading-history"
    private let studyMarksKey = "far-aim-pro-study-marks"
    private let searchHistoryKey = "search_history"
    private let searchHistoryLimit = 10

    private init() {
        loadReadingHistory()
        loadStudyMarks()
        loadSearchHistory()
        startBackgroundCatalogLoad(resetPublishedBeforeLoad: false)
    }

    func loadAllData() {
        startBackgroundCatalogLoad(resetPublishedBeforeLoad: true)
    }

    func loadFailed(for catalog: DataCatalog) -> Bool {
        guard case .failed(let catalogs) = loadState else { return false }
        return catalogs.contains(catalog)
    }

    func retryLoading() {
        startBackgroundCatalogLoad(resetPublishedBeforeLoad: true)
    }

    private func startBackgroundCatalogLoad(resetPublishedBeforeLoad: Bool) {
        catalogLock.lock()
        if isLoadingCatalogs {
            catalogLock.unlock()
            return
        }
        isLoadingCatalogs = true
        catalogLock.unlock()

        advisoryCircularSearchIndexLock.lock()
        advisoryCircularSearchIndex = [:]
        advisoryCircularExactSearchIndex = [:]
        advisoryCircularSearchIndexLoaded = false
        advisoryCircularSearchIndexLock.unlock()

        let setLoadingState = { [weak self] in
            guard let self else { return }
            self.loadState = .loading
            if resetPublishedBeforeLoad {
                self.failedCatalogs = []
                self.farParts = []
                self.farIndex = []
                self.aimChapters = []
                self.aimIndex = []
                self.quizzes = []
                self.flashcardDecks = []
                self.studyPaths = []
                self.advisoryCirculars = []
                self.sourceStatus = nil
                self.pcgTerms = []
            }
        }
        if Thread.isMainThread {
            setLoadingState()
        } else {
            DispatchQueue.main.async(execute: setLoadingState)
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let snapshot = Self.buildCatalogSnapshot()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.catalogLock.lock()
                self.catalogSnapshot = snapshot
                self.catalogGeneration += 1
                self.isLoadingCatalogs = false
                self.catalogLock.unlock()

                self.searchIndexLock.lock()
                self.cachedSearchIndex = nil
                self.cachedSearchIndexGeneration = -1
                self.searchIndexLock.unlock()

                self.failedCatalogs = snapshot.failedCatalogs
                self.farIndex = snapshot.farIndex
                self.farParts = snapshot.farParts
                self.aimIndex = snapshot.aimIndex
                self.aimChapters = snapshot.aimChapters
                self.quizzes = snapshot.quizzes
                self.flashcardDecks = snapshot.flashcardDecks
                self.studyPaths = snapshot.studyPaths
                self.advisoryCirculars = snapshot.advisoryCirculars
                self.sourceStatus = snapshot.sourceStatus
                self.pcgTerms = snapshot.pcgTerms
                self.loadStudyMarks()
                self.loadState = snapshot.failedCatalogs.isEmpty ? .loaded : .failed(snapshot.failedCatalogs)
            }
        }
    }

    // MARK: - Reading History Methods

    private func loadReadingHistory() {
        if let data = UserDefaults.standard.data(forKey: aimHistoryKey),
           let history = try? JSONDecoder().decode(ReadingHistory.self, from: data) {
            aimReadingHistory = history
        }

        if let data = UserDefaults.standard.data(forKey: farHistoryKey),
           let history = try? JSONDecoder().decode(ReadingHistory.self, from: data) {
            farReadingHistory = history
        }
    }

    func saveAIMReadingHistory(chapter: Int, title: String, section: String? = nil) {
        let history = ReadingHistory(
            type: "aim",
            identifier: "\(chapter)",
            title: title,
            section: section,
            timestamp: Date()
        )
        aimReadingHistory = history
        if let data = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(data, forKey: aimHistoryKey)
        }
    }

    func saveFARReadingHistory(part: Int, title: String, section: String? = nil) {
        let history = ReadingHistory(
            type: "far",
            identifier: "\(part)",
            title: title,
            section: section,
            timestamp: Date()
        )
        farReadingHistory = history
        if let data = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(data, forKey: farHistoryKey)
        }
    }

    func clearAIMReadingHistory() {
        aimReadingHistory = nil
        UserDefaults.standard.removeObject(forKey: aimHistoryKey)
    }

    func clearFARReadingHistory() {
        farReadingHistory = nil
        UserDefaults.standard.removeObject(forKey: farHistoryKey)
    }

    // MARK: - Study Marks

    func loadStudyMarks() {
        guard let data = UserDefaults.standard.data(forKey: studyMarksKey),
              let marks = try? JSONDecoder().decode([StudyMark].self, from: data) else {
            studyMarks = []
            return
        }
        studyMarks = canonicalStudyMarks(marks)
        if studyMarks != marks {
            persistStudyMarks()
        }
    }

    private func canonicalStudyMark(_ mark: StudyMark) -> StudyMark {
        guard let route = normalizedRoute(for: mark.route, type: mark.type) else { return mark }
        let snapshot = currentSnapshot()
        var reference = mark.reference
        var section: String?
        let routeValue = String(route.dropFirst(mark.type.count + 1))
        let identifier = cleanIdentifier(routeValue)

        if mark.type == "far", let partNumber = Int(identifier),
           let part = snapshot.farParts.first(where: { $0.part == partNumber }) {
            let bareReference = reference.hasPrefix("§ ") ? String(reference.dropFirst(2)) : reference
            if let appendix = part.appendices?.first(where: { $0.appendix == bareReference }) {
                reference = appendix.appendix
                section = appendix.appendix
            } else {
                let sections = (part.sections ?? []) + (part.subparts ?? []).flatMap(\.sections)
                section = sections.first(where: { $0.section == bareReference })?.section
            }
        } else if mark.type == "aim", let chapterNumber = Int(identifier),
                  let chapter = snapshot.aimChapters.first(where: { $0.chapter == chapterNumber }) {
            let bareReference = reference.hasPrefix("AIM ") ? String(reference.dropFirst(4)) : reference
            section = chapter.sections.first(where: { $0.section == bareReference })?.section
        }

        let anchoredRoute = !route.contains("#") ? section.map { "\(route)#\($0)" } ?? route : route
        return StudyMark(
            key: "\(mark.type):\(reference)",
            type: mark.type,
            reference: reference,
            title: mark.title,
            route: anchoredRoute,
            saved: mark.saved,
            highlighted: mark.highlighted,
            note: mark.note,
            savedAt: mark.savedAt,
            reviewedAt: mark.reviewedAt,
            updatedAt: mark.updatedAt
        )
    }

    private func canonicalStudyMarks(_ marks: [StudyMark]) -> [StudyMark] {
        var byKey: [String: StudyMark] = [:]
        var canonicalKeys = Set<String>()
        var legacyKeys = Set<String>()
        for original in marks {
            let mark = canonicalStudyMark(original)
            let alreadyCanonical = original.key == mark.key
            if !alreadyCanonical { legacyKeys.insert(mark.key) }
            if let existing = byKey[mark.key] {
                let useIncoming = mark.updatedAt > existing.updatedAt ||
                    (mark.updatedAt == existing.updatedAt && alreadyCanonical && !canonicalKeys.contains(mark.key))
                var winner = useIncoming ? mark : existing
                if legacyKeys.contains(mark.key) {
                    winner = preservingAliasState(winner, other: useIncoming ? existing : mark)
                }
                byKey[mark.key] = winner
                if useIncoming {
                    if alreadyCanonical { canonicalKeys.insert(mark.key) } else { canonicalKeys.remove(mark.key) }
                }
            } else {
                byKey[mark.key] = mark
                if alreadyCanonical { canonicalKeys.insert(mark.key) }
            }
        }
        return byKey.values.sorted {
            $0.updatedAt == $1.updatedAt ? $0.key < $1.key : $0.updatedAt > $1.updatedAt
        }
    }

    private func preservingAliasState(_ winner: StudyMark, other: StudyMark) -> StudyMark {
        // Older builds split one appendix into separate records. Recover both records' study work once.
        var merged = winner
        merged.saved = winner.saved || other.saved
        merged.highlighted = winner.highlighted == true || other.highlighted == true
        merged.savedAt = [winner.savedAt, other.savedAt].compactMap { $0 }.min()
        merged.reviewedAt = [winner.reviewedAt, other.reviewedAt].compactMap { $0 }.max()
        if winner.note.isEmpty || other.note.contains(winner.note) {
            merged.note = other.note
        } else if !other.note.isEmpty && !winner.note.contains(other.note) {
            merged.note = "\(winner.note)\n\n\(other.note)"
        }
        return merged
    }

    func getStudyMark(_ input: StudyMarkInput) -> StudyMark? {
        studyMarks.first { $0.key == input.key }
    }

    func toggleSaved(_ input: StudyMarkInput) {
        upsertStudyMark(input) { mark in
            var next = mark
            next.saved.toggle()
            next.savedAt = next.saved ? Date() : nil
            return next
        }
    }

    func saveNote(_ input: StudyMarkInput, note: String) {
        upsertStudyMark(input) { mark in
            var next = mark
            next.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            return next
        }
    }

    func toggleHighlighted(_ input: StudyMarkInput) {
        upsertStudyMark(input) { mark in
            var next = mark
            next.highlighted = !(next.highlighted ?? false)
            return next
        }
    }

    func markReviewed(_ input: StudyMarkInput) {
        upsertStudyMark(input) { mark in
            var next = mark
            next.reviewedAt = Date()
            return next
        }
    }

    func removeStudyMark(key: String) {
        studyMarks.removeAll { $0.key == key }
        persistStudyMarks()
    }

    private func upsertStudyMark(_ input: StudyMarkInput, update: (StudyMark) -> StudyMark) {
        let existing = studyMarks.first { $0.key == input.key }
        let base = StudyMark(
            key: input.key,
            type: input.type,
            reference: input.reference,
            title: input.title,
            route: input.route,
            saved: existing?.saved ?? false,
            highlighted: existing?.highlighted ?? false,
            note: existing?.note ?? "",
            savedAt: existing?.savedAt,
            reviewedAt: existing?.reviewedAt,
            updatedAt: existing?.updatedAt ?? Date()
        )
        var next = update(base)
        next.updatedAt = Date()
        studyMarks.removeAll { $0.key == input.key }
        if next.saved || next.highlighted == true || !next.note.isEmpty || next.reviewedAt != nil {
            studyMarks.insert(next, at: 0)
        }
        studyMarks.sort { $0.updatedAt > $1.updatedAt }
        persistStudyMarks()
    }

    private func persistStudyMarks() {
        if let data = try? JSONEncoder().encode(studyMarks) {
            UserDefaults.standard.set(data, forKey: studyMarksKey)
        }
    }

    // MARK: - Study Pack Export / Import

    func createStudyPackJSON() -> String {
        var marks: [[String: Any]] = []
        for mark in studyMarks {
            var payload: [String: Any] = [
                "key": mark.key,
                "type": mark.type,
                "reference": mark.reference,
                "title": mark.title,
                "path": path(for: mark.route, type: mark.type),
                "saved": mark.saved,
                "highlighted": mark.highlighted ?? false,
                "note": mark.note,
                "updatedAt": milliseconds(mark.updatedAt)
            ]
            if let savedAt = milliseconds(mark.savedAt) {
                payload["savedAt"] = savedAt
            }
            if let reviewedAt = milliseconds(mark.reviewedAt) {
                payload["reviewedAt"] = reviewedAt
            }
            marks.append(payload)
        }
        let histories = [farReadingHistory, aimReadingHistory]
            .compactMap { $0 }
            .map { history in
                var payload: [String: Any] = [
                    "type": history.type,
                    "id": history.identifier,
                    "title": history.title,
                    "path": path(for: history),
                    "timestamp": milliseconds(history.timestamp)
                ]
                if let section = history.section {
                    payload["subtitle"] = section
                }
                return payload
            }
        let sortedHistories = histories.sorted {
            (($0["timestamp"] as? Int) ?? 0) > (($1["timestamp"] as? Int) ?? 0)
        }

        let pack: [String: Any] = [
            "schemaVersion": 1,
            "app": "FAR/AIM Pro",
            "exportedAt": ISO8601DateFormatter().string(from: Date()),
            "studyMarks": marks,
            "readingHistory": sortedHistories,
            "searchHistory": searchHistory
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: pack, options: [.prettyPrinted, .sortedKeys])
            return String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            return "{}"
        }
    }

    func importStudyPack(from url: URL) throws -> StudyPackImportResult {
        let shouldStopAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if shouldStopAccessing {
                url.stopAccessingSecurityScopedResource()
            }
        }

        let data = try Data(contentsOf: url)
        return try importStudyPackData(data)
    }

    private func importStudyPackData(_ data: Data) throws -> StudyPackImportResult {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              root["schemaVersion"] as? Int == 1,
              root["app"] as? String == "FAR/AIM Pro" else {
            throw NSError(
                domain: "FARAIMPro",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid FAR/AIM Pro study pack"]
            )
        }

        let incomingMarks = (root["studyMarks"] as? [[String: Any]] ?? [])
            .compactMap(normalizeStudyMark)
        mergeStudyMarks(incomingMarks)

        let incomingHistory = (root["readingHistory"] as? [[String: Any]] ?? [])
            .compactMap(normalizeHistory)
        importReadingHistory(incomingHistory)

        let incomingSearchHistory = normalizeSearchHistory(root["searchHistory"] as? [String] ?? [])
        searchHistory = normalizeSearchHistory(incomingSearchHistory + searchHistory)
        UserDefaults.standard.set(searchHistory, forKey: searchHistoryKey)
        return StudyPackImportResult(
            marksImported: incomingMarks.count,
            historyImported: incomingHistory.count,
            searchHistoryImported: incomingSearchHistory.count
        )
    }

    func recordSearch(_ query: String) {
        searchHistory = normalizeSearchHistory([query] + searchHistory)
        UserDefaults.standard.set(searchHistory, forKey: searchHistoryKey)
    }

    func clearSearchHistory() {
        searchHistory = []
        UserDefaults.standard.removeObject(forKey: searchHistoryKey)
    }

    private func loadSearchHistory() {
        searchHistory = normalizeSearchHistory(
            UserDefaults.standard.stringArray(forKey: searchHistoryKey) ?? []
        )
    }

    private func normalizeSearchHistory(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.compactMap { value in
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalized.isEmpty, seen.insert(normalized.lowercased()).inserted else {
                return nil
            }
            return normalized
        }.prefix(searchHistoryLimit).map { $0 }
    }

    private func normalizeStudyMark(_ value: [String: Any]) -> StudyMark? {
        guard let type = value["type"] as? String,
              ["far", "aim", "ac"].contains(type),
              let reference = value["reference"] as? String,
              !reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let title = value["title"] as? String,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let rawPath = (value["path"] as? String) ?? (value["route"] as? String),
              let normalizedRoute = normalizedRoute(for: rawPath, type: type),
              let updatedAt = dateFromMilliseconds(value["updatedAt"]) else {
            return nil
        }

        return StudyMark(
            key: "\(type):\(reference)",
            type: type,
            reference: reference,
            title: title,
            route: normalizedRoute,
            saved: value["saved"] as? Bool ?? false,
            highlighted: value["highlighted"] as? Bool ?? false,
            note: value["note"] as? String ?? "",
            savedAt: dateFromMilliseconds(value["savedAt"]),
            reviewedAt: dateFromMilliseconds(value["reviewedAt"]),
            updatedAt: updatedAt
        )
    }

    private func normalizeHistory(_ value: [String: Any]) -> ReadingHistory? {
        guard let type = value["type"] as? String,
              type == "far" || type == "aim",
              let title = value["title"] as? String,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let timestamp = dateFromMilliseconds(value["timestamp"]) else {
            return nil
        }
        let identifier = (value["id"] as? String)
            ?? identifier(from: value["path"] as? String ?? "", type: type)
        guard let identifier, Int(identifier) != nil else { return nil }

        return ReadingHistory(
            type: type,
            identifier: identifier,
            title: title,
            section: value["subtitle"] as? String,
            timestamp: timestamp
        )
    }

    private func mergeStudyMarks(_ incomingMarks: [StudyMark]) {
        var byKey = Dictionary(uniqueKeysWithValues: canonicalStudyMarks(studyMarks).map { ($0.key, $0) })
        let legacyKeys = Set(incomingMarks.compactMap { mark -> String? in
            let canonical = canonicalStudyMark(mark)
            return canonical.key != mark.key ? canonical.key : nil
        })
        for mark in canonicalStudyMarks(incomingMarks) {
            if let existing = byKey[mark.key] {
                let useIncoming = mark.updatedAt >= existing.updatedAt
                var winner = useIncoming ? mark : existing
                if legacyKeys.contains(mark.key) {
                    winner = preservingAliasState(winner, other: useIncoming ? existing : mark)
                }
                byKey[mark.key] = winner
            } else {
                byKey[mark.key] = mark
            }
        }
        studyMarks = byKey.values.sorted { $0.updatedAt > $1.updatedAt }
        persistStudyMarks()
    }

    private func importReadingHistory(_ histories: [ReadingHistory]) {
        let current = [farReadingHistory, aimReadingHistory].compactMap { $0 }
        let merged = histories + current

        if let latestFar = merged.filter({ $0.type == "far" }).max(by: { $0.timestamp < $1.timestamp }) {
            farReadingHistory = latestFar
            if let data = try? JSONEncoder().encode(latestFar) {
                UserDefaults.standard.set(data, forKey: farHistoryKey)
            }
        }

        if let latestAim = merged.filter({ $0.type == "aim" }).max(by: { $0.timestamp < $1.timestamp }) {
            aimReadingHistory = latestAim
            if let data = try? JSONEncoder().encode(latestAim) {
                UserDefaults.standard.set(data, forKey: aimHistoryKey)
            }
        }
    }

    private func path(for route: String, type: String) -> String {
        if route.hasPrefix("/") {
            return route
        }
        if route.hasPrefix("far:") || route.hasPrefix("aim:") {
            let isFAR = route.hasPrefix("far:")
            let prefix = isFAR ? "far:" : "aim:"
            let basePath = isFAR ? "/far/" : "/aim/"
            let remainder = String(route.dropFirst(prefix.count))
            let parts = remainder.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
            let identifier = String(parts[0])
            if parts.count == 2 {
                let rawFragment = String(parts[1])
                let unescaped = rawFragment.removingPercentEncoding ?? rawFragment
                if !unescaped.isEmpty,
                   let encoded = unescaped.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed) {
                    return "\(basePath)\(identifier)#\(encoded)"
                }
            }
            return "\(basePath)\(identifier)"
        }
        if route.hasPrefix("ac:") {
            return "/advisory-circulars/\(route.replacingOccurrences(of: "ac:", with: ""))"
        }
        if type == "ac" || route == "ac" {
            return "/advisory-circulars"
        }
        return "/"
    }

    private func path(for history: ReadingHistory) -> String {
        if history.type == "far" {
            return "/far/\(history.identifier)"
        }
        if history.type == "aim" {
            return "/aim/\(history.identifier)"
        }
        return "/"
    }

    private func normalizedRoute(for path: String, type: String) -> String? {
        if path.contains("..") || path.hasPrefix("//") || path.contains("://") || path.contains("\r") || path.contains("\n") {
            return nil
        }

        if type == "far" || type == "aim" {
            let routePrefix = "\(type):"
            let pathPrefix = "/\(type)/"
            let rawValue: String
            if path.hasPrefix(routePrefix) {
                rawValue = String(path.dropFirst(routePrefix.count))
            } else if path.hasPrefix(pathPrefix) {
                rawValue = String(path.dropFirst(pathPrefix.count))
            } else {
                return nil
            }
            let hashParts = rawValue.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
            let identifier = cleanIdentifier(String(hashParts[0]))
            guard Int(identifier) != nil else { return nil }
            if hashParts.count == 2 {
                let rawFragment = String(hashParts[1])
                let decodedFragment = (rawFragment.removingPercentEncoding ?? rawFragment)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !decodedFragment.isEmpty,
                   !decodedFragment.contains(".."),
                   !decodedFragment.contains("\r"),
                   !decodedFragment.contains("\n") {
                    return "\(type):\(identifier)#\(decodedFragment)"
                }
            }
            return "\(type):\(identifier)"
        }

        if path == "ac" || path == "/advisory-circulars" {
            return "ac"
        }
        let rawIdentifier: String
        if path.hasPrefix("ac:") {
            rawIdentifier = String(path.dropFirst(3))
        } else if path.hasPrefix("/advisory-circulars/") {
            rawIdentifier = String(path.dropFirst("/advisory-circulars/".count))
        } else if path.hasPrefix("/advisory-circulars#") {
            rawIdentifier = String(path.dropFirst("/advisory-circulars#".count))
        } else {
            return nil
        }
        let decodedIdentifier = rawIdentifier.removingPercentEncoding ?? rawIdentifier
        let identifier = cleanIdentifier(decodedIdentifier)
        guard !identifier.isEmpty, !identifier.contains("/") else { return nil }
        return "ac:\(identifier)"
    }

    private func identifier(from path: String, type: String) -> String? {
        let prefix = type == "far" ? "/far/" : "/aim/"
        let value = cleanIdentifier(path.replacingOccurrences(of: prefix, with: ""))
        return value.isEmpty ? nil : value
    }

    private func cleanIdentifier(_ value: String) -> String {
        let beforeHash = value.split(separator: "#", maxSplits: 1).first.map(String.init) ?? value
        return beforeHash.split(separator: "?", maxSplits: 1).first.map(String.init) ?? beforeHash
    }

    private func milliseconds(_ date: Date?) -> Int? {
        guard let date else { return nil }
        return Int(date.timeIntervalSince1970 * 1000)
    }

    private func milliseconds(_ date: Date) -> Int {
        Int(date.timeIntervalSince1970 * 1000)
    }

    private func dateFromMilliseconds(_ value: Any?) -> Date? {
        if let number = value as? NSNumber {
            let milliseconds = number.doubleValue
            guard milliseconds.isFinite, milliseconds >= 0 else { return nil }
            return Date(timeIntervalSince1970: milliseconds / 1000)
        }
        if let string = value as? String, let number = Double(string) {
            guard number.isFinite, number >= 0 else { return nil }
            return Date(timeIntervalSince1970: number / 1000)
        }
        return nil
    }

    // MARK: - JSON Loading Methods

    private static func loadJSON<T: Decodable>(
        from filename: String,
        as type: T.Type,
        decoder: JSONDecoder = JSONDecoder()
    ) -> T? {
        // Data is stored in Resources/data folder which is bundled as a folder reference
        let fullPath = "data/\(filename)"

        // Try direct path first (for folder reference)
        if let url = Bundle.main.url(forResource: fullPath, withExtension: "json") {
            do {
                let data = try Data(contentsOf: url)
                return try decoder.decode(T.self, from: data)
            } catch {
                print("Error loading \(filename).json: \(error)")
                return nil
            }
        }

        // Fall back to subdirectory search
        let components = filename.split(separator: "/")
        if components.count == 2 {
            let subdir = String(components[0])
            let name = String(components[1])
            if let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "data/\(subdir)") {
                do {
                    let data = try Data(contentsOf: url)
                    return try decoder.decode(T.self, from: data)
                } catch {
                    print("Error loading \(filename).json: \(error)")
                    return nil
                }
            }
        }

        print("Could not find \(filename).json in bundle")
        return nil
    }

    private func loadJSON<T: Decodable>(from filename: String, as type: T.Type) -> T? {
        Self.loadJSON(from: filename, as: type)
    }

    private static func buildCatalogSnapshot() -> LoadedCatalogSnapshot {
        var failedCatalogs: Set<DataCatalog> = []
        let decoder = JSONDecoder()

        let farIndex: [FARIndexPart]
        if let index: FARIndex = loadJSON(from: "far/index", as: FARIndex.self, decoder: decoder) {
            farIndex = index.parts.sorted { $0.part < $1.part }
        } else {
            farIndex = []
            failedCatalogs.insert(.far)
        }

        let indexedParts = farIndex.map(\.part).sorted()
        let fallbackParts = [1, 43, 61, 67, 71, 73, 91, 97, 119, 135, 830]
        let partNumbers = indexedParts.isEmpty ? fallbackParts : indexedParts
        var loadedFARParts: [FARPart] = []
        loadedFARParts.reserveCapacity(partNumbers.count)
        for partNum in partNumbers {
            if let part: FARPart = loadJSON(from: "far/part\(partNum)", as: FARPart.self, decoder: decoder) {
                loadedFARParts.append(part)
            }
        }
        let farParts = loadedFARParts.sorted { $0.part < $1.part }
        if farParts.count != partNumbers.count {
            failedCatalogs.insert(.far)
        }

        let aimIndex: [AIMIndexChapter]
        if let index: AIMIndex = loadJSON(from: "aim/index", as: AIMIndex.self, decoder: decoder) {
            aimIndex = index.chapters.sorted { $0.chapter < $1.chapter }
        } else {
            aimIndex = []
            failedCatalogs.insert(.aim)
        }

        let chapterNumbers = aimIndex.map(\.chapter)
        var loadedAIMChapters: [AIMChapter] = []
        loadedAIMChapters.reserveCapacity(chapterNumbers.count)
        for chapterNum in chapterNumbers {
            if let chapter: AIMChapter = loadJSON(from: "aim/chapter\(chapterNum)", as: AIMChapter.self, decoder: decoder) {
                loadedAIMChapters.append(chapter)
            }
        }
        let aimChapters = loadedAIMChapters.sorted { $0.chapter < $1.chapter }
        if aimChapters.count != chapterNumbers.count {
            failedCatalogs.insert(.aim)
        }

        let miscQuizFiles = ["quizzes/hard-challenge"]
        let farQuizFiles = [
            "quizzes/private-pilot-far",
            "quizzes/airspace-quiz",
            "quizzes/far-part43-maintenance",
            "quizzes/far-part61-certification",
            "quizzes/far-part67-medical",
            "quizzes/far-part91-operating-rules",
            "quizzes/far-part830-ntsb"
        ]
        let aimQuizFiles = [
            "quizzes/aim-chapter1-navigation",
            "quizzes/aim-chapter2-lighting-markings",
            "quizzes/aim-chapter4-atc",
            "quizzes/aim-chapter5-procedures",
            "quizzes/aim-chapter6-emergency",
            "quizzes/aim-chapter7-safety",
            "quizzes/aim-chapter8-medical",
            "quizzes/aim-chapter9-charts",
            "quizzes/aim-chapter10-helicopter",
            "quizzes/aim-chapter11-uas"
        ]
        let allQuizFiles = miscQuizFiles + farQuizFiles + aimQuizFiles
        var quizzes: [Quiz] = []
        quizzes.reserveCapacity(allQuizFiles.count)
        for file in allQuizFiles {
            if let quiz: Quiz = loadJSON(from: file, as: Quiz.self, decoder: decoder) {
                quizzes.append(quiz)
            }
        }
        if quizzes.count != allQuizFiles.count {
            failedCatalogs.insert(.quizzes)
        }

        let farFlashcardFiles = [
            "flashcards/far-definitions",
            "flashcards/airspace-requirements",
            "flashcards/far-part43-maintenance",
            "flashcards/far-part61-certification",
            "flashcards/far-part67-medical",
            "flashcards/far-part91-operating-rules",
            "flashcards/far-part830-ntsb"
        ]
        let aimFlashcardFiles = [
            "flashcards/aim-chapter1-navigation",
            "flashcards/aim-chapter2-lighting-markings",
            "flashcards/aim-chapter4-atc",
            "flashcards/aim-chapter5-procedures",
            "flashcards/aim-chapter6-emergency",
            "flashcards/aim-chapter7-safety",
            "flashcards/aim-chapter8-medical",
            "flashcards/aim-chapter9-charts",
            "flashcards/aim-chapter10-helicopter",
            "flashcards/aim-chapter11-uas"
        ]
        let allFlashcardFiles = farFlashcardFiles + aimFlashcardFiles
        var flashcardDecks: [FlashcardDeck] = []
        flashcardDecks.reserveCapacity(allFlashcardFiles.count)
        for file in allFlashcardFiles {
            if let deck: FlashcardDeck = loadJSON(from: file, as: FlashcardDeck.self, decoder: decoder) {
                flashcardDecks.append(deck)
            }
        }
        if flashcardDecks.count != allFlashcardFiles.count {
            failedCatalogs.insert(.flashcards)
        }

        let studyPaths: [StudyPath]
        if let data: StudyPathsData = loadJSON(from: "study-paths", as: StudyPathsData.self, decoder: decoder) {
            studyPaths = data.paths.filter { !$0.references.isEmpty }
        } else {
            studyPaths = []
            failedCatalogs.insert(.studyPaths)
        }

        let advisoryCirculars: [AdvisoryCircular]
        if let data: AdvisoryCircularsData = loadJSON(from: "advisory-circulars/index", as: AdvisoryCircularsData.self, decoder: decoder) {
            advisoryCirculars = data.items
        } else {
            advisoryCirculars = []
            failedCatalogs.insert(.advisoryCirculars)
        }

        let sourceStatus = loadJSON(from: "source-status", as: SourceStatusData.self, decoder: decoder)
        if sourceStatus == nil {
            failedCatalogs.insert(.sourceStatus)
        }

        let pcgTerms: [PCGTerm]
        if let pcg: PCGData = loadJSON(from: "aim/pcg", as: PCGData.self, decoder: decoder) {
            pcgTerms = pcg.terms
        } else {
            pcgTerms = []
            failedCatalogs.insert(.pcg)
        }

        return LoadedCatalogSnapshot(
            farIndex: farIndex,
            farParts: farParts,
            aimIndex: aimIndex,
            aimChapters: aimChapters,
            quizzes: quizzes,
            flashcardDecks: flashcardDecks,
            studyPaths: studyPaths,
            advisoryCirculars: advisoryCirculars,
            sourceStatus: sourceStatus,
            pcgTerms: pcgTerms,
            failedCatalogs: failedCatalogs
        )
    }

    private static func buildSearchIndexSnapshot(from snapshot: LoadedCatalogSnapshot) -> SearchIndexSnapshot {
        var searchCorpus: [SearchCorpusEntry] = []
        searchCorpus.reserveCapacity(8500)
        var farEntriesByPart: [Int: [Int]] = [:]
        var aimEntriesByChapter: [Int: [Int]] = [:]
        var farHeaderByPart: [Int: String] = [:]
        var aimHeaderByChapter: [Int: String] = [:]
        var acSearchDocuments: [AdvisoryCircularSearchDocument] = []
        acSearchDocuments.reserveCapacity(snapshot.advisoryCirculars.count)

        for part in snapshot.farParts {
            farHeaderByPart[part.part] = "far part \(part.part) \(part.cfr) \(part.title) \(part.subchapterTitle ?? "")".lowercased()
            var partEntryIndices: [Int] = []

            if let sections = part.sections {
                for section in sections {
                    let searchable = section.searchableText
                    let displayTitle = "§ \(section.section) \(section.title)"
                    let entryIndex = searchCorpus.count
                    searchCorpus.append(SearchCorpusEntry(
                        type: "far",
                        displayTitle: displayTitle,
                        reference: part.cfr,
                        link: "far/\(part.part)#\(section.section)",
                        snippetSource: searchable,
                        lowercasedTitle: displayTitle.lowercased(),
                        lowercasedDocument: "far part \(part.part) \(displayTitle) \(part.cfr) \(searchable)".lowercased(),
                        farPartNumber: part.part,
                        aimChapterNumber: nil,
                        acIndex: nil
                    ))
                    partEntryIndices.append(entryIndex)
                }
            }

            if let subparts = part.subparts {
                for subpart in subparts {
                    for section in subpart.sections {
                        let searchable = section.searchableText
                        let displayTitle = "§ \(section.section) \(section.title)"
                        let entryIndex = searchCorpus.count
                        searchCorpus.append(SearchCorpusEntry(
                            type: "far",
                            displayTitle: displayTitle,
                            reference: part.cfr,
                            link: "far/\(part.part)#\(section.section)",
                            snippetSource: searchable,
                            lowercasedTitle: displayTitle.lowercased(),
                            lowercasedDocument: "far part \(part.part) \(displayTitle) \(subpart.subpart) \(subpart.title) \(part.cfr) \(searchable)".lowercased(),
                            farPartNumber: part.part,
                            aimChapterNumber: nil,
                            acIndex: nil
                        ))
                        partEntryIndices.append(entryIndex)
                    }
                }
            }

            if let appendices = part.appendices {
                for appendix in appendices {
                    let searchable = appendix.searchableText
                    let displayTitle = appendix.title.isEmpty ? appendix.appendix : appendix.title
                    let entryIndex = searchCorpus.count
                    searchCorpus.append(SearchCorpusEntry(
                        type: "far",
                        displayTitle: displayTitle,
                        reference: part.cfr,
                        link: "far/\(part.part)#\(appendix.appendix)",
                        snippetSource: searchable,
                        lowercasedTitle: "\(appendix.appendix) \(appendix.title)".lowercased(),
                        lowercasedDocument: "far part \(part.part) \(appendix.appendix) \(appendix.title) \(part.cfr) \(searchable)".lowercased(),
                        farPartNumber: part.part,
                        aimChapterNumber: nil,
                        acIndex: nil
                    ))
                    partEntryIndices.append(entryIndex)
                }
            }

            farEntriesByPart[part.part] = partEntryIndices
        }

        for chapter in snapshot.aimChapters {
            let chapterLabel = formatAIMChapterLabel(chapter.chapter)
            aimHeaderByChapter[chapter.chapter] = "aim chapter \(chapter.chapter) \(chapterLabel) \(chapter.title)".lowercased()
            var chapterEntryIndices: [Int] = []

            for section in chapter.sections {
                let searchable = section.searchableText
                let displayTitle = "\(section.section) \(section.title)"
                let entryIndex = searchCorpus.count
                searchCorpus.append(SearchCorpusEntry(
                    type: "aim",
                    displayTitle: displayTitle,
                    reference: "AIM \(chapterLabel)",
                    link: "aim/\(chapter.chapter)#\(section.section)",
                    snippetSource: searchable,
                    lowercasedTitle: displayTitle.lowercased(),
                    lowercasedDocument: "\(displayTitle) aim \(chapterLabel) \(searchable)".lowercased(),
                    farPartNumber: nil,
                    aimChapterNumber: chapter.chapter,
                    acIndex: nil
                ))
                chapterEntryIndices.append(entryIndex)
            }

            aimEntriesByChapter[chapter.chapter] = chapterEntryIndices
        }

        for term in snapshot.pcgTerms {
            searchCorpus.append(SearchCorpusEntry(
                type: "pcg",
                displayTitle: term.term,
                reference: "Pilot/Controller Glossary",
                link: "glossary#\(term.term)",
                snippetSource: term.definition,
                lowercasedTitle: term.term.lowercased(),
                lowercasedDocument: "\(term.term) \(term.definition)".lowercased(),
                farPartNumber: nil,
                aimChapterNumber: nil,
                acIndex: nil
            ))
        }

        for deck in snapshot.flashcardDecks {
            for card in deck.cards {
                let combined = "\(card.back) \(card.reference) \(deck.title)"
                searchCorpus.append(SearchCorpusEntry(
                    type: "flashcard",
                    displayTitle: card.front,
                    reference: card.reference,
                    link: "flashcard_deck/\(deck.id)",
                    snippetSource: card.back,
                    lowercasedTitle: card.front.lowercased(),
                    lowercasedDocument: "\(card.front) \(combined)".lowercased(),
                    farPartNumber: nil,
                    aimChapterNumber: nil,
                    acIndex: nil
                ))
            }
        }

        for (acIndex, ac) in snapshot.advisoryCirculars.enumerated() {
            let displayTitle = "AC \(ac.number) \(ac.title)"
            let metadata = advisoryCircularSearchText(ac)
            acSearchDocuments.append(AdvisoryCircularSearchDocument(
                title: displayTitle,
                metadata: metadata
            ))
            searchCorpus.append(SearchCorpusEntry(
                type: "ac",
                displayTitle: displayTitle,
                reference: "FAA Advisory Circular",
                link: "advisory-circulars#\(ac.id)",
                snippetSource: metadata,
                lowercasedTitle: displayTitle.lowercased(),
                lowercasedDocument: "\(displayTitle) \(metadata)".lowercased(),
                farPartNumber: nil,
                aimChapterNumber: nil,
                acIndex: acIndex
            ))
        }

        return SearchIndexSnapshot(
            searchCorpus: searchCorpus,
            farEntriesByPart: farEntriesByPart,
            aimEntriesByChapter: aimEntriesByChapter,
            farHeaderByPart: farHeaderByPart,
            aimHeaderByChapter: aimHeaderByChapter,
            acSearchDocuments: acSearchDocuments
        )
    }

    private func currentSnapshotWithGeneration() -> (snapshot: LoadedCatalogSnapshot, generation: Int) {
        catalogLock.lock()
        defer { catalogLock.unlock() }
        return (catalogSnapshot, catalogGeneration)
    }

    private func currentSnapshot() -> LoadedCatalogSnapshot {
        currentSnapshotWithGeneration().snapshot
    }

    private func searchIndex(for snapshot: LoadedCatalogSnapshot, generation: Int) -> SearchIndexSnapshot {
        searchIndexLock.lock()
        if cachedSearchIndexGeneration == generation, let cached = cachedSearchIndex {
            searchIndexLock.unlock()
            return cached
        }
        searchIndexLock.unlock()

        let built = Self.buildSearchIndexSnapshot(from: snapshot)

        searchIndexLock.lock()
        defer { searchIndexLock.unlock() }
        if cachedSearchIndexGeneration == generation, let cached = cachedSearchIndex {
            return cached
        }
        cachedSearchIndex = built
        cachedSearchIndexGeneration = generation
        return built
    }

    private func loadedAdvisoryCircularSearchIndexes() -> (compact: [String: [Int]], exact: [String: [Int]]) {
        advisoryCircularSearchIndexLock.lock()
        defer { advisoryCircularSearchIndexLock.unlock() }
        if !advisoryCircularSearchIndexLoaded {
            advisoryCircularSearchIndex = Self.loadJSON(
                from: "search/inverted-index-ac",
                as: [String: [Int]].self
            ) ?? [:]
            advisoryCircularExactSearchIndex = Self.loadJSON(
                from: "search/inverted-index-ac-exact",
                as: [String: [Int]].self
            ) ?? [:]
            advisoryCircularSearchIndexLoaded = true
        }
        return (advisoryCircularSearchIndex, advisoryCircularExactSearchIndex)
    }

    private final class AdvisoryCircularContentBox: NSObject {
        let content: AdvisoryCircularContent
        init(_ content: AdvisoryCircularContent) { self.content = content }
    }

    private let advisoryCircularContentCache: NSCache<NSString, AdvisoryCircularContentBox> = {
        let cache = NSCache<NSString, AdvisoryCircularContentBox>()
        cache.countLimit = 24
        return cache
    }()

    func advisoryCircularContent(for advisoryCircular: AdvisoryCircular) -> AdvisoryCircularContent? {
        guard let contentPath = advisoryCircular.contentPath else { return nil }
        let cacheKey = contentPath as NSString
        if let cached = advisoryCircularContentCache.object(forKey: cacheKey) {
            return cached.content
        }
        let path = contentPath.hasSuffix(".json")
            ? String(contentPath.dropLast(5))
            : contentPath
        guard let loaded = Self.loadJSON(
            from: "advisory-circulars/\(path)",
            as: AdvisoryCircularContent.self
        ) else { return nil }
        advisoryCircularContentCache.setObject(AdvisoryCircularContentBox(loaded), forKey: cacheKey)
        return loaded
    }

    // MARK: - Helper Methods

    func getFARPart(byNumber part: Int) -> FARPart? {
        currentSnapshot().farParts.first { $0.part == part }
    }

    func getAIMChapter(byNumber chapter: Int) -> AIMChapter? {
        currentSnapshot().aimChapters.first { $0.chapter == chapter }
    }

    func filterFARParts(query: String) -> [FARPart] {
        let (snapshot, generation) = currentSnapshotWithGeneration()
        let parts = snapshot.farParts
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return parts }

        let index = searchIndex(for: snapshot, generation: generation)
        return parts.filter { part in
            if let header = index.farHeaderByPart[part.part],
               SearchQueryMatcher.matchesLowercased(lowerText: header, query: trimmed) {
                return true
            }
            guard let indices = index.farEntriesByPart[part.part] else { return false }
            for entryIdx in indices {
                if SearchQueryMatcher.matchesLowercased(lowerText: index.searchCorpus[entryIdx].lowercasedDocument, query: trimmed) {
                    return true
                }
            }
            return false
        }
    }

    func filterAIMChapters(query: String) -> [AIMChapter] {
        let (snapshot, generation) = currentSnapshotWithGeneration()
        let chapters = snapshot.aimChapters
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return chapters }

        let index = searchIndex(for: snapshot, generation: generation)
        return chapters.filter { chapter in
            if let header = index.aimHeaderByChapter[chapter.chapter],
               SearchQueryMatcher.matchesLowercased(lowerText: header, query: trimmed) {
                return true
            }
            guard let indices = index.aimEntriesByChapter[chapter.chapter] else { return false }
            for entryIdx in indices {
                if SearchQueryMatcher.matchesLowercased(lowerText: index.searchCorpus[entryIdx].lowercasedDocument, query: trimmed) {
                    return true
                }
            }
            return false
        }
    }

    func getQuizzesByCategory() -> (aim: [Quiz], far: [Quiz]) {
        let aimQuizzes = quizzes.filter { $0.category == "AIM" }.sorted { ($0.chapter ?? 0) < ($1.chapter ?? 0) }
        let farQuizzes = quizzes.filter { $0.category == "FAR" }.sorted { $0.title < $1.title }
        return (aim: aimQuizzes, far: farQuizzes)
    }

    func getFlashcardDecksByCategory() -> (aim: [FlashcardDeck], far: [FlashcardDeck]) {
        let aimDecks = flashcardDecks.filter { $0.category == "AIM" }.sorted { ($0.chapter ?? 0) < ($1.chapter ?? 0) }
        let farDecks = flashcardDecks.filter { $0.category == "FAR" }.sorted { $0.title < $1.title }
        return (aim: aimDecks, far: farDecks)
    }

    func getQuizForAIMChapter(_ chapter: Int) -> Quiz? {
        return quizzes.first { $0.category == "AIM" && $0.chapter == chapter }
    }

    func getFlashcardsForAIMChapter(_ chapter: Int) -> FlashcardDeck? {
        return flashcardDecks.first { $0.category == "AIM" && $0.chapter == chapter }
    }

    static func normalizedFigurePath(_ source: String) -> String? {
        let trimmed = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.hasPrefix("/"),
              !trimmed.contains("\\") else { return nil }

        let components = trimmed.split(separator: "/", omittingEmptySubsequences: false)
        guard !components.isEmpty,
              components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            return nil
        }
        return components.joined(separator: "/")
    }

    static func normalizedAIMFigurePath(_ source: String) -> String? {
        normalizedFigurePath(source)
    }

    static func normalizedFARFigurePath(_ source: String) -> String? {
        normalizedFigurePath(source)
    }

    func figureURL(for figure: AIMFigure, catalog: FigureAssetCatalog) -> URL? {
        guard let relativePath = Self.normalizedFigurePath(figure.src) else { return nil }

        for candidate in [
            "data/\(catalog.rawValue)/images/\(relativePath)",
            "data/\(catalog.rawValue)/\(relativePath)"
        ] {
            if let url = Bundle.main.url(forResource: candidate, withExtension: nil) {
                return url
            }

            let path = candidate as NSString
            if let url = Bundle.main.url(
                forResource: path.lastPathComponent,
                withExtension: nil,
                subdirectory: path.deletingLastPathComponent
            ) {
                return url
            }
        }
        return nil
    }

    func aimFigureURL(for figure: AIMFigure) -> URL? {
        figureURL(for: figure, catalog: .aim)
    }

    func farFigureURL(for figure: AIMFigure) -> URL? {
        figureURL(for: figure, catalog: .far)
    }

    func searchPCG(query: String) -> [PCGTerm] {
        let terms = currentSnapshot().pcgTerms
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else { return terms }

        func matchRank(_ term: PCGTerm) -> Int? {
            let label = term.term.lowercased()
            if label == normalizedQuery { return 0 }
            if label.hasPrefix(normalizedQuery) { return 1 }
            if label.contains(normalizedQuery) { return 2 }
            let definition = term.definition.lowercased()
            if definition.contains(normalizedQuery) { return 3 }
            if SearchQueryMatcher.matches(text: "\(label) \(definition)", query: normalizedQuery) {
                return 4
            }
            return nil
        }

        return terms
            .compactMap { term -> (PCGTerm, Int)? in
                guard let rank = matchRank(term) else { return nil }
                return (term, rank)
            }
            .sorted {
                if $0.1 != $1.1 {
                    return $0.1 < $1.1
                }
                return $0.0.term.localizedCaseInsensitiveCompare($1.0.term) == .orderedAscending
            }
            .map(\.0)
    }

    // MARK: - Global Search

    struct SearchResult: Identifiable {
        let id = UUID()
        let type: String // "far", "aim", "pcg", "ac", "flashcard"
        let title: String
        let content: String
        let reference: String
        let link: String
    }

    func search(query: String) -> [SearchResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }
        let lowercased = trimmed.lowercased()
        let tokens = SearchQueryMatcher.tokens(for: lowercased)
        guard !tokens.isEmpty else { return [] }

        let (snapshot, generation) = currentSnapshotWithGeneration()
        let searchIndex = searchIndex(for: snapshot, generation: generation)
        let corpus = searchIndex.searchCorpus
        guard !corpus.isEmpty else { return [] }

        enum ScoredPayload {
            case corpusEntry(SearchCorpusEntry)
            case advisoryCircular(AdvisoryCircular, isFullTextOnly: Bool)
        }
        struct ScoredCandidate {
            let payload: ScoredPayload
            let score: Double
        }
        var scoredCandidates: [ScoredCandidate] = []
        let totalDocs = Double(corpus.count)

        var docFrequency: [String: Int] = [:]
        for token in tokens {
            var count = 0
            for entry in corpus where SearchQueryMatcher.textContainsToken(entry.lowercasedDocument, token: token) {
                count += 1
            }
            docFrequency[token] = max(count, 1)
        }

        for entry in corpus where entry.acIndex == nil {
            let score = calculateTfIdfScore(
                lowercasedTitle: entry.lowercasedTitle,
                lowercasedDocument: entry.lowercasedDocument,
                tokens: tokens,
                docFrequency: docFrequency,
                totalDocs: totalDocs
            )
            if score > 0 {
                scoredCandidates.append(ScoredCandidate(payload: .corpusEntry(entry), score: score))
            }
        }

        // Search FAA Advisory Circulars using both the compact full-text index and metadata/number matching.
        let acSearchIndexes = loadedAdvisoryCircularSearchIndexes()
        var matchedACIndices = Set<Int>()
        if !acSearchIndexes.compact.isEmpty {
            let acCandidates = AdvisoryCircularSearchEngine.candidates(
                for: trimmed,
                index: acSearchIndexes.compact,
                documents: searchIndex.acSearchDocuments,
                exactIndex: acSearchIndexes.exact
            )
            for candidate in acCandidates where candidate.documentID >= 0 && candidate.documentID < snapshot.advisoryCirculars.count {
                let ac = snapshot.advisoryCirculars[candidate.documentID]
                matchedACIndices.insert(candidate.documentID)
                scoredCandidates.append(ScoredCandidate(
                    payload: .advisoryCircular(ac, isFullTextOnly: candidate.isFullTextOnly),
                    score: candidate.score
                ))
            }
        }

        for entry in corpus {
            guard let acIndex = entry.acIndex,
                  !matchedACIndices.contains(acIndex),
                  acIndex >= 0,
                  acIndex < snapshot.advisoryCirculars.count else {
                continue
            }
            let score = calculateTfIdfScore(
                lowercasedTitle: entry.lowercasedTitle,
                lowercasedDocument: entry.lowercasedDocument,
                tokens: tokens,
                docFrequency: docFrequency,
                totalDocs: totalDocs
            )
            if score > 0 {
                scoredCandidates.append(ScoredCandidate(payload: .corpusEntry(entry), score: score))
            }
        }

        // Retain top 50 per category (sorted by score) so category filter chips in SearchView
        // never vanish when one large catalog (e.g. FAR) dominates global top 50.
        let sortedCandidates = scoredCandidates.sorted { $0.score > $1.score }
        var perTypeCounts: [String: Int] = [:]
        var selectedCandidates: [ScoredCandidate] = []
        selectedCandidates.reserveCapacity(min(sortedCandidates.count, 150))
        for candidate in sortedCandidates {
            let typeKey: String
            switch candidate.payload {
            case .corpusEntry(let entry): typeKey = entry.type
            case .advisoryCircular: typeKey = "ac"
            }
            let count = perTypeCounts[typeKey, default: 0]
            if count < 50 {
                perTypeCounts[typeKey] = count + 1
                selectedCandidates.append(candidate)
            }
        }

        return selectedCandidates
            .map { candidate in
                switch candidate.payload {
                case .corpusEntry(let entry):
                    let snippet = generateContextualSnippet(entry.snippetSource, searchTerm: lowercased, tokens: tokens)
                    if let acIndex = entry.acIndex,
                       acIndex >= 0,
                       acIndex < snapshot.advisoryCirculars.count {
                        return advisoryCircularResult(snapshot.advisoryCirculars[acIndex], content: snippet)
                    }
                    return SearchResult(
                        type: entry.type,
                        title: entry.displayTitle,
                        content: snippet,
                        reference: entry.reference,
                        link: entry.link
                    )
                case .advisoryCircular(let ac, let isFullTextOnly):
                    let snippet = isFullTextOnly
                        ? "Full-text match in extracted circular. \(ac.summary)"
                        : generateContextualSnippet(Self.advisoryCircularSearchText(ac), searchTerm: lowercased, tokens: tokens)
                    return advisoryCircularResult(ac, content: snippet)
                }
            }
    }

    private func calculateTfIdfScore(
        lowercasedTitle: String,
        lowercasedDocument: String,
        tokens: [String],
        docFrequency: [String: Int],
        totalDocs: Double
    ) -> Double {
        var score = 0.0

        for token in tokens {
            guard SearchQueryMatcher.textContainsToken(lowercasedDocument, token: token) else {
                return 0.0
            }

            let tf = SearchQueryMatcher.countTokenOccurrences(lowercasedDocument, token: token)
            let tfNormalized = tf > 0 ? 1.0 + log(Double(tf)) : 0.0

            let df = max(docFrequency[token] ?? 1, 1)
            let idf = max(0.1, log(totalDocs / Double(df)))

            score += tfNormalized * idf

            if SearchQueryMatcher.textContainsWholeToken(lowercasedTitle, token: token) {
                score += idf * 3.0
            } else if token.count > 2 && lowercasedTitle.contains(token) {
                score += idf * 1.5
            }
        }

        if tokens.count > 1 {
            let joined = tokens.joined(separator: " ")
            if lowercasedTitle.contains(joined) {
                score += 6.0
            } else if lowercasedDocument.contains(joined) {
                score += 2.0
            }
        }

        return score
    }

    static func advisoryCircularSearchText(_ ac: AdvisoryCircular) -> String {
        [
            ac.summary,
            ac.category,
            ac.status,
            ac.office,
            ac.replaces ?? "",
            ac.relatedCfr.joined(separator: " "),
            ac.tags.joined(separator: " ")
        ].joined(separator: " ")
    }

    private func advisoryCircularResult(_ ac: AdvisoryCircular, content: String) -> SearchResult {
        SearchResult(
            type: "ac",
            title: "AC \(ac.number) \(ac.title)",
            content: content,
            reference: "FAA Advisory Circular",
            link: "advisory-circulars#\(ac.id)"
        )
    }

    private func findSnippetMatchRange(
        in content: String,
        searchTerm: String,
        tokens: [String]
    ) -> Range<String.Index>? {
        let candidates = [searchTerm] + tokens.filter { $0 != searchTerm }
        for candidate in candidates where !candidate.isEmpty {
            let requireBoundaries = SearchQueryMatcher.requiresTokenBoundaries(for: candidate)
            var searchRange = content.startIndex..<content.endIndex
            while let range = content.range(of: candidate, options: .caseInsensitive, range: searchRange) {
                if !requireBoundaries || SearchQueryMatcher.hasTokenBoundaries(in: content, range: range) {
                    return range
                }
                searchRange = range.upperBound..<content.endIndex
            }
        }
        return nil
    }

    /// Generate a contextual snippet that shows the search term or first matching token in context.
    private func generateContextualSnippet(
        _ content: String,
        searchTerm: String,
        tokens: [String] = [],
        maxLength: Int = 200
    ) -> String {
        guard !content.isEmpty else { return "" }

        guard let range = findSnippetMatchRange(in: content, searchTerm: searchTerm, tokens: tokens) else {
            if content.count > maxLength {
                let endIndex = content.index(content.startIndex, offsetBy: maxLength)
                return String(content[..<endIndex]) + "..."
            }
            return content
        }

        let matchStart = content.distance(from: content.startIndex, to: range.lowerBound)
        let matchLength = content.distance(from: range.lowerBound, to: range.upperBound)
        let halfLength = maxLength / 2

        var start = max(0, matchStart - halfLength)
        var end = min(content.count, matchStart + matchLength + halfLength)

        if start > 0 {
            let startIndex = content.index(content.startIndex, offsetBy: start)
            if let spaceRange = content[..<startIndex].range(of: " ", options: .backwards) {
                let spaceDistance = content.distance(from: content.startIndex, to: spaceRange.upperBound)
                if spaceDistance > start - 30 {
                    start = spaceDistance
                }
            }
        }

        if end < content.count {
            let endIndex = content.index(content.startIndex, offsetBy: end)
            if let spaceRange = content[endIndex...].range(of: " ") {
                let spaceDistance = content.distance(from: content.startIndex, to: spaceRange.lowerBound)
                if spaceDistance < end + 30 {
                    end = spaceDistance
                }
            }
        }

        let startIndex = content.index(content.startIndex, offsetBy: start)
        let endIndex = content.index(content.startIndex, offsetBy: end)
        var snippet = String(content[startIndex..<endIndex])

        if start > 0 {
            snippet = "..." + snippet
        }
        if end < content.count {
            snippet = snippet + "..."
        }

        return snippet
    }
}
