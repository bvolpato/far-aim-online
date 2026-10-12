//
//  ContentView.swift
//  FARAIMPro
//
//  Main content view with tab navigation
//

import SwiftUI
import UniformTypeIdentifiers

enum AviationTheme {
    static let ink = Color(red: 0.035, green: 0.102, blue: 0.172)
    static let accent = Color(red: 0.0, green: 0.45, blue: 0.71)
    static let sky = Color(red: 0.12, green: 0.68, blue: 0.86)
    static let mint = Color(red: 0.20, green: 0.68, blue: 0.58)
    static let amber = Color(red: 0.91, green: 0.58, blue: 0.18)
    static let background = Color(.systemGroupedBackground)
    static let surface = Color(.secondarySystemGroupedBackground)
    static let raisedSurface = Color(.systemBackground)
    static let border = Color.primary.opacity(0.08)
    static let heroGradient = LinearGradient(
        colors: [ink, Color(red: 0.02, green: 0.27, blue: 0.42)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct AircraftMark: View {
    var size: CGFloat = 56
    var foregroundColor: Color = .white

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AviationTheme.accent, AviationTheme.sky],
                        startPoint: .bottomLeading,
                        endPoint: .topTrailing
                    )
                )

            Image(systemName: "airplane")
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(foregroundColor)
                .rotationEffect(.degrees(-45))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

extension View {
    func aviationScreen() -> some View {
        self
            .background(AviationTheme.background.ignoresSafeArea())
            .tint(AviationTheme.accent)
    }
}

struct ExternalDestination: Identifiable {
    let id = UUID()
    let route: String
    let query: String
}

struct ContentView: View {
    @State private var selectedTab = 0
    @State private var externalDestination: ExternalDestination?
    @ObservedObject private var dataService = DataService.shared
    @Environment(\.horizontalSizeClass) var horizontalSizeClass
    @AppStorage("appTheme") private var appTheme: String = "system"
    private let launchRoute: String?
    private let launchQuery: String

    init() {
        let route = Self.launchArgumentValue("--initial-route")
        self.launchRoute = route
        self.launchQuery = Self.launchArgumentValue("--initial-query") ?? ""
        _selectedTab = State(initialValue: Self.initialSelectedTab(for: route))
    }

    private var selectedColorScheme: ColorScheme? {
        switch appTheme {
        case "light":
            return .light
        case "dark":
            return .dark
        default:
            return nil
        }
    }

    var body: some View {
        // Use different tab layouts for iPhone vs iPad
        // iPad (regular width) shows direct tabs for all primary surfaces.
        // iPhone (compact width) shows 5 tabs with More containing overflow tools.
        Group {
            if let launchRoute {
                NavigationStack {
                    launchDestination(for: launchRoute)
                }
            } else if horizontalSizeClass == .regular {
                // iPad: Show all navigation options
                TabView(selection: $selectedTab) {
                    NavigationStack {
                        HomeView()
                    }
                    .tabItem {
                        Label("Home", systemImage: "house.fill")
                    }
                    .tag(0)

                    NavigationStack {
                        FARListView()
                    }
                    .tabItem {
                        Label("FAR", systemImage: "doc.text.fill")
                    }
                    .tag(1)

                    NavigationStack {
                        AIMListView()
                    }
                    .tabItem {
                        Label("AIM", systemImage: "book.fill")
                    }
                    .tag(2)

                    NavigationStack {
                        StudyView()
                    }
                    .tabItem {
                        Label("Study", systemImage: "graduationcap.fill")
                    }
                    .tag(3)

                    NavigationStack {
                        AdvisoryCircularsView()
                    }
                    .tabItem {
                        Label("ACs", systemImage: "doc.badge.gearshape.fill")
                    }
                    .tag(4)

                    NavigationStack {
                        GlossaryView()
                    }
                    .tabItem {
                        Label("Glossary", systemImage: "text.book.closed.fill")
                    }
                    .tag(5)

                    NavigationStack {
                        SearchView(initialSearchText: searchInitialText)
                    }
                    .tabItem {
                        Label("Search", systemImage: "magnifyingglass")
                    }
                    .tag(6)
                }
                .tint(AviationTheme.accent)
            } else {
                // iPhone: Use More menu for overflow
                TabView(selection: $selectedTab) {
                    NavigationStack {
                        HomeView()
                    }
                    .tabItem {
                        Label("Home", systemImage: "house.fill")
                    }
                    .tag(0)

                    NavigationStack {
                        FARListView()
                    }
                    .tabItem {
                        Label("FAR", systemImage: "doc.text.fill")
                    }
                    .tag(1)

                    NavigationStack {
                        AIMListView()
                    }
                    .tabItem {
                        Label("AIM", systemImage: "book.fill")
                    }
                    .tag(2)

                    NavigationStack {
                        StudyView()
                    }
                    .tabItem {
                        Label("Study", systemImage: "graduationcap.fill")
                    }
                    .tag(3)

                    NavigationStack {
                        MoreView()
                    }
                    .tabItem {
                        Label("More", systemImage: "ellipsis.circle.fill")
                    }
                    .tag(4)
                }
                .tint(AviationTheme.accent)
            }
        }
        .preferredColorScheme(selectedColorScheme)
        .onOpenURL { url in
            externalDestination = Self.externalDestination(for: url)
        }
        .sheet(item: $externalDestination) { destination in
            NavigationStack {
                launchDestination(for: destination.route, query: destination.query)
            }
        }
    }

    private var searchInitialText: String {
        launchRoute == "search" ? launchQuery : ""
    }

    @ViewBuilder
    private func launchDestination(for route: String, query: String? = nil) -> some View {
        switch route {
        case "home":
            HomeView()
        case "far":
            FARListView()
        case "far-part-61":
            if let part = DataService.shared.farParts.first(where: { $0.part == 61 }) {
                FARPartDetailView(part: part)
            } else {
                FARListView()
            }
        case "aim":
            AIMListView()
        case "study":
            StudyView()
        case "more":
            MoreView()
        case "advisory-circulars":
            AdvisoryCircularsView()
        case "updates":
            SourceStatusView()
        case "glossary":
            GlossaryView()
        case "search":
            SearchView(initialSearchText: query ?? searchInitialText)
        default:
            if route.hasPrefix("far:") {
                let target = String(route.dropFirst(4))
                let partNumber = Int(target.split(separator: "#", maxSplits: 1).first ?? "")
                let section = target.split(separator: "#", maxSplits: 1).dropFirst().first.map(String.init)
                if let partNumber,
                   let part = dataService.farParts.first(where: { $0.part == partNumber }) {
                    FARPartDetailView(part: part, initialSection: section)
                } else {
                    FARListView()
                }
            } else if route.hasPrefix("aim:") {
                let target = String(route.dropFirst(4))
                let chapterNumber = Int(target.split(separator: "#", maxSplits: 1).first ?? "")
                let section = target.split(separator: "#", maxSplits: 1).dropFirst().first.map(String.init)
                if let chapterNumber,
                   let chapter = dataService.aimChapters.first(where: { $0.chapter == chapterNumber }) {
                    AIMChapterDetailView(chapter: chapter, initialSection: section)
                } else {
                    AIMListView()
                }
            } else if route.hasPrefix("ac:") {
                let identifier = String(route.dropFirst(3))
                if let circular = dataService.advisoryCirculars.first(where: { $0.id == identifier }) {
                    AdvisoryCircularReaderView(ac: circular, initialSearchText: query ?? "")
                } else {
                    AdvisoryCircularsView(initialSearchText: query ?? "")
                }
            } else if route.hasPrefix("glossary:") {
                GlossaryView(initialTerm: String(route.dropFirst(9)))
            } else {
                HomeView()
            }
        }
    }

    static func externalDestination(for url: URL) -> ExternalDestination? {
        let isWebsite = url.scheme == "https" && url.host == "faraim.online"
        guard url.scheme == "faraimpro" || isWebsite else { return nil }

        var segments = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "faraimpro", let host = url.host {
            segments.insert(host, at: 0)
        }
        guard let surface = segments.first else {
            return ExternalDestination(route: "home", query: "")
        }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "q" || $0.name == "query" })?
            .value ?? ""
        let section = url.fragment?.removingPercentEncoding

        switch surface {
        case "far":
            guard let identifier = segments.dropFirst().first,
                  Int(identifier) != nil else {
                return ExternalDestination(route: "far", query: query)
            }
            return ExternalDestination(
                route: "far:\(identifier)" + (section.map { "#\($0)" } ?? ""),
                query: query
            )
        case "aim":
            guard let identifier = segments.dropFirst().first,
                  Int(identifier) != nil else {
                return ExternalDestination(route: "aim", query: query)
            }
            return ExternalDestination(
                route: "aim:\(identifier)" + (section.map { "#\($0)" } ?? ""),
                query: query
            )
        case "advisory-circulars":
            guard let identifier = segments.dropFirst().first,
                  identifier.range(of: "^[A-Za-z0-9._~%+-]+$", options: .regularExpression) != nil else {
                return ExternalDestination(route: "advisory-circulars", query: query)
            }
            return ExternalDestination(route: "ac:\(identifier)", query: query)
        case "glossary":
            return ExternalDestination(
                route: section.map { "glossary:\($0)" } ?? "glossary",
                query: query
            )
        case "search":
            return ExternalDestination(route: "search", query: query)
        default:
            return nil
        }
    }

    private static func launchArgumentValue(_ name: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: name) else { return nil }
        let valueIndex = arguments.index(after: index)
        guard valueIndex < arguments.endIndex else { return nil }
        return arguments[valueIndex]
    }

    private static func initialSelectedTab(for route: String?) -> Int {
        switch route {
        case "far":
            return 1
        case "aim":
            return 2
        case "study":
            return 3
        case "advisory-circulars":
            return 4
        case "glossary":
            return 5
        case "search":
            return 6
        default:
            return 0
        }
    }
}

// MARK: - Study View

struct StudyView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var importingStudyPack = false
    @State private var studyPackStatus: String?

    var body: some View {
        let reviewQueue = dataService.studyMarks
            .filter { $0.saved || $0.highlighted == true || !$0.note.isEmpty || $0.reviewedAt != nil }
            .prefix(6)
        let savedCount = dataService.studyMarks.filter { $0.saved }.count
        let highlightedCount = dataService.studyMarks.filter { $0.highlighted == true }.count
        let notesCount = dataService.studyMarks.filter { !$0.note.isEmpty }.count
        let reviewedCount = dataService.studyMarks.filter { $0.reviewedAt != nil }.count

        ScrollView {
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("CHECKRIDE PREP")
                                .font(.caption.weight(.bold))
                                .tracking(1.5)
                                .foregroundStyle(AviationTheme.sky)
                            Text("Train with purpose.")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Follow a certificate path or sharpen one topic at a time.")
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.72))
                        }

                        Spacer()

                        Image(systemName: "airplane.departure")
                            .font(.system(size: 30, weight: .semibold))
                            .foregroundStyle(.white)
                    }

                    Divider()
                        .overlay(.white.opacity(0.18))

                    HStack(spacing: 16) {
                        VStack {
                            Text("\(dataService.quizzes.count)")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Quizzes")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.68))
                        }
                        .frame(maxWidth: .infinity)
                        VStack {
                            Text("\(dataService.quizzes.reduce(0) { $0 + $1.questionCount })")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Questions")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.68))
                        }
                        .frame(maxWidth: .infinity)
                        VStack {
                            Text("\(dataService.flashcardDecks.reduce(0) { $0 + $1.cardCount })")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Cards")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.68))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(22)
                .background(AviationTheme.heroGradient)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal)

                // Certificate Study Paths
                VStack(alignment: .leading, spacing: 12) {
                    Text("Certificate Paths")
                        .font(.headline)
                        .padding(.horizontal)

                    if dataService.studyPaths.isEmpty {
                        LibraryCollectionStateView(
                            catalog: .studyPaths,
                            title: "Study Paths",
                            systemImage: "map",
                            minHeight: 240
                        )
                    } else {
                        LibraryLoadErrorBanner(catalog: .studyPaths)
                            .padding(.horizontal)

                        ForEach(dataService.studyPaths) { path in
                            StudyPathCard(path: path)
                                .padding(.horizontal)
                        }
                    }
                }

                // Saved Study Queue
                VStack(alignment: .leading, spacing: 12) {
                    Text("Saved & Notes")
                        .font(.headline)
                        .padding(.horizontal)

                    HStack(spacing: 8) {
                        StudyStatBadge(label: "Saved", value: savedCount)
                        StudyStatBadge(label: "Marked", value: highlightedCount)
                        StudyStatBadge(label: "Notes", value: notesCount)
                        StudyStatBadge(label: "Reviewed", value: reviewedCount)
                    }
                    .padding(.horizontal)

                    HStack(spacing: 8) {
                        Button {
                            importingStudyPack = true
                        } label: {
                            Label("Import pack", systemImage: "square.and.arrow.down")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        ShareLink(item: dataService.createStudyPackJSON()) {
                            Label("Export pack", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.horizontal)

                    if let studyPackStatus {
                        Text(studyPackStatus)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                    }

                    if reviewQueue.isEmpty {
                        NavigationLink(destination: FARListView()) {
                            HStack {
                                Image(systemName: "bookmark")
                                    .font(.title2)
                                    .foregroundColor(.white)
                                    .frame(width: 50, height: 50)
                                    .background(AviationTheme.ink)
                                    .cornerRadius(12)

                                VStack(alignment: .leading) {
                                    Text("Build review queue")
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    Text("Save FAR, AIM, or AC references, add notes, and mark them reviewed.")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .background(AviationTheme.raisedSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(AviationTheme.border, lineWidth: 1)
                            }
                        }
                        .padding(.horizontal)
                    } else {
                        ForEach(Array(reviewQueue)) { mark in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text(mark.reference)
                                        .font(.caption)
                                        .fontWeight(.semibold)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.blue.opacity(0.12))
                                        .foregroundColor(.blue)
                                        .cornerRadius(8)

                                    if mark.reviewedAt != nil {
                                        Label("reviewed", systemImage: "checkmark.circle.fill")
                                            .font(.caption)
                                            .foregroundColor(.green)
                                    }
                                    if mark.highlighted == true {
                                        Label("highlighted", systemImage: "star.fill")
                                            .font(.caption)
                                            .foregroundColor(.yellow)
                                    }
                                }

                                NavigationLink(destination: destination(for: mark)) {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(mark.title)
                                                .font(.subheadline)
                                                .fontWeight(.semibold)
                                                .foregroundColor(.primary)
                                            if !mark.note.isEmpty {
                                                Text(mark.note)
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.secondary)
                                    }
                                }

                                HStack {
                                    Button {
                                        dataService.markReviewed(StudyMarkInput(
                                            type: mark.type,
                                            reference: mark.reference,
                                            title: mark.title,
                                            route: mark.route
                                        ))
                                    } label: {
                                        Label("Review", systemImage: "checkmark.circle")
                                    }
                                    .buttonStyle(.bordered)

                                    Button(role: .destructive) {
                                        dataService.removeStudyMark(key: mark.key)
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                            .padding()
                            .background(AviationTheme.raisedSurface)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(AviationTheme.border, lineWidth: 1)
                            }
                            .padding(.horizontal)
                        }
                    }
                }

                // Quizzes Section
                VStack(alignment: .leading, spacing: 12) {
                    Text("Practice Quizzes")
                        .font(.headline)
                        .padding(.horizontal)

                    NavigationLink(destination: QuizListView()) {
                        HStack {
                            Image(systemName: "brain.head.profile")
                                .font(.title2)
                                .foregroundColor(.white)
                                .frame(width: 50, height: 50)
                                .background(AviationTheme.accent)
                                .cornerRadius(12)

                            VStack(alignment: .leading) {
                                Text("All Quizzes")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text("\(dataService.quizzes.count) quizzes available")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .background(AviationTheme.raisedSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(AviationTheme.border, lineWidth: 1)
                        }
                    }
                    .padding(.horizontal)
                }

                // Flashcards Section
                VStack(alignment: .leading, spacing: 12) {
                    Text("Flashcards")
                        .font(.headline)
                        .padding(.horizontal)

                    NavigationLink(destination: FlashcardListView()) {
                        HStack {
                            Image(systemName: "square.stack.fill")
                                .font(.title2)
                                .foregroundColor(.white)
                                .frame(width: 50, height: 50)
                                .background(AviationTheme.amber)
                                .cornerRadius(12)

                            VStack(alignment: .leading) {
                                Text("All Flashcard Decks")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text("\(dataService.flashcardDecks.count) decks available")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .background(AviationTheme.raisedSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(AviationTheme.border, lineWidth: 1)
                        }
                    }
                    .padding(.horizontal)
                }

                // Quick Start
                VStack(alignment: .leading, spacing: 12) {
                    Text("Quick Start")
                        .font(.headline)
                        .padding(.horizontal)

                    ForEach(dataService.quizzes.prefix(3), id: \.id) { quiz in
                        NavigationLink(destination: QuizDetailView(quiz: quiz)) {
                            HStack {
                                Image(systemName: "play.fill")
                                    .foregroundColor(.blue)

                                VStack(alignment: .leading) {
                                    Text(quiz.title)
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    Text("\(quiz.questionCount) questions")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .cornerRadius(12)
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .padding(.vertical)
        }
        .navigationTitle("Study")
        .navigationBarTitleDisplayMode(.large)
        .aviationScreen()
        .fileImporter(isPresented: $importingStudyPack, allowedContentTypes: [.json, .plainText]) { result in
            switch result {
            case .success(let url):
                do {
                    let importResult = try dataService.importStudyPack(from: url)
                    studyPackStatus = "\(importResult.marksImported) marks imported"
                } catch {
                    studyPackStatus = "Import failed"
                }
            case .failure:
                studyPackStatus = "Import failed"
            }
        }
    }

    @ViewBuilder
    private func destination(for mark: StudyMark) -> some View {
        let parts = mark.route.split(separator: ":")
        if parts.count == 2,
           String(parts[0]) == "far",
           let partId = Int(String(parts[1])),
           let part = dataService.getFARPart(byNumber: partId) {
            FARPartDetailView(part: part, initialSection: sectionIdentifier(for: mark))
        } else if parts.count == 2,
                  String(parts[0]) == "aim",
                  let chapterId = Int(String(parts[1])),
                  let chapter = dataService.getAIMChapter(byNumber: chapterId) {
            AIMChapterDetailView(chapter: chapter, initialSection: sectionIdentifier(for: mark))
        } else if parts.count == 2,
                  String(parts[0]) == "ac",
                  let circular = dataService.advisoryCirculars.first(where: {
                      $0.id == String(parts[1])
                  }), circular.contentPath != nil {
            AdvisoryCircularReaderView(ac: circular)
        } else if mark.type == "ac" || mark.route == "ac" {
            AdvisoryCircularsView()
        } else {
            Text("Reference unavailable")
        }
    }

    private func sectionIdentifier(for mark: StudyMark) -> String? {
        switch mark.type {
        case "far":
            return mark.reference.replacingOccurrences(of: "§", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        case "aim":
            return mark.reference.replacingOccurrences(of: "AIM", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        default:
            return nil
        }
    }
}

struct StudyPathCard: View {
    @ObservedObject var dataService = DataService.shared
    let path: StudyPath
    @State private var showsAllResources = false

    private var quizzes: [Quiz] {
        path.quizIds.compactMap { id in dataService.quizzes.first { $0.id == id } }
    }

    private var decks: [FlashcardDeck] {
        path.flashcardDeckIds.compactMap { id in dataService.flashcardDecks.first { $0.id == id } }
    }

    private var visibleReferences: [StudyPathReference] {
        Array(path.references.prefix(showsAllResources ? path.references.count : 3))
    }

    private var visibleQuizzes: [Quiz] {
        Array(quizzes.prefix(showsAllResources ? quizzes.count : 1))
    }

    private var visibleDecks: [FlashcardDeck] {
        Array(decks.prefix(showsAllResources ? decks.count : 1))
    }

    private var resourceCount: Int {
        path.references.count + quizzes.count + decks.count
    }

    private var visibleResourceCount: Int {
        visibleReferences.count + visibleQuizzes.count + visibleDecks.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "map.fill")
                    .font(.title3)
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(AviationTheme.ink)
                    .cornerRadius(12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(path.category)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.blue)
                    Text(path.title)
                        .font(.headline)
                    Text(path.subtitle)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }

            Text(path.description)
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 8) {
                StudyPathStatBadge(label: "Refs", value: path.references.count)
                StudyPathStatBadge(label: "Quizzes", value: path.quizIds.count)
                StudyPathStatBadge(label: "Decks", value: path.flashcardDeckIds.count)
            }

            ForEach(visibleReferences) { reference in
                NavigationLink(destination: destination(for: reference)) {
                    studyPathResourceRow(
                        eyebrow: "REFERENCE",
                        title: reference.label,
                        detail: reference.title,
                        icon: "book.closed"
                    )
                }
            }

            ForEach(visibleQuizzes) { quiz in
                NavigationLink(destination: QuizDetailView(quiz: quiz)) {
                    studyPathResourceRow(
                        eyebrow: "QUIZ",
                        title: quiz.title,
                        detail: "\(quiz.questionCount) questions",
                        icon: "checkmark.seal"
                    )
                }
            }

            ForEach(visibleDecks) { deck in
                NavigationLink(destination: FlashcardStudyView(deck: deck)) {
                    studyPathResourceRow(
                        eyebrow: "FLASHCARDS",
                        title: deck.title,
                        detail: "\(deck.cardCount) cards",
                        icon: "rectangle.on.rectangle.angled"
                    )
                }
            }

            if visibleResourceCount < resourceCount {
                Button {
                    withAnimation { showsAllResources = true }
                } label: {
                    Label("View all \(resourceCount) resources", systemImage: "chevron.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            } else if resourceCount > 5 {
                Button {
                    withAnimation { showsAllResources = false }
                } label: {
                    Label("Show less", systemImage: "chevron.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }

    private func studyPathResourceRow(
        eyebrow: String,
        title: String,
        detail: String,
        icon: String
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundColor(AviationTheme.accent)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow)
                    .font(.caption2.weight(.bold))
                    .foregroundColor(AviationTheme.accent)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                Text(detail)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func destination(for reference: StudyPathReference) -> some View {
        if reference.type == "far",
           let partId = reference.part,
           let part = dataService.getFARPart(byNumber: partId) {
            FARPartDetailView(part: part)
        } else if reference.type == "aim",
                  let chapterId = reference.chapter,
                  let chapter = dataService.getAIMChapter(byNumber: chapterId) {
            AIMChapterDetailView(chapter: chapter)
        } else {
            Text("Reference unavailable")
        }
    }
}

struct StudyPathStatBadge: View {
    let label: String
    let value: Int

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.headline)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(10)
    }
}

struct StudyStatBadge: View {
    let label: String
    let value: Int

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.headline)
                .fontWeight(.bold)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - Advisory Circulars View

private enum AdvisoryCircularSortOrder: String, CaseIterable, Identifiable {
    case newest = "Newest issued"
    case oldest = "Oldest issued"
    case number = "AC number"
    case title = "Title A-Z"

    var id: String { rawValue }
}

struct AdvisoryCircularsView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var searchText = ""
    @State private var sortOrder = AdvisoryCircularSortOrder.newest
    @State private var filteredCirculars: [AdvisoryCircular] = []

    init(initialSearchText: String = "") {
        _searchText = State(initialValue: initialSearchText)
    }

    private func updateFilteredCirculars() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matches: [AdvisoryCircular]

        if query.isEmpty {
            matches = dataService.advisoryCirculars
        } else {
            matches = dataService.advisoryCirculars.filter { ac in
                [
                    ac.number,
                    ac.title,
                    ac.summary,
                    ac.category,
                    ac.office,
                    ac.status,
                    ac.replaces ?? "",
                    ac.relatedCfr.joined(separator: " "),
                    ac.tags.joined(separator: " ")
                ].contains { $0.lowercased().contains(query) }
            }
        }

        filteredCirculars = matches.sorted { left, right in
            switch sortOrder {
            case .newest:
                return left.issued == right.issued ? left.number < right.number : left.issued > right.issued
            case .oldest:
                return left.issued == right.issued ? left.number < right.number : left.issued < right.issued
            case .number:
                return left.number.localizedStandardCompare(right.number) == .orderedAscending
            case .title:
                let comparison = left.title.localizedCaseInsensitiveCompare(right.title)
                return comparison == .orderedSame ? left.number < right.number : comparison == .orderedAscending
            }
        }
    }

    var body: some View {
        Group {
            if dataService.advisoryCirculars.isEmpty {
                LibraryCollectionStateView(
                    catalog: .advisoryCirculars,
                    title: "Advisory Circulars",
                    systemImage: "doc.badge.gearshape"
                )
            } else {
                List {
            if dataService.loadFailed(for: .advisoryCirculars) {
                Section {
                    LibraryLoadErrorBanner(catalog: .advisoryCirculars)
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("FAA guidance library", systemImage: "doc.badge.gearshape.fill")
                        .font(.headline)
                        .foregroundColor(AviationTheme.accent)
                    Text("\(dataService.advisoryCirculars.count) current FAA Advisory Circular records with official FAA pages and PDF links where published.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 6)
            }

            Section("\(filteredCirculars.count) advisory circulars") {
                ForEach(filteredCirculars) { ac in
                    AdvisoryCircularRow(ac: ac)
                }
            }
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Advisory Circulars")
        .searchable(text: $searchText, prompt: "Search forms, records, service difficulty")
        .scrollContentBackground(.hidden)
        .aviationScreen()
        .onAppear {
            updateFilteredCirculars()
        }
        .onChange(of: searchText) {
            updateFilteredCirculars()
        }
        .onChange(of: sortOrder) {
            updateFilteredCirculars()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort", selection: $sortOrder) {
                        ForEach(AdvisoryCircularSortOrder.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                } label: {
                    Label(sortOrder.rawValue, systemImage: "arrow.up.arrow.down")
                }
            }
        }
    }
}

struct AdvisoryCircularRow: View {
    let ac: AdvisoryCircular
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("AC \(ac.number)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(AviationTheme.accent.opacity(0.12))
                    .foregroundColor(AviationTheme.accent)
                    .cornerRadius(8)

                Text(ac.status)
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text(ac.issued)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    
                Spacer()
                
                Button(action: { withAnimation { isExpanded.toggle() } }) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                        .padding(4)
                }
            }

            if ac.contentPath != nil {
                NavigationLink(destination: AdvisoryCircularReaderView(ac: ac)) {
                    Text(ac.title)
                        .font(.headline)
                        .foregroundStyle(.tint)
                }
                .buttonStyle(.plain)
            } else {
                Text(ac.title)
                    .font(.headline)
            }

            Text("\(ac.category) · \(ac.office)")
                .font(.caption)
                .foregroundColor(.secondary)

            Text(ac.summary)
                .font(.subheadline)
                .foregroundColor(.secondary)

            if isExpanded {
                StudyMarkTools(input: StudyMarkInput(
                    type: "ac",
                    reference: "AC \(ac.number)",
                    title: ac.title,
                    route: "ac:\(ac.id)"
                ))

                if !ac.relatedCfr.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(ac.relatedCfr, id: \.self) { reference in
                                Text(reference)
                                    .font(.caption)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(.secondarySystemBackground))
                                    .cornerRadius(8)
                            }
                        }
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        if let documentUrl = URL(string: ac.documentUrl) {
                            Link(destination: documentUrl) {
                                Label("FAA page", systemImage: "arrow.up.right.square")
                            }
                            .buttonStyle(.bordered)
                        }

                        if let pdfUrl = ac.pdfUrl, let url = URL(string: pdfUrl) {
                            Link(destination: url) {
                                Label("PDF", systemImage: "doc.text")
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .font(.caption)
            }
        }
        .padding(.vertical, 6)
    }
}

struct AdvisoryCircularReaderView: View {
    let ac: AdvisoryCircular
    @State private var searchText = ""
    @State private var content: AdvisoryCircularContent?
    @State private var finishedLoading = false
    @State private var loadAttempt = 0
    @AppStorage("far-aim-pro-reader-font-scale-index") private var readerFontScaleIndex = 1
    @AppStorage("far-aim-pro-reader-density") private var readerDensityRawValue = ReaderDensity.standard.rawValue
    @State private var showReaderControls = false

    init(ac: AdvisoryCircular, initialSearchText: String = "") {
        self.ac = ac
        _searchText = State(initialValue: initialSearchText)
    }

    private var pages: [AdvisoryCircularPage] {
        guard let content else { return [] }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if query.isEmpty { return content.pages }
        let tokens = AdvisoryCircularSearchEngine.tokens(for: query)
        return content.pages.filter { page in
            let text = page.text.lowercased()
            if tokens.isEmpty { return text.contains(query) }
            return tokens.contains { text.contains($0) }
        }
    }

    private func highlightQuery(in text: String) -> String {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercasedText = text.lowercased()
        if lowercasedText.contains(query.lowercased()) { return query }
        return AdvisoryCircularSearchEngine.tokens(for: query)
            .first { lowercasedText.contains($0) } ?? query
    }

    private var officialURL: URL? {
        URL(string: ac.documentUrl)
    }

    private func pageSummary(for content: AdvisoryCircularContent) -> String {
        if content.status == "partial" {
            return "\(content.extractedPageCount ?? content.pages.count) of \(content.pageCount) pages extracted · \(content.wordCount) words"
        }
        return "\(content.pageCount) pages · \(content.wordCount) words"
    }

    var body: some View {
        let readerPreferences = ReaderPreferences(
            fontScaleIndex: readerFontScaleIndex,
            density: ReaderDensity(rawValue: readerDensityRawValue) ?? .standard
        )

        Group {
            if let content {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(ac.title)
                                .font(.title2.bold())
                            Text(ac.summary)
                                .foregroundColor(.secondary)
                            Text(searchText.isEmpty
                                 ? pageSummary(for: content)
                                 : "\(pages.count) matching pages")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            if content.status == "partial" {
                                Label(
                                    "Extracted text is incomplete. Use official FAA PDF for omitted pages, figures, tables, and source formatting.",
                                    systemImage: "exclamationmark.triangle.fill"
                                )
                                .font(.footnote)
                                .foregroundStyle(.orange)
                            }
                        }

                        if content.pages.isEmpty {
                            ContentUnavailableView(
                                "Offline text unavailable",
                                systemImage: "doc.text.magnifyingglass",
                                description: Text("Use official FAA PDF for this document.")
                            )
                        } else if pages.isEmpty {
                            ContentUnavailableView.search(text: searchText)
                        } else {
                            ForEach(pages) { page in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Page \(page.page)")
                                        .font(.caption.weight(.semibold))
                                        .foregroundColor(AviationTheme.accent)
                                        .id(page.page)
                                    HighlightText(text: page.text, query: highlightQuery(in: page.text))
                                        .font(readerPreferences.bodyFont)
                                        .lineSpacing(readerPreferences.lineSpacing)
                                        .textSelection(.enabled)
                                    Divider()
                                }
                            }
                        }
                    }
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .searchable(text: $searchText, prompt: "Find in this Advisory Circular")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button(action: { showReaderControls.toggle() }) {
                            Text("Aa")
                                .font(.title3.weight(.medium))
                        }
                        .popover(isPresented: $showReaderControls) {
                            VStack {
                                ReaderControls(
                                    fontScaleIndex: $readerFontScaleIndex,
                                    densityRawValue: $readerDensityRawValue
                                )
                                .padding()
                            }
                            .frame(width: 320)
                            .presentationCompactAdaptation(.popover)
                        }

                        if let officialURL {
                            Link(destination: officialURL) {
                                Image(systemName: "arrow.up.right.square")
                            }
                        }
                        if let url = URL(string: content.pdfUrl) {
                            Link(destination: url) {
                                Image(systemName: "doc.text")
                            }
                        }
                    }
                }
            } else if finishedLoading {
                VStack(spacing: 16) {
                    ContentUnavailableView(
                        "Couldn’t Load Offline Text",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Bundled Advisory Circular text could not be read.")
                    )
                    Button("Retry") {
                        finishedLoading = false
                        loadAttempt += 1
                    }
                    .buttonStyle(.borderedProminent)
                    if let officialURL {
                        Link(destination: officialURL) {
                            Label("Open FAA page", systemImage: "arrow.up.right.square")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            } else {
                ProgressView("Loading Advisory Circular")
            }
        }
        .navigationTitle("AC \(ac.number)")
        .navigationBarTitleDisplayMode(.inline)
        .aviationScreen()
        .task(id: "\(ac.id)-\(loadAttempt)") {
            content = await Task.detached(priority: .userInitiated) {
                DataService.shared.advisoryCircularContent(for: ac)
            }.value
            finishedLoading = true
        }
    }
}

// MARK: - More View

struct MoreView: View {
    @AppStorage("appTheme") private var appTheme: String = "system"
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
            ?? "Unknown"
    }
    private var buildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
            ?? "Unknown"
    }

    var body: some View {
        List {
            Section("Tools") {
                NavigationLink(destination: GlossaryView()) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Glossary")
                                .font(.body)
                            Text("Pilot/Controller terminology")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "text.book.closed.fill")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

                NavigationLink(destination: SearchView()) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Search")
                                .font(.body)
                            Text("Search FAR, AIM, and more")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

                NavigationLink(destination: AdvisoryCircularsView()) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Advisory Circulars")
                                .font(.body)
                            Text("FAA guidance and forms")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "doc.badge.gearshape.fill")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

                NavigationLink(destination: SourceStatusView()) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Data Updates")
                                .font(.body)
                            Text("Source dates and release coverage")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

                Link(destination: URL(string: "https://faraim.online/support")!) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Support")
                                .font(.body)
                            Text("Report content or app problems")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "lifepreserver.fill")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

                Link(destination: URL(string: "https://github.com/bvolpato/far-aim-online")!) {
                    Label {
                        VStack(alignment: .leading) {
                            Text("Open-source project")
                                .font(.body)
                            Text("Free to use · Pull requests welcome")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                            .foregroundColor(AviationTheme.accent)
                    }
                }

            }

            Section("Preferences") {
                Picker(selection: $appTheme, label: Label("Theme", systemImage: "paintbrush.fill").foregroundColor(AviationTheme.accent)) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.menu)
            }

            Section("About") {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        AircraftMark(size: 54)

                        VStack(alignment: .leading) {
                            Text("FAR/AIM Pro")
                                .font(.headline.weight(.bold))
                            Text("Version \(appVersion) (\(buildNumber))")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Text("Free, open-source aviation study reference for Federal Aviation Regulations, the Aeronautical Information Manual, FAA advisory circulars, and study tools.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
        }
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.large)
        .scrollContentBackground(.hidden)
        .aviationScreen()
    }
}

// MARK: - Source Status View

struct SourceStatusView: View {
    @ObservedObject var dataService = DataService.shared

    var body: some View {
        List {
            if let status = dataService.sourceStatus {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Status date \(status.generatedAt)", systemImage: "arrow.clockwise.circle.fill")
                            .font(.headline)
                            .foregroundColor(AviationTheme.accent)
                        Text("Source dates, content coverage, release notes, and known limits for FAR/AIM Pro.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 6)
                }

                Section("Source Coverage") {
                    ForEach(status.sources) { source in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(source.shortLabel)
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(AviationTheme.accent.opacity(0.12))
                                    .foregroundColor(AviationTheme.accent)
                                    .cornerRadius(8)
                                Text(source.status)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Text(source.label)
                                .font(.headline)
                            Text(source.source)
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("Updated \(source.lastUpdated)")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            Text(source.coverage)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            ForEach(source.notes, id: \.self) { note in
                                Label(note, systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            sourceAction(for: source)
                                .padding(.top, 2)
                        }
                        .padding(.vertical, 6)
                    }
                }

                Section("Change Watch") {
                    ForEach(status.changeWatch) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(item.severity)
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.orange.opacity(0.12))
                                    .foregroundColor(.orange)
                                    .cornerRadius(8)
                                Text(item.date)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Text(item.title)
                                .font(.headline)
                            Text(item.summary)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            Text("Affected references")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            ForEach(item.affectedReferences, id: \.self) { reference in
                                Label(reference, systemImage: "exclamationmark.circle.fill")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Text("Review actions")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                            ForEach(item.actions, id: \.self) { action in
                                Label(action, systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            changeAction(for: item)
                                .padding(.top, 2)
                        }
                        .padding(.vertical, 6)
                    }
                }

                Section("Release Notes") {
                    ForEach(status.releaseNotes) { note in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("\(note.date) - \(note.title)")
                                .font(.headline)
                            ForEach(note.details, id: \.self) { detail in
                                Label(detail, systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }

                Section("Known Limits") {
                    ForEach(status.limitations, id: \.self) { item in
                        Text(item)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }

                Section("Next Checks") {
                    ForEach(status.nextChecks, id: \.self) { item in
                        Text(item)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            } else {
                LibraryCollectionStateView(
                    catalog: .sourceStatus,
                    title: "Update Status",
                    systemImage: "arrow.triangle.2.circlepath.circle"
                )
            }
        }
        .navigationTitle("Data Updates")
        .navigationBarTitleDisplayMode(.large)
        .scrollContentBackground(.hidden)
        .aviationScreen()
    }

    @ViewBuilder
    private func sourceAction(for source: SourceStatusItem) -> some View {
        if source.officialUrl.hasPrefix("/") {
            NavigationLink(destination: internalDestination(for: source.officialUrl)) {
                Label("Open", systemImage: "arrow.right.circle")
                    .font(.subheadline)
            }
        } else if let url = URL(string: source.officialUrl) {
            Link(destination: url) {
                Label("Official source", systemImage: "arrow.up.right.square")
                    .font(.subheadline)
            }
        }
    }

    @ViewBuilder
    private func changeAction(for item: SourceChangeWatch) -> some View {
        NavigationLink(destination: internalDestination(for: item.link)) {
            Label("Review", systemImage: "arrow.right.circle")
                .font(.subheadline)
        }
    }

    @ViewBuilder
    private func internalDestination(for path: String) -> some View {
        switch path {
        case "/far":
            FARListView()
        case "/aim":
            AIMListView()
        case "/glossary":
            GlossaryView()
        case "/advisory-circulars":
            AdvisoryCircularsView()
        case "/study":
            StudyView()
        case "/updates":
            SourceStatusView()
        default:
            HomeView()
        }
    }
}

// MARK: - Home View

struct HomeView: View {
    @ObservedObject var dataService = DataService.shared

    private let libraryColumns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                homeHero

                NavigationLink(destination: SearchView()) {
                    HStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .font(.headline)
                            .foregroundStyle(AviationTheme.accent)
                        Text("Search regulations, procedures, and terms")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .background(AviationTheme.raisedSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(AviationTheme.border, lineWidth: 1)
                    }
                }
                .buttonStyle(.plain)

                if dataService.farReadingHistory != nil || dataService.aimReadingHistory != nil {
                    continueReading
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading(title: "Reference library", eyebrow: "OFFLINE & SEARCHABLE")

                    LazyVGrid(columns: libraryColumns, spacing: 12) {
                        NavigationLink(destination: FARListView()) {
                            LibraryTile(
                                title: "FAR",
                                subtitle: "\(dataService.farParts.count) parts",
                                icon: "doc.text.fill"
                            )
                        }

                        NavigationLink(destination: AIMListView()) {
                            LibraryTile(
                                title: "AIM",
                                subtitle: "\(dataService.aimChapters.count) chapters",
                                icon: "book.closed.fill"
                            )
                        }

                        NavigationLink(destination: GlossaryView()) {
                            LibraryTile(
                                title: "Glossary",
                                subtitle: "Pilot / Controller",
                                icon: "text.book.closed.fill"
                            )
                        }

                        NavigationLink(destination: AdvisoryCircularsView()) {
                            LibraryTile(
                                title: "Advisory Circulars",
                                subtitle: "\(dataService.advisoryCirculars.count) records",
                                icon: "doc.badge.gearshape.fill"
                            )
                        }
                    }
                    .buttonStyle(.plain)
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionHeading(title: "Train for proficiency", eyebrow: "STUDY DECK")

                    NavigationLink(destination: StudyView()) {
                        HStack(spacing: 16) {
                            ZStack {
                                Circle()
                                    .fill(AviationTheme.accent.opacity(0.12))
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.title2)
                                    .foregroundStyle(AviationTheme.accent)
                            }
                            .frame(width: 52, height: 52)

                            VStack(alignment: .leading, spacing: 3) {
                                Text("Study dashboard")
                                    .font(.headline)
                                Text("\(dataService.quizzes.count) quizzes and \(dataService.flashcardDecks.reduce(0) { $0 + $1.cardCount }) flashcards")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                        }
                        .padding(18)
                    }
                    .buttonStyle(.plain)
                    .background(AviationTheme.raisedSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(AviationTheme.border, lineWidth: 1)
                    }
                }
            }
            .frame(maxWidth: 960, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Flight Deck")
        .navigationBarTitleDisplayMode(.large)
        .aviationScreen()
    }

    private var homeHero: some View {
        ZStack(alignment: .bottomTrailing) {
            AviationTheme.heroGradient

            Circle()
                .stroke(.white.opacity(0.08), lineWidth: 32)
                .frame(width: 210, height: 210)
                .offset(x: 65, y: 75)

            HStack(alignment: .center, spacing: 18) {
                AircraftMark(size: 66)

                VStack(alignment: .leading, spacing: 6) {
                    Text("FAR/AIM PRO")
                        .font(.caption.weight(.bold))
                        .tracking(1.5)
                        .foregroundStyle(AviationTheme.sky)
                    Text("Free pilot reference, ready offline.")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("FAA references and fast study tools. No signal required.")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
            .padding(22)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var continueReading: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Continue reading", eyebrow: "RECENT")

            if let history = dataService.farReadingHistory,
               let part = dataService.farParts.first(where: { $0.part == Int(history.identifier) }) {
                NavigationLink(destination: FARPartDetailView(part: part, initialSection: history.section)) {
                    ContinueReadingRow(
                        badge: "FAR \(history.identifier)",
                        title: history.title,
                        icon: "doc.text.fill"
                    )
                }
                .buttonStyle(.plain)
            }

            if let history = dataService.aimReadingHistory,
               let chapter = dataService.aimChapters.first(where: { $0.chapter == Int(history.identifier) }) {
                NavigationLink(destination: AIMChapterDetailView(chapter: chapter, initialSection: history.section)) {
                    ContinueReadingRow(
                        badge: Int(history.identifier) == 0 ? "AIM GENERAL" : "AIM \(history.identifier)",
                        title: history.title,
                        icon: "book.closed.fill"
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct SectionHeading: View {
    let title: String
    let eyebrow: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(eyebrow)
                .font(.caption2.weight(.bold))
                .tracking(1.25)
                .foregroundStyle(AviationTheme.accent)
            Text(title)
                .font(.title3.weight(.bold))
        }
    }
}

struct LibraryTile: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: icon)
                    .font(.headline)
                    .foregroundStyle(AviationTheme.accent)
                    .frame(width: 38, height: 38)
                    .background(AviationTheme.accent.opacity(0.11))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 116, alignment: .leading)
        .padding(16)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }
}

struct ContinueReadingRow: View {
    let badge: String
    let title: String
    let icon: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(AviationTheme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(badge)
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(AviationTheme.accent)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
        }
        .padding(15)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }
}

#Preview {
    ContentView()
}
