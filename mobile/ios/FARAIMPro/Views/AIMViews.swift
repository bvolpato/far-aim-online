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

    var filteredChapters: [AIMChapter] {
        if searchText.isEmpty {
            return dataService.aimChapters
        }
        let query = searchText.lowercased()
        return dataService.aimChapters.filter { chapter in
            // Match Chapter title/number
            if chapter.title.lowercased().contains(query) ||
               String(chapter.chapter).contains(query) {
                return true
            }
            // Match content inside sections
            if chapter.sections.contains(where: { section in
                if section.title.lowercased().contains(query) ||
                   section.section.contains(query) {
                    return true
                }
                if section.searchableText.lowercased().contains(query) {
                    return true
                }
                return false
            }) {
                return true
            }
            return false
        }
    }

    var body: some View {
        ScrollView {
            if dataService.aimChapters.isEmpty {
                LibraryCollectionStateView(
                    catalog: .aim,
                    title: "AIM Chapters",
                    systemImage: "book.closed"
                )
            } else if filteredChapters.isEmpty {
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
                        detail: "\(filteredChapters.count) chapters available offline",
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

                    ForEach(filteredChapters) { chapter in
                        NavigationLink(destination: AIMChapterDetailView(chapter: chapter, initialSearchText: searchText)) {
                            ReferenceRowCard(
                                badge: formatAIMChapterBadge(chapter.chapter),
                                title: chapter.title,
                                subtitle: "\(chapter.sections.count) sections",
                                metadata: nil
                            )
                        }
                        .buttonStyle(.plain)
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
    }
}

struct AIMChapterDetailView: View {
    let chapter: AIMChapter
    let initialSection: String?
    @State private var searchText = ""
    @AppStorage("far-aim-pro-reader-font-scale-index") private var readerFontScaleIndex = 1
    @AppStorage("far-aim-pro-reader-density") private var readerDensityRawValue = ReaderDensity.standard.rawValue
    @State private var showReaderControls = false
    @ObservedObject var dataService = DataService.shared

    // Allow initializing with a search query
    init(chapter: AIMChapter, initialSearchText: String = "", initialSection: String? = nil) {
        self.chapter = chapter
        self.initialSection = initialSection
        _searchText = State(initialValue: initialSearchText)
    }

    var body: some View {
        let readerPreferences = ReaderPreferences(
            fontScaleIndex: readerFontScaleIndex,
            density: ReaderDensity(rawValue: readerDensityRawValue) ?? .standard
        )

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

                ForEach(chapter.sections) { section in
                    AIMSectionCard(
                        section: section,
                        searchText: searchText,
                        defaultExpanded: initialSection == section.section,
                        studyMarkInput: StudyMarkInput(
                            type: "aim",
                            reference: "AIM \(section.section)",
                            title: section.title,
                            route: "aim:\(chapter.chapter)"
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
            .onAppear {
                guard let initialSection else { return }
                DispatchQueue.main.async {
                    proxy.scrollTo(initialSection, anchor: .top)
                }
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
    var studyMarkInput: StudyMarkInput? = nil
    var readerPreferences: ReaderPreferences = .standard
    var onExpanded: (() -> Void)? = nil
    @State private var userExpanded: Bool?

    private var shouldExpand: Bool {
        if !searchText.isEmpty { return matchesSearch }
        return userExpanded ?? defaultExpanded
    }

    var matchesSearch: Bool {
        if searchText.isEmpty { return true }
        let query = searchText.lowercased()

        return section.searchableText.lowercased().contains(query)
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
                        }

                        Spacer()

                        Image(systemName: shouldExpand ? "chevron.up" : "chevron.down")
                            .foregroundColor(.secondary)
                    }
                }

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
                            .padding(12)
                            .background(Color(.tertiarySystemBackground))
                            .cornerRadius(8)
                    }

                    // Display subsections if any
                    if let subsections = section.subsections {
                        ForEach(subsections) { subsection in
                            // Only show matching subsections if searching, or all if expanded
                            if searchText.isEmpty ||
                               subsection.searchableText.lowercased().contains(searchText.lowercased()) {

                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        HighlightText(text: subsection.subsection, query: searchText)
                                        Text(".")
                                        HighlightText(text: subsection.title, query: searchText)
                                    }
                                    .font(.subheadline)
                                    .fontWeight(.medium)

                                    HighlightText(text: subsection.content, query: searchText)
                                        .font(readerPreferences.captionFont)
                                        .lineSpacing(readerPreferences.lineSpacing)
                                        .foregroundColor(.primary)

                                    if let keyPoints = subsection.keyPoints, !keyPoints.isEmpty {
                                        ForEach(keyPoints, id: \.self) { point in
                                            HStack(alignment: .top, spacing: 8) {
                                                Circle()
                                                    .fill(Color.green)
                                                    .frame(width: 5, height: 5)
                                                    .padding(.top, 5)
                                                HighlightText(text: point, query: searchText)
                                                    .font(readerPreferences.captionFont)
                                                    .lineSpacing(readerPreferences.lineSpacing)
                                                    .foregroundColor(.primary)
                                            }
                                        }
                                    }
                                }
                                .padding(12)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(8)
                            }
                        }
                    }

                    if let tables = section.tables, !tables.isEmpty {
                        ForEach(Array(tables.enumerated()), id: \.offset) { index, table in
                            AIMTableView(table: table, number: index + 1, searchText: searchText)
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
    @State private var currentPageIndex = 0

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
        let page = pageAIMTableRows(rows: rows, requestedPageIndex: currentPageIndex)
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
                    LazyVStack(alignment: .leading, spacing: 0) {
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
                    currentPageIndex = max(page.pageIndex - 1, 0)
                } label: {
                    Text("Previous")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .disabled(page.pageIndex == 0)
                .accessibilityLabel("Previous table rows")
                .buttonStyle(.bordered)

                Button {
                    currentPageIndex = min(page.pageIndex + 1, page.pageCount - 1)
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
        let rowTexts = rows.map { $0.joined(separator: " ") }
        currentPageIndex = firstMatchingAIMTableRow(rowTexts: rowTexts, query: query)
            .map { $0 / aimTableRowsPerPage } ?? 0
    }

    @ViewBuilder
    private func tableRow(_ values: [String], isHeader: Bool, rowNumber: Int?) -> some View {
        if values.count == 1, columnCount > 1 {
            HighlightText(text: values[0], query: searchText)
                .font(cellFont(forHeader: isHeader))
                .lineSpacing(tableLineSpacing ?? 0)
                .frame(width: CGFloat(columnCount) * 140, alignment: .leading)
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
                        .frame(width: 140, alignment: .leading)
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
    @State private var finishedLoading = false

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
        VStack(alignment: .leading, spacing: 8) {
            Label("Figure \(number)", systemImage: "photo")
                .font(.caption.weight(.semibold))
                .foregroundColor(AviationTheme.accent)
                .accessibilityLabel(accessibilityDescription)

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel(accessibilityDescription)
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
        .task(id: figure.src) {
            await loadImage()
        }
    }

    @MainActor
    private func loadImage() async {
        image = nil
        finishedLoading = false

        guard let url = DataService.shared.figureURL(for: figure, catalog: catalog) else {
            finishedLoading = true
            return
        }

        let decodedImage = await Task.detached(priority: .utility) {
            FigureImageLoader.downsampledImage(at: url, maxPixelSize: 2_048)
        }.value
        guard !Task.isCancelled else { return }

        image = decodedImage
        finishedLoading = true
    }
}

private enum FigureImageLoader {
    static func downsampledImage(at url: URL, maxPixelSize: Int) -> UIImage? {
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
        return UIImage(cgImage: thumbnail)
    }
}

#Preview {
    AIMListView()
}
