//
//  AIMViews.swift
//  FARAIMPro
//
//  Views for displaying AIM content
//

import SwiftUI
import UIKit
import ImageIO

struct AIMListView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var searchText = ""
    @State private var displayedChapters: [AIMChapter] = DataService.shared.aimChapters
    @State private var isFiltering = false

    var body: some View {
        ScrollView {
            if dataService.aimChapters.isEmpty {
                LibraryCollectionStateView(
                    catalog: .aim,
                    title: "AIM Chapters",
                    systemImage: "book.closed"
                )
            } else if displayedChapters.isEmpty && isFiltering {
                ProgressView("Searching AIM…")
                    .frame(maxWidth: .infinity, minHeight: 440)
            } else if displayedChapters.isEmpty {
                ContentUnavailableView(
                    "No matching chapters",
                    systemImage: "book.closed",
                    description: Text("Try another chapter, procedure, or phrase.")
                )
                .frame(minHeight: 440)
            } else {
                LazyVStack(alignment: .leading, spacing: 12) {
                    LibraryLoadErrorBanner(catalog: .aim)

                    ReferenceLibraryBanner(
                        eyebrow: "FAA AIM",
                        title: "Aeronautical Information Manual",
                        detail: "\(displayedChapters.count) chapters available offline",
                        icon: "book.closed.fill"
                    )

                    if let history = dataService.aimReadingHistory,
                       let chapter = dataService.aimChapters.first(where: { $0.chapter == Int(history.identifier) }) {
                        NavigationLink(destination: AIMChapterDetailView(chapter: chapter, initialSection: history.section)) {
                            ContinueReadingRow(
                                badge: "CONTINUE · \(Int(history.identifier).map(formatAIMChapterBadge) ?? "CHAPTER \(history.identifier)")",
                                title: history.title,
                                icon: "bookmark.fill"
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(displayedChapters) { chapter in
                        NavigationLink(destination: AIMChapterDetailView(chapter: chapter, initialSearchText: searchText)) {
                            ReferenceRowCard(
                                badge: formatAIMChapterBadge(chapter.chapter),
                                title: chapter.title,
                                subtitle: "\(chapter.sections.count) sections",
                                metadata: nil,
                                query: searchText
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("aim-chapter-\(chapter.chapter)")
                    }
                }
                .frame(maxWidth: 900, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("AIM")
        .searchable(text: $searchText, prompt: "Search AIM chapters and sections")
        .aviationScreen()
        .task(id: "\(searchText)-\(dataService.aimChapters.count)") {
            let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                displayedChapters = dataService.aimChapters
                isFiltering = false
                return
            }
            isFiltering = true
            try? await Task.sleep(for: .milliseconds(100))
            guard !Task.isCancelled else { return }
            let filtered = await Task.detached(priority: .userInitiated) {
                DataService.shared.filterAIMChapters(query: trimmed)
            }.value
            guard !Task.isCancelled else { return }
            displayedChapters = filtered
            isFiltering = false
        }
    }
}

struct AIMChapterDetailView: View {
    let chapter: AIMChapter
    let initialSection: String?
    private let initialSearchText: String
    @State private var searchText = ""
    @AppStorage("far-aim-pro-reader-font-scale-index") private var readerFontScaleIndex = 1
    @AppStorage("far-aim-pro-reader-density") private var readerDensityRawValue = ReaderDensity.standard.rawValue
    @State private var showReaderControls = false
    @ObservedObject var dataService = DataService.shared
    private var readerTypography = ReaderTypography()

    // Allow initializing with a search query
    init(chapter: AIMChapter, initialSearchText: String = "", initialSection: String? = nil) {
        self.chapter = chapter
        self.initialSection = initialSection
        self.initialSearchText = initialSearchText
        _searchText = State(initialValue: initialSearchText)
    }

    private var chapterSearchContext: String {
        "aim chapter \(chapter.chapter) \(formatAIMChapterLabel(chapter.chapter))"
    }

    private func sectionMatches(_ section: AIMSection, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        if initialSection == section.section && preservesInitialSearchAnchor { return true }
        return SearchQueryMatcher.matches(
            text: "\(chapterSearchContext) Section \(section.section) \(section.searchableText)",
            query: trimmed
        )
    }

    private var effectiveSearchText: String {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if chapter.sections.contains(where: { sectionMatches($0, query: trimmed) }) {
            return searchText
        }
        let trimmedInitial = initialSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedInitial.isEmpty,
           trimmed.caseInsensitiveCompare(trimmedInitial) == .orderedSame,
           SearchQueryMatcher.matches(
               text: "\(chapterSearchContext) \(chapter.title)",
               query: trimmed
           ) {
            return ""
        }
        return searchText
    }

    private var displayedSections: [AIMSection] {
        let activeQuery = effectiveSearchText
        return chapter.sections.filter { sectionMatches($0, query: activeQuery) }
    }

    private var preservesInitialSearchAnchor: Bool {
        shouldPreserveReaderAnchor(searchText: searchText, initialSearchText: initialSearchText)
    }

    var body: some View {
        let readerPreferences = readerTypography.preferences(
            fontScaleIndex: readerFontScaleIndex,
            density: ReaderDensity(rawValue: readerDensityRawValue) ?? .standard
        )
        let activeQuery = effectiveSearchText
        let sectionsToDisplay = chapter.sections.filter { sectionMatches($0, query: activeQuery) }

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(formatAIMChapterLabel(chapter.chapter))
                            .font(.subheadline)
                            .foregroundStyle(AviationTheme.sky)

                        Text(chapter.title)
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AviationTheme.heroGradient)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                if sectionsToDisplay.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                        .accessibilityIdentifier("reader-no-results")
                        .padding(.vertical, 24)
                } else {
                    ForEach(sectionsToDisplay) { section in
                        AIMSectionCard(
                            section: section,
                            searchText: activeQuery,
                            defaultExpanded: initialSection == section.section,
                            preserveInitialSearchMatch: preservesInitialSearchAnchor,
                            searchContext: chapterSearchContext,
                            studyMarkInput: StudyMarkInput(
                                type: "aim",
                                reference: "AIM \(section.section)",
                                title: section.title.isEmpty ? "AIM \(section.section)" : section.title,
                                route: "aim:\(chapter.chapter)#\(section.section)"
                            ),
                            readerPreferences: readerPreferences,
                            onExpanded: {
                                dataService.saveAIMReadingHistory(
                                    chapter: chapter.chapter,
                                    title: chapter.title,
                                    section: section.section
                                )
                            }
                        )
                        .id(section.section)
                    }
                }

                // Study Materials Link at end
                VStack(alignment: .leading, spacing: 12) {
                    Text("Study Materials")
                        .font(.headline)
                        .padding(.top, 8)

                    VStack(spacing: 10) {
                        if let quiz = dataService.getQuizForAIMChapter(chapter.chapter) {
                            NavigationLink(destination: QuizDetailView(quiz: quiz)) {
                                HStack {
                                    Image(systemName: "questionmark.circle.fill")
                                    Text(quiz.title)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .padding(.vertical, 10)
                                .padding(.horizontal, 16)
                                .background(Color.green)
                                .cornerRadius(8)
                            }
                        }

                        if let deck = dataService.getFlashcardsForAIMChapter(chapter.chapter) {
                            NavigationLink(destination: FlashcardStudyView(deck: deck)) {
                                HStack {
                                    Image(systemName: "rectangle.on.rectangle.angled")
                                    Text(deck.title)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                }
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .padding(.vertical, 10)
                                .padding(.horizontal, 16)
                                .background(Color.orange)
                                .cornerRadius(8)
                            }
                        }
                    }
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .task(id: initialSection) {
                guard let initialSection, !initialSection.isEmpty else { return }
                try? await Task.sleep(for: .milliseconds(50))
                guard !Task.isCancelled else { return }
                proxy.scrollTo(initialSection, anchor: .top)
            }
        }
        .navigationTitle(formatAIMChapterLabel(chapter.chapter))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                ShareLink(
                    item: "AIM \(formatAIMChapterLabel(chapter.chapter)) - \(chapter.title)\n\(publicReferenceLink(for: "aim:\(chapter.chapter)"))"
                ) {
                    Label("Share \(formatAIMChapterLabel(chapter.chapter))", systemImage: "square.and.arrow.up")
                        .labelStyle(.iconOnly)
                }

                Button(action: { showReaderControls.toggle() }) {
                    Label("Reader controls", systemImage: "textformat.size")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel("Reader controls")
                .accessibilityIdentifier("reader-controls")
                .sheet(isPresented: $showReaderControls) {
                    ReaderControlsSheet(
                        fontScaleIndex: $readerFontScaleIndex,
                        densityRawValue: $readerDensityRawValue
                    )
                }
            }
        }
        .searchable(text: $searchText, prompt: "Find in \(formatAIMChapterLabel(chapter.chapter))")
        .onAppear {
            dataService.saveAIMReadingHistory(
                chapter: chapter.chapter,
                title: chapter.title,
                section: initialSection
            )
        }
        .aviationScreen()
    }
}

struct AIMSectionCard: View {
    let section: AIMSection
    let searchText: String
    var defaultExpanded: Bool = false
    var preserveInitialSearchMatch: Bool = false
    var searchContext: String = "aim"
    var studyMarkInput: StudyMarkInput? = nil
    var readerPreferences: ReaderPreferences = .standard
    var onExpanded: (() -> Void)? = nil
    @State private var userExpanded: Bool?

    private var shouldExpand: Bool {
        if let userExpanded {
            return userExpanded
        }
        if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return matchesSearch
        }
        return defaultExpanded
    }

    var matchesSearch: Bool {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        if defaultExpanded && preserveInitialSearchMatch { return true }
        return SearchQueryMatcher.matches(
            text: "\(searchContext) Section \(section.section) \(section.searchableText)",
            query: trimmed
        )
    }

    private func visibleSubsections(from subsections: [AIMSubsection]) -> [AIMSubsection] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || userExpanded == true {
            return subsections
        }
        let fullMatches = subsections.filter {
            SearchQueryMatcher.matches(text: $0.searchableText, query: trimmed)
        }
        if !fullMatches.isEmpty {
            return fullMatches
        }
        let tokens = SearchQueryMatcher.tokens(for: trimmed)
        let tokenMatches = subsections.filter { subsection in
            let lower = subsection.searchableText.lowercased()
            return tokens.contains { SearchQueryMatcher.textContainsToken(lower, token: $0) }
        }
        return tokenMatches.isEmpty ? subsections : tokenMatches
    }

    var body: some View {
        if matchesSearch {
            VStack(alignment: .leading, spacing: 12) {
                Button(action: {
                    let nextExpanded = !shouldExpand
                    withAnimation { userExpanded = nextExpanded }
                    if nextExpanded { onExpanded?() }
                }) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HighlightText(text: "Section \(section.section)", query: searchText)
                                .font(.caption)
                                .foregroundColor(.green)
                            HighlightText(text: section.title, query: searchText)
                                .font(.headline)
                                .foregroundColor(.primary)
                                .multilineTextAlignment(.leading)
                        }

                        Spacer()

                        Image(systemName: shouldExpand ? "chevron.up" : "chevron.down")
                            .foregroundColor(.secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(shouldExpand ? "Expanded" : "Collapsed")
                .accessibilityHint(shouldExpand ? "Collapse this section" : "Expand this section")
                .accessibilityIdentifier("aim-section-\(section.section)")

                if shouldExpand {
                    if let studyMarkInput {
                        StudyMarkTools(input: studyMarkInput)
                    }

                    // Display main content if available
                    if let content = section.content, !content.isEmpty {
                        HighlightText(text: content, query: searchText)
                            .font(readerPreferences.bodyFont)
                            .lineSpacing(readerPreferences.lineSpacing)
                            .foregroundColor(.primary)
                            .textSelection(.enabled)
                            .padding(12)
                            .background(Color(.tertiarySystemBackground))
                            .cornerRadius(8)
                    }

                    // Display subsections if any
                    if let subsections = section.subsections, !subsections.isEmpty {
                        ForEach(visibleSubsections(from: subsections)) { subsection in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    HighlightText(text: subsection.subsection, query: searchText)
                                    Text(".")
                                    HighlightText(text: subsection.title, query: searchText)
                                }
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .textSelection(.enabled)

                                HighlightText(text: subsection.content, query: searchText)
                                    .font(readerPreferences.bodyFont)
                                    .lineSpacing(readerPreferences.lineSpacing)
                                    .foregroundColor(.primary)
                                    .textSelection(.enabled)

                                if let keyPoints = subsection.keyPoints, !keyPoints.isEmpty {
                                    ForEach(keyPoints, id: \.self) { point in
                                        HStack(alignment: .top, spacing: 8) {
                                            Circle()
                                                .fill(Color.green)
                                                .frame(width: 5, height: 5)
                                                .padding(.top, 7)
                                            HighlightText(text: point, query: searchText)
                                                .font(readerPreferences.bodyFont)
                                                .lineSpacing(readerPreferences.lineSpacing)
                                                .foregroundColor(.primary)
                                                .textSelection(.enabled)
                                        }
                                    }
                                }
                            }
                            .padding(12)
                            .background(Color(.tertiarySystemBackground))
                            .cornerRadius(8)
                        }
                    }

                    if let tables = section.tables, !tables.isEmpty {
                        ForEach(Array(tables.enumerated()), id: \.offset) { index, table in
                            AIMTableView(
                                table: table,
                                number: index + 1,
                                searchText: searchText,
                                tableFont: readerPreferences.bodyFont,
                                tableLineSpacing: readerPreferences.lineSpacing
                            )
                        }
                    }

                    if let figures = section.figures, !figures.isEmpty {
                        LazyVStack(spacing: 14) {
                            ForEach(Array(figures.enumerated()), id: \.offset) { index, figure in
                                DocumentFigureView(
                                    figure: figure,
                                    number: index + 1,
                                    searchText: searchText,
                                    catalog: .aim
                                )
                            }
                        }
                    }
                }
            }
            .padding(readerPreferences.cardPadding)
            .background(AviationTheme.raisedSurface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AviationTheme.border, lineWidth: 1)
            }
            .onChange(of: searchText) {
                userExpanded = nil
            }
        }
    }
}

let aimTableRowsPerPage = 25

struct IndexedAIMTableRow<Element> {
    let sourceIndex: Int
    let value: Element
}

struct AIMTablePage<Element> {
    let pageIndex: Int
    let pageCount: Int
    let totalRows: Int
    let firstRowNumber: Int?
    let lastRowNumber: Int?
    let rows: [IndexedAIMTableRow<Element>]
}

func pageAIMTableRows<Element>(
    rows: [Element],
    requestedPageIndex: Int,
    pageSize: Int = aimTableRowsPerPage
) -> AIMTablePage<Element> {
    precondition(pageSize > 0)
    let pageCount = max(1, (rows.count + pageSize - 1) / pageSize)
    let pageIndex = min(max(requestedPageIndex, 0), pageCount - 1)
    let start = pageIndex * pageSize
    let end = min(start + pageSize, rows.count)
    let pageRows = (start..<end).map { index in
        IndexedAIMTableRow(sourceIndex: index, value: rows[index])
    }
    return AIMTablePage(
        pageIndex: pageIndex,
        pageCount: pageCount,
        totalRows: rows.count,
        firstRowNumber: pageRows.first.map { $0.sourceIndex + 1 },
        lastRowNumber: pageRows.last.map { $0.sourceIndex + 1 },
        rows: pageRows
    )
}

func firstMatchingAIMTableRow(rowTexts: [String], query: String) -> Int? {
    let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedQuery.isEmpty else { return nil }
    if let exactMatch = rowTexts.firstIndex(where: {
        $0.localizedCaseInsensitiveContains(normalizedQuery)
    }) {
        return exactMatch
    }

    let terms = normalizedQuery.split(whereSeparator: \.isWhitespace).map(String.init)
    guard !terms.isEmpty else { return nil }
    if let allTermsMatch = rowTexts.firstIndex(where: { row in
        terms.allSatisfy { row.localizedCaseInsensitiveContains($0) }
    }) {
        return allTermsMatch
    }
    return rowTexts.firstIndex(where: { row in
        terms.contains { row.localizedCaseInsensitiveContains($0) }
    })
}

struct AIMTableView: View {
    let table: AIMTable
    let number: Int
    let searchText: String
    var showsLabel: Bool = true
    var tableFont: Font? = nil
    var tableLineSpacing: CGFloat? = nil
    var pageIndex: Binding<Int>? = nil
    @State private var localPageIndex = 0
    @ScaledMetric(relativeTo: .body) private var columnWidth: CGFloat = 140

    private var selectedPageIndex: Binding<Int> { pageIndex ?? $localPageIndex }
    private var headers: [String] { table.headers ?? [] }
    private var rows: [[String]] { table.rows ?? [] }
    private var columnCount: Int {
        max(headers.count, rows.map(\.count).max() ?? 0)
    }
    private var label: String {
        let caption = table.caption?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return caption.isEmpty ? "Table \(number)" : caption
    }

    var body: some View {
        let page = pageAIMTableRows(rows: rows, requestedPageIndex: selectedPageIndex.wrappedValue)
        VStack(alignment: .leading, spacing: 8) {
            if showsLabel {
                Label {
                    HighlightText(
                        text: label,
                        query: searchText
                    )
                } icon: {
                    Image(systemName: "tablecells")
                }
                .font(.caption.weight(.semibold))
                .foregroundColor(AviationTheme.accent)
            }

            if columnCount == 0 {
                Text("Table data unavailable")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                if rows.count > aimTableRowsPerPage {
                    pagingControls(for: page)
                }

                ScrollView(.horizontal, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        if !headers.isEmpty {
                            tableRow(headers, isHeader: true, rowNumber: nil)
                        }

                        ForEach(page.rows, id: \.sourceIndex) { indexedRow in
                            tableRow(
                                indexedRow.value,
                                isHeader: false,
                                rowNumber: indexedRow.sourceIndex + 1
                            )
                        }
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(AviationTheme.border, lineWidth: 1)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .onAppear { selectPageForSearch(searchText) }
        .onChange(of: searchText) { _, query in
            selectPageForSearch(query)
        }
        .onChange(of: rows) { _, _ in
            selectPageForSearch(searchText)
        }
    }

    private func pagingControls(for page: AIMTablePage<[String]>) -> some View {
        VStack(spacing: 8) {
            Text("Rows \(page.firstRowNumber ?? 0)–\(page.lastRowNumber ?? 0) of \(page.totalRows)")
                .font(.caption.weight(.medium))
                .frame(maxWidth: .infinity)
                .accessibilityLabel(
                    "Rows \(page.firstRowNumber ?? 0) through \(page.lastRowNumber ?? 0) of \(page.totalRows)"
                )

            HStack(spacing: 8) {
                Button {
                    selectedPageIndex.wrappedValue = max(page.pageIndex - 1, 0)
                } label: {
                    Text("Previous")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .disabled(page.pageIndex == 0)
                .accessibilityLabel("Previous table rows")
                .buttonStyle(.bordered)

                Button {
                    selectedPageIndex.wrappedValue = min(page.pageIndex + 1, page.pageCount - 1)
                } label: {
                    Text("Next")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .disabled(page.pageIndex >= page.pageCount - 1)
                .accessibilityLabel("Next table rows")
                .buttonStyle(.bordered)
            }
        }
    }

    private func selectPageForSearch(_ query: String) {
        guard pageIndex == nil else { return }
        let rowTexts = rows.map { $0.joined(separator: " ") }
        localPageIndex = firstMatchingAIMTableRow(rowTexts: rowTexts, query: query)
            .map { $0 / aimTableRowsPerPage } ?? 0
    }

    @ViewBuilder
    private func tableRow(_ values: [String], isHeader: Bool, rowNumber: Int?) -> some View {
        if values.count == 1, columnCount > 1 {
            HighlightText(text: values[0], query: searchText)
                .font(cellFont(forHeader: isHeader))
                .lineSpacing(tableLineSpacing ?? 0)
                .fixedSize(horizontal: false, vertical: true)
                .frame(width: CGFloat(columnCount) * columnWidth, alignment: .leading)
                .padding(10)
                .background(isHeader ? AviationTheme.ink : Color(.secondarySystemBackground))
                .foregroundColor(isHeader ? .white : .primary)
                .accessibilityLabel(rowNumber.map { "Row \($0), \(values[0].isEmpty ? "blank" : values[0])" } ?? values[0])
        } else {
            HStack(alignment: .top, spacing: 0) {
                ForEach(0..<columnCount, id: \.self) { column in
                    let value = column < values.count ? values[column] : ""
                    HighlightText(text: value, query: searchText)
                        .font(cellFont(forHeader: isHeader))
                        .lineSpacing(tableLineSpacing ?? 0)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(width: columnWidth, alignment: .leading)
                        .padding(10)
                        .background(isHeader ? AviationTheme.ink : Color(.secondarySystemBackground))
                        .foregroundColor(isHeader ? .white : .primary)
                        .overlay(alignment: .trailing) {
                            Divider()
                        }
                        .accessibilityLabel(accessibilityLabel(
                            value: value,
                            column: column,
                            rowNumber: rowNumber,
                            isHeader: isHeader
                        ))
                }
            }
        }
    }

    private func accessibilityLabel(
        value: String,
        column: Int,
        rowNumber: Int?,
        isHeader: Bool
    ) -> String {
        if isHeader {
            return "Column \(column + 1), \(value.isEmpty ? "blank" : value)"
        }
        let header = column < headers.count ? headers[column] : "Column \(column + 1)"
        return "Row \(rowNumber ?? 0), \(header), \(value.isEmpty ? "blank" : value)"
    }

    private func cellFont(forHeader isHeader: Bool) -> Font {
        let baseFont = tableFont ?? .caption
        return isHeader ? baseFont.weight(.bold) : baseFont
    }
}

struct DocumentFigureView: View {
    let figure: AIMFigure
    let number: Int
    let searchText: String
    let catalog: FigureAssetCatalog
    @State private var image: UIImage?
    @State private var resolvedURL: URL?
    @State private var finishedLoading = false
    @State private var showFullScreen = false

    private var caption: String? {
        [figure.caption, figure.alt]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    private var accessibilityDescription: String {
        var parts = ["\(catalog.rawValue.uppercased()) figure \(number)"]
        if let caption {
            parts.append("Caption: \(caption)")
        }
        if let alt = figure.alt?.trimmingCharacters(in: .whitespacesAndNewlines),
           !alt.isEmpty,
           caption.map({ $0 != alt }) ?? true {
            parts.append("Description: \(alt)")
        }
        return parts.joined(separator: ". ")
    }

    var body: some View {
        let aspectRatio = resolvedURL.flatMap { FigureAspectRatioCache.cachedAspectRatio(at: $0) }
            ?? image.map { $0.size.height > 0 ? $0.size.width / $0.size.height : nil } ?? nil
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Figure \(number)", systemImage: "photo")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(AviationTheme.accent)
                    .accessibilityLabel(accessibilityDescription)
                Spacer()
                if image != nil {
                    Button {
                        showFullScreen = true
                    } label: {
                        Label("Zoom", systemImage: "arrow.up.left.and.arrow.down.right")
                            .font(.caption)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Zoom Figure \(number)")
                }
            }

            if let aspectRatio, !finishedLoading || image != nil {
                Color.white
                    .aspectRatio(aspectRatio, contentMode: .fit)
                    .overlay {
                        if let image {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFit()
                                .accessibilityLabel(accessibilityDescription)
                        } else {
                            ProgressView("Loading figure")
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if image != nil { showFullScreen = true }
                    }
            } else if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel(accessibilityDescription)
                    .onTapGesture { showFullScreen = true }
            } else if finishedLoading {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Figure unavailable offline", systemImage: "exclamationmark.triangle")
                        .font(.subheadline.weight(.semibold))
                    Text("Bundled image \(figure.src) was not found.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    if let source = figure.originalUrl.flatMap({ URL(string: $0) }) {
                        Link("View FAA source", destination: source)
                            .font(.caption)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Color(.tertiarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityElement(children: .combine)
            } else {
                ProgressView("Loading figure")
                    .frame(maxWidth: .infinity, minHeight: 120)
            }

            if let caption {
                HighlightText(text: caption, query: searchText)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fullScreenCover(isPresented: $showFullScreen) {
            if let image {
                FigureZoomSheetView(
                    image: image,
                    title: "Figure \(number)",
                    caption: caption
                )
            }
        }
        .task(id: figure.src) {
            await loadImage()
        }
    }

    @MainActor
    private func loadImage() async {
        image = nil
        finishedLoading = false

        guard let url = DataService.shared.figureURL(for: figure, catalog: catalog) else {
            resolvedURL = nil
            finishedLoading = true
            return
        }
        resolvedURL = url

        let decodedImage = await Task.detached(priority: .utility) {
            _ = FigureAspectRatioCache.aspectRatio(at: url)
            return FigureImageLoader.downsampledImage(at: url, maxPixelSize: 2_048)
        }.value
        guard !Task.isCancelled else { return }

        image = decodedImage
        finishedLoading = true
    }
}

private struct FigureZoomSheetView: View {
    let image: UIImage
    let title: String
    let caption: String?
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0

    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical], showsIndicators: true) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .gesture(
                        MagnifyGesture()
                            .onChanged { value in
                                scale = min(max(lastScale * value.magnification, 1.0), 4.0)
                            }
                            .onEnded { _ in
                                lastScale = scale
                            }
                    )
                    .onTapGesture(count: 2) {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if scale > 1.0 {
                                scale = 1.0
                                lastScale = 1.0
                            } else {
                                scale = 2.5
                                lastScale = 2.5
                            }
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.white)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if scale > 1.0 {
                        Button("Reset") {
                            withAnimation {
                                scale = 1.0
                                lastScale = 1.0
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let caption {
                    Text(caption)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.ultraThinMaterial)
                }
            }
        }
    }
}

private enum FigureAspectRatioCache {
    private final class Entry: NSObject {
        let aspectRatio: CGFloat?

        init(aspectRatio: CGFloat?) {
            self.aspectRatio = aspectRatio
        }
    }

    private static let cache: NSCache<NSURL, Entry> = {
        let cache = NSCache<NSURL, Entry>()
        cache.countLimit = 512
        cache.totalCostLimit = 256 * 1_024
        return cache
    }()

    static func cachedAspectRatio(at url: URL) -> CGFloat? {
        cache.object(forKey: url as NSURL)?.aspectRatio
    }

    static func aspectRatio(at url: URL) -> CGFloat? {
        let key = url as NSURL
        if let cached = cache.object(forKey: key) {
            return cached.aspectRatio
        }

        let aspectRatio = readAspectRatio(at: url)
        cache.setObject(Entry(aspectRatio: aspectRatio), forKey: key, cost: url.absoluteString.utf8.count + 64)
        return aspectRatio
    }

    private static func readAspectRatio(at url: URL) -> CGFloat? {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(url as CFURL, options),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, options) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width.isFinite, height.isFinite, width > 0, height > 0 else { return nil }

        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        return CGFloat((5...8).contains(orientation) ? height / width : width / height)
    }
}

private enum FigureImageLoader {
    private static let imageCache: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 48
        cache.totalCostLimit = 40 * 1_024 * 1_024
        return cache
    }()

    static func downsampledImage(at url: URL, maxPixelSize: Int) -> UIImage? {
        let key = url as NSURL
        if let cached = imageCache.object(forKey: key) {
            return cached
        }
        let sourceOptions = [
            kCGImageSourceShouldCache: false
        ] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions) else {
            return nil
        }

        let thumbnailOptions = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ] as CFDictionary
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else {
            return nil
        }
        let decoded = UIImage(cgImage: thumbnail)
        let cost = Int(decoded.size.width * decoded.size.height * decoded.scale * decoded.scale * 4)
        imageCache.setObject(decoded, forKey: key, cost: max(cost, 1))
        return decoded
    }
}

#Preview {
    AIMListView()
}
