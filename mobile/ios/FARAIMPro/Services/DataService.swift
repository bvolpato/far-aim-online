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

struct StudyMark: Codable, Identifiable {
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
    private var advisoryCircularSearchIndexLoaded = false
    private let advisoryCircularSearchIndexLock = NSLock()

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
        DispatchQueue.main.async { [weak self] in
            self?.loadAllData()
        }
    }

    func loadAllData() {
        loadState = .loading
        failedCatalogs = []
        farParts = []
        farIndex = []
        aimChapters = []
        aimIndex = []
        quizzes = []
        flashcardDecks = []
        studyPaths = []
        advisoryCirculars = []
        advisoryCircularSearchIndexLock.lock()
        advisoryCircularSearchIndex = [:]
        advisoryCircularSearchIndexLoaded = false
        advisoryCircularSearchIndexLock.unlock()
        sourceStatus = nil
        pcgTerms = []

        loadFARIndex()
        loadFARParts()
        loadAIMIndex()
        loadAIMChapters()
        loadQuizzes()
        loadFlashcardDecks()
        loadStudyPaths()
        loadAdvisoryCirculars()
        loadSourceStatus()
        loadPCG()

        loadState = failedCatalogs.isEmpty ? .loaded : .failed(failedCatalogs)
    }

    func loadFailed(for catalog: DataCatalog) -> Bool {
        guard case .failed(let catalogs) = loadState else { return false }
        return catalogs.contains(catalog)
    }

    func retryLoading() {
        loadState = .loading
        DispatchQueue.main.async { [weak self] in
            self?.loadAllData()
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
        studyMarks = marks.sorted { $0.updatedAt > $1.updatedAt }
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
        var byKey = Dictionary(uniqueKeysWithValues: studyMarks.map { ($0.key, $0) })
        for mark in incomingMarks {
            if let existing = byKey[mark.key] {
                if mark.updatedAt >= existing.updatedAt {
                    byKey[mark.key] = mark
                }
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
        if route.hasPrefix("far:") {
            return "/far/\(route.replacingOccurrences(of: "far:", with: ""))"
        }
        if route.hasPrefix("aim:") {
            return "/aim/\(route.replacingOccurrences(of: "aim:", with: ""))"
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
        if path.contains("..") || path.hasPrefix("//") || path.contains("://") {
            return nil
        }

        if type == "far" || type == "aim" {
            let routePrefix = "\(type):"
            let pathPrefix = "/\(type)/"
            let rawIdentifier: String
            if path.hasPrefix(routePrefix) {
                rawIdentifier = String(path.dropFirst(routePrefix.count))
            } else if path.hasPrefix(pathPrefix) {
                rawIdentifier = String(path.dropFirst(pathPrefix.count))
            } else {
                return nil
            }
            let identifier = cleanIdentifier(rawIdentifier)
            guard Int(identifier) != nil else { return nil }
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
        } else {
            return nil
        }
        let identifier = cleanIdentifier(rawIdentifier)
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

    private func loadJSON<T: Decodable>(from filename: String, as type: T.Type) -> T? {
        // Data is stored in Resources/data folder which is bundled as a folder reference
        let fullPath = "data/\(filename)"

        // Try direct path first (for folder reference)
        if let url = Bundle.main.url(forResource: fullPath, withExtension: "json") {
            do {
                let data = try Data(contentsOf: url)
                let decoder = JSONDecoder()
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
                    let decoder = JSONDecoder()
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

    private func loadFARIndex() {
        if let index: FARIndex = loadJSON(from: "far/index", as: FARIndex.self) {
            farIndex = index.parts.sorted { $0.part < $1.part }
        } else {
            failedCatalogs.insert(.far)
        }
    }

    private func loadFARParts() {
        var parts: [FARPart] = []
        let indexedParts = farIndex.map { $0.part }.sorted()
        let fallbackParts = [1, 43, 61, 67, 71, 73, 91, 97, 119, 135, 830]
        let partNumbers = indexedParts.isEmpty ? fallbackParts : indexedParts

        for partNum in partNumbers {
            if let part: FARPart = loadJSON(from: "far/part\(partNum)", as: FARPart.self) {
                parts.append(part)
            }
        }

        farParts = parts.sorted { $0.part < $1.part }
        if farParts.count != partNumbers.count {
            failedCatalogs.insert(.far)
        }
    }

    private func loadAIMIndex() {
        if let index: AIMIndex = loadJSON(from: "aim/index", as: AIMIndex.self) {
            aimIndex = index.chapters.sorted { $0.chapter < $1.chapter }
        } else {
            failedCatalogs.insert(.aim)
        }
    }

    private func loadAIMChapters() {
        var chapters: [AIMChapter] = []

        let chapterNumbers = aimIndex.map { $0.chapter }
        for chapterNum in chapterNumbers {
            if let chapter: AIMChapter = loadJSON(from: "aim/chapter\(chapterNum)", as: AIMChapter.self) {
                chapters.append(chapter)
            }
        }

        aimChapters = chapters.sorted { $0.chapter < $1.chapter }
        if aimChapters.count != chapterNumbers.count {
            failedCatalogs.insert(.aim)
        }
    }

    private func loadQuizzes() {
        var allQuizzes: [Quiz] = []

        // Miscellaneous Quizzes (shown first)
        let miscQuizFiles = ["quizzes/hard-challenge"]

        // FAR Quizzes
        let farQuizFiles = [
            "quizzes/private-pilot-far",
            "quizzes/airspace-quiz",
            "quizzes/far-part43-maintenance",
            "quizzes/far-part61-certification",
            "quizzes/far-part67-medical",
            "quizzes/far-part91-operating-rules",
            "quizzes/far-part830-ntsb"
        ]

        // AIM Quizzes
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

        // Load miscellaneous first, then FAR, then AIM
        for file in miscQuizFiles + farQuizFiles + aimQuizFiles {
            if let quiz: Quiz = loadJSON(from: file, as: Quiz.self) {
                allQuizzes.append(quiz)
            }
        }

        quizzes = allQuizzes
        if quizzes.count != miscQuizFiles.count + farQuizFiles.count + aimQuizFiles.count {
            failedCatalogs.insert(.quizzes)
        }
    }

    private func loadFlashcardDecks() {
        var allDecks: [FlashcardDeck] = []

        // FAR Flashcards
        let farFlashcardFiles = [
            "flashcards/far-definitions",
            "flashcards/airspace-requirements",
            "flashcards/far-part43-maintenance",
            "flashcards/far-part61-certification",
            "flashcards/far-part67-medical",
            "flashcards/far-part91-operating-rules",
            "flashcards/far-part830-ntsb"
        ]

        // AIM Flashcards
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

        for file in farFlashcardFiles + aimFlashcardFiles {
            if let deck: FlashcardDeck = loadJSON(from: file, as: FlashcardDeck.self) {
                allDecks.append(deck)
            }
        }

        flashcardDecks = allDecks
        if flashcardDecks.count != farFlashcardFiles.count + aimFlashcardFiles.count {
            failedCatalogs.insert(.flashcards)
        }
    }

    private func loadStudyPaths() {
        if let data: StudyPathsData = loadJSON(from: "study-paths", as: StudyPathsData.self) {
            studyPaths = data.paths.filter { !$0.references.isEmpty }
        } else {
            failedCatalogs.insert(.studyPaths)
        }
    }

    private func loadAdvisoryCirculars() {
        if let data: AdvisoryCircularsData = loadJSON(from: "advisory-circulars/index", as: AdvisoryCircularsData.self) {
            advisoryCirculars = data.items
        } else {
            failedCatalogs.insert(.advisoryCirculars)
        }
    }

    private func loadedAdvisoryCircularSearchIndex() -> [String: [Int]] {
        advisoryCircularSearchIndexLock.lock()
        defer { advisoryCircularSearchIndexLock.unlock() }
        if !advisoryCircularSearchIndexLoaded {
            advisoryCircularSearchIndex = loadJSON(
                from: "search/inverted-index-ac",
                as: [String: [Int]].self
            ) ?? [:]
            advisoryCircularSearchIndexLoaded = true
        }
        return advisoryCircularSearchIndex
    }

    func advisoryCircularContent(for advisoryCircular: AdvisoryCircular) -> AdvisoryCircularContent? {
        guard let contentPath = advisoryCircular.contentPath else { return nil }
        let path = contentPath.hasSuffix(".json")
            ? String(contentPath.dropLast(5))
            : contentPath
        return loadJSON(
            from: "advisory-circulars/\(path)",
            as: AdvisoryCircularContent.self
        )
    }

    private func loadSourceStatus() {
        sourceStatus = loadJSON(from: "source-status", as: SourceStatusData.self)
        if sourceStatus == nil {
            failedCatalogs.insert(.sourceStatus)
        }
    }

    private func loadPCG() {
        if let pcg: PCGData = loadJSON(from: "aim/pcg", as: PCGData.self) {
            pcgTerms = pcg.terms
        } else {
            failedCatalogs.insert(.pcg)
        }
    }

    // MARK: - Helper Methods

    func getFARPart(byNumber part: Int) -> FARPart? {
        return farParts.first { $0.part == part }
    }

    func getAIMChapter(byNumber chapter: Int) -> AIMChapter? {
        return aimChapters.first { $0.chapter == chapter }
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
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else { return pcgTerms }

        func rank(_ term: PCGTerm) -> Int {
            let label = term.term.lowercased()
            if label == normalizedQuery { return 0 }
            if label.hasPrefix(normalizedQuery) { return 1 }
            if label.contains(normalizedQuery) { return 2 }
            return 3
        }

        return pcgTerms
            .filter {
                let label = $0.term.lowercased()
                let definition = $0.definition.lowercased()
                return label.contains(normalizedQuery) || definition.contains(normalizedQuery)
            }
            .sorted {
                let leftRank = rank($0)
                let rightRank = rank($1)
                if leftRank != rightRank {
                    return leftRank < rightRank
                }
                return $0.term.localizedCaseInsensitiveCompare($1.term) == .orderedAscending
            }
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
        guard !query.isEmpty, query.count >= 2 else { return [] }
        let lowercased = query.lowercased()
        let tokens = tokenize(lowercased)
        guard !tokens.isEmpty else { return [] }

        struct ScoredResult {
            let result: SearchResult
            let score: Double
        }
        var scoredResults: [ScoredResult] = []

        // Collect all documents for IDF calculation
        var allDocs: [(title: String, content: String)] = []

        for part in farParts {
            if let sections = part.sections {
                for section in sections {
                    allDocs.append((section.title, section.searchableText))
                }
            }
            if let subparts = part.subparts {
                for subpart in subparts {
                    for section in subpart.sections {
                        allDocs.append((section.title, section.searchableText))
                    }
                }
            }
            if let appendices = part.appendices {
                for appendix in appendices {
                    allDocs.append((appendix.title, appendix.searchableText))
                }
            }
        }
        for chapter in aimChapters {
            for section in chapter.sections {
                allDocs.append((section.title, section.searchableText))
            }
        }
        for term in pcgTerms {
            allDocs.append((term.term, term.definition))
        }
        for deck in flashcardDecks {
            for card in deck.cards {
                allDocs.append((card.front, "\(card.back) \(card.reference) \(deck.title)"))
            }
        }
        for ac in advisoryCirculars {
            allDocs.append(("AC \(ac.number) \(ac.title)", advisoryCircularSearchText(ac)))
        }

        let totalDocs = Double(allDocs.count)

        // Calculate document frequency for each token
        var docFrequency: [String: Int] = [:]
        for token in tokens {
            docFrequency[token] = allDocs.filter { doc in
                doc.title.lowercased().contains(token) || doc.content.lowercased().contains(token)
            }.count
        }

        // Search FAR with scoring
        for part in farParts {
            if let sections = part.sections {
                for section in sections {
                    let searchableText = section.searchableText
                    let score = calculateTfIdfScore(title: section.title, content: searchableText, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                    if score > 0 {
                        scoredResults.append(ScoredResult(
                            result: SearchResult(
                                type: "far",
                                title: "§ \(section.section) \(section.title)",
                                content: generateContextualSnippet(searchableText, searchTerm: lowercased),
                                reference: part.cfr,
                                link: "far/\(part.part)#\(section.section)"
                            ),
                            score: score
                        ))
                    }
                }
            }

            if let subparts = part.subparts {
                for subpart in subparts {
                    for section in subpart.sections {
                        let searchableText = section.searchableText
                        let score = calculateTfIdfScore(title: section.title, content: searchableText, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                        if score > 0 {
                            scoredResults.append(ScoredResult(
                                result: SearchResult(
                                    type: "far",
                                    title: "§ \(section.section) \(section.title)",
                                    content: generateContextualSnippet(searchableText, searchTerm: lowercased),
                                    reference: part.cfr,
                                    link: "far/\(part.part)#\(section.section)"
                                ),
                                score: score
                            ))
                        }
                    }
                }
            }
            if let appendices = part.appendices {
                for appendix in appendices {
                    let searchableText = appendix.searchableText
                    let score = calculateTfIdfScore(title: appendix.title, content: searchableText, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                    if score > 0 {
                        scoredResults.append(ScoredResult(
                            result: SearchResult(
                                type: "far",
                                title: appendix.title,
                                content: generateContextualSnippet(searchableText, searchTerm: lowercased),
                                reference: part.cfr,
                                link: "far/\(part.part)#\(appendix.appendix)"
                            ),
                            score: score
                        ))
                    }
                }
            }
        }

        // Search AIM with scoring
        for chapter in aimChapters {
            for section in chapter.sections {
                let content = section.searchableText
                let score = calculateTfIdfScore(title: section.title, content: content, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                if score > 0 {
                    scoredResults.append(ScoredResult(
                        result: SearchResult(
                            type: "aim",
                            title: "\(section.section) \(section.title)",
                            content: generateContextualSnippet(content, searchTerm: lowercased),
                            reference: "AIM \(formatAIMChapterLabel(chapter.chapter))",
                            link: "aim/\(chapter.chapter)#\(section.section)"
                        ),
                        score: score
                    ))
                }
            }
        }

        // Search PCG with scoring
        for term in pcgTerms {
            let score = calculateTfIdfScore(title: term.term, content: term.definition, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
            if score > 0 {
                scoredResults.append(ScoredResult(
                    result: SearchResult(
                        type: "pcg",
                        title: term.term,
                        content: generateContextualSnippet(term.definition, searchTerm: lowercased),
                        reference: "Pilot/Controller Glossary",
                        link: "glossary#\(term.term)"
                    ),
                    score: score
                ))
            }
        }

        for deck in flashcardDecks {
            for card in deck.cards {
                let content = "\(card.back) \(card.reference) \(deck.title)"
                let score = calculateTfIdfScore(title: card.front, content: content, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                if score > 0 {
                    scoredResults.append(ScoredResult(
                        result: SearchResult(
                            type: "flashcard",
                            title: card.front,
                            content: generateContextualSnippet(card.back, searchTerm: lowercased),
                            reference: card.reference,
                            link: "flashcard_deck/\(deck.id)"
                        ),
                        score: score
                    ))
                }
            }
        }

        // Search FAA Advisory Circulars using the compact full-text index when available.
        let acDocuments = advisoryCirculars.map {
            AdvisoryCircularSearchDocument(
                title: "AC \($0.number) \($0.title)",
                metadata: advisoryCircularSearchText($0)
            )
        }
        let acSearchIndex = loadedAdvisoryCircularSearchIndex()
        let acCandidates = AdvisoryCircularSearchEngine.candidates(
            for: query,
            index: acSearchIndex,
            documents: acDocuments
        )

        if acSearchIndex.isEmpty {
            for ac in advisoryCirculars {
                let content = advisoryCircularSearchText(ac)
                let score = calculateTfIdfScore(title: "AC \(ac.number) \(ac.title)", content: content, tokens: tokens, docFrequency: docFrequency, totalDocs: totalDocs)
                if score > 0 {
                    scoredResults.append(ScoredResult(
                        result: advisoryCircularResult(
                            ac,
                            content: generateContextualSnippet(content, searchTerm: lowercased)
                        ),
                        score: score
                    ))
                }
            }
        } else {
            for candidate in acCandidates {
                let ac = advisoryCirculars[candidate.documentID]
                let metadata = advisoryCircularSearchText(ac)
                let snippet = candidate.isFullTextOnly
                    ? "Full-text match in extracted circular. \(ac.summary)"
                    : generateContextualSnippet(metadata, searchTerm: lowercased)
                scoredResults.append(ScoredResult(
                    result: advisoryCircularResult(ac, content: snippet),
                    score: candidate.score
                ))
            }
        }

        // Sort by score descending and return top 50
        return scoredResults
            .sorted { $0.score > $1.score }
            .prefix(50)
            .map { $0.result }
    }

    /// Tokenize search query into individual terms
    private func tokenize(_ text: String) -> [String] {
        let stopWords: Set<String> = ["a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
            "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
            "were", "will", "with", "or", "this", "which", "not", "but", "can", "all", "any"]
        return text
            .replacingOccurrences(of: "[^\\w\\s]", with: "", options: .regularExpression)
            .split(separator: " ")
            .map { String($0) }
            .filter { $0.count > 2 && !stopWords.contains($0) }
    }

    /// Calculate TF-IDF score for a document
    private func calculateTfIdfScore(title: String, content: String, tokens: [String], docFrequency: [String: Int], totalDocs: Double) -> Double {
        let text = "\(title) \(content)".lowercased()
        var score = 0.0

        for token in tokens {
            // Must contain all tokens
            guard text.contains(token) else { return 0.0 }

            // Term frequency
            let tf = countOccurrences(text, term: token)
            let tfNormalized = tf > 0 ? 1 + log(Double(tf)) : 0.0

            // Inverse document frequency
            let df = docFrequency[token] ?? 1
            let idf = log(totalDocs / Double(df))

            score += tfNormalized * idf

            // Boost for title matches (2x weight)
            if title.lowercased().contains(token) {
                score += idf * 2
            }
        }

        return score
    }

    /// Count occurrences of a term in text
    private func countOccurrences(_ text: String, term: String) -> Int {
        var count = 0
        var searchRange = text.startIndex..<text.endIndex
        while let range = text.range(of: term, range: searchRange) {
            count += 1
            searchRange = range.upperBound..<text.endIndex
        }
        return count
    }

    private func advisoryCircularSearchText(_ ac: AdvisoryCircular) -> String {
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

    /// Generate a contextual snippet that shows the search term in context.
    /// Finds the first occurrence of the search term and extracts surrounding text.
    private func generateContextualSnippet(_ content: String, searchTerm: String, maxLength: Int = 200) -> String {
        guard !content.isEmpty else { return "" }

        let lowerContent = content.lowercased()
        guard let range = lowerContent.range(of: searchTerm) else {
            // If no match found, return the beginning of the content
            if content.count > maxLength {
                let endIndex = content.index(content.startIndex, offsetBy: maxLength)
                return String(content[..<endIndex]) + "..."
            }
            return content
        }

        // Calculate snippet bounds - center around the match
        let matchStart = lowerContent.distance(from: lowerContent.startIndex, to: range.lowerBound)
        let halfLength = maxLength / 2

        var start = max(0, matchStart - halfLength)
        var end = min(content.count, matchStart + searchTerm.count + halfLength)

        // Adjust to not cut words - find word boundaries
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

        // Add ellipsis if truncated
        if start > 0 {
            snippet = "..." + snippet
        }
        if end < content.count {
            snippet = snippet + "..."
        }

        return snippet
    }
}
