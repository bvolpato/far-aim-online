//
//  GlossaryView.swift
//  FARAIMPro
//
//  Pilot/Controller Glossary View
//

import SwiftUI

struct GlossaryView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var searchText = ""
    let initialTerm: String?

    init(initialSearchText: String = "", initialTerm: String? = nil) {
        _searchText = State(initialValue: initialSearchText)
        self.initialTerm = initialTerm
    }
    
    var filteredTerms: [PCGTerm] {
        dataService.searchPCG(query: searchText)
    }
    
    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "text.book.closed.fill")
                    .foregroundStyle(AviationTheme.accent)
                    .frame(width: 38, height: 38)
                    .background(AviationTheme.accent.opacity(0.11))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Pilot / Controller Glossary")
                        .font(.subheadline.weight(.semibold))
                    Text("\(filteredTerms.count) official terms")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(14)
            .background(AviationTheme.raisedSurface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(AviationTheme.border, lineWidth: 1)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            
                if dataService.pcgTerms.isEmpty {
                    LibraryCollectionStateView(
                        catalog: .pcg,
                        title: "Glossary Terms",
                        systemImage: "text.book.closed"
                    )
                } else if filteredTerms.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filteredTerms) { term in
                        GlossaryTermRow(
                            term: term,
                            allTerms: dataService.pcgTerms,
                            searchText: searchText,
                            defaultExpanded: term.term == initialTerm
                        )
                        .id(term.id)
                        .listRowBackground(AviationTheme.raisedSurface)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .scrollContentBackground(.hidden)
                    .listStyle(.insetGrouped)
                }
            }
            .onAppear {
                guard let initialTerm else { return }
                DispatchQueue.main.async {
                    proxy.scrollTo(initialTerm, anchor: .center)
                }
            }
        }
        .navigationTitle("Glossary")
        .searchable(text: $searchText, prompt: "Search official terms")
        .aviationScreen()
    }
}

struct GlossaryTermRow: View {
    let term: PCGTerm
    let allTerms: [PCGTerm]
    let searchText: String
    @State private var isExpanded: Bool

    init(
        term: PCGTerm,
        allTerms: [PCGTerm],
        searchText: String,
        defaultExpanded: Bool = false
    ) {
        self.term = term
        self.allTerms = allTerms
        self.searchText = searchText
        _isExpanded = State(initialValue: defaultExpanded)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: { withAnimation { isExpanded.toggle() } }) {
                HStack {
                    HighlightText(text: term.term, query: searchText)
                        .font(.headline)
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }
            }
            
            if isExpanded {
                Text(linkedGlossaryDefinition(
                    term.definition,
                    terms: allTerms,
                    query: searchText
                ))
                    .font(.body)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
    }
}

private let glossarySeeExpression = try! NSRegularExpression(
    pattern: #"\((See(?:\s+also)?)(\s+ICAO\s+term)?\s+((?:[^()]|\([^()]*\))+?)\.?\)"#,
    options: .caseInsensitive
)

private func normalizeGlossaryTerm(_ value: String) -> String {
    value
        .replacingOccurrences(of: "_", with: " ")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .uppercased()
}

func resolveGlossaryReference(
    _ terms: [PCGTerm],
    reference: String,
    isIcaoTerm: Bool = false
) -> PCGTerm? {
    let normalizedReference = normalizeGlossaryTerm(reference)
    let expectedIcao = "\(normalizedReference) [ICAO]"
    return terms.first { term in
        let normalizedTerm = normalizeGlossaryTerm(term.term)
        if isIcaoTerm {
            return normalizedTerm == expectedIcao || normalizedTerm.hasPrefix(expectedIcao)
        }
        return normalizedTerm == normalizedReference || normalizedTerm.hasPrefix(normalizedReference)
    }
}

private func linkedGlossaryDefinition(
    _ definition: String,
    terms: [PCGTerm],
    query: String
) -> AttributedString {
    let source = definition as NSString
    let matches = glossarySeeExpression.matches(
        in: definition,
        range: NSRange(location: 0, length: source.length)
    )
    var result = AttributedString()
    var offset = 0

    for match in matches {
        result += AttributedString(source.substring(with: NSRange(
            location: offset,
            length: match.range.location - offset
        )))
        let seeType = source.substring(with: match.range(at: 1))
        let isIcaoTerm = match.range(at: 2).location != NSNotFound
        let reference = source.substring(with: match.range(at: 3))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
        result += AttributedString("(\(seeType)\(isIcaoTerm ? " ICAO term " : " ")")

        var referenceText = AttributedString(reference)
        if let target = resolveGlossaryReference(
            terms,
            reference: reference,
            isIcaoTerm: isIcaoTerm
        ) {
            var components = URLComponents()
            components.scheme = "faraimpro"
            components.host = "glossary"
            components.fragment = target.term
            referenceText.link = components.url
            referenceText.foregroundColor = AviationTheme.accent
            referenceText.underlineStyle = .single
        }
        result += referenceText
        result += AttributedString(".)")
        offset = match.range.location + match.range.length
    }
    result += AttributedString(source.substring(from: offset))

    guard !query.isEmpty else { return result }
    let rendered = String(result.characters) as NSString
    var searchRange = NSRange(location: 0, length: rendered.length)
    while searchRange.length > 0 {
        let found = rendered.range(of: query, options: .caseInsensitive, range: searchRange)
        if found.location == NSNotFound { break }
        if let range = Range(found, in: result) {
            result[range].backgroundColor = .yellow.opacity(0.5)
        }
        let nextLocation = found.location + found.length
        searchRange = NSRange(location: nextLocation, length: rendered.length - nextLocation)
    }
    return result
}

// MARK: - Search View

struct SearchView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var searchText = ""
    @State private var results: [DataService.SearchResult] = []
    @State private var selectedFilter = SearchResultFilter.all
    @State private var isSearching = false
    @FocusState private var searchFieldFocused: Bool

    init(initialSearchText: String = "") {
        let query = initialSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        _searchText = State(initialValue: query)
        _results = State(initialValue: [])
    }

    private var availableFilters: [SearchResultFilter] {
        SearchResultFilter.allCases.filter { filter in
            filter == .all || results.contains { $0.type == filter.resultType }
        }
    }

    private var filteredResults: [DataService.SearchResult] {
        guard selectedFilter != .all else { return results }
        return results.filter { $0.type == selectedFilter.resultType }
    }

    private var normalizedSearchText: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search FAR, AIM, Glossary, ACs, cards...", text: $searchText)
                    .textFieldStyle(PlainTextFieldStyle())
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .submitLabel(.search)
                    .focused($searchFieldFocused)
                    .onSubmit { submitSearch() }
                
                if !searchText.isEmpty {
                    Button(action: clearSearch) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(12)
            .background(AviationTheme.raisedSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(AviationTheme.border, lineWidth: 1)
            }
            .padding()

            if normalizedSearchText.count >= 2 && !results.isEmpty {
                SearchFilterBar(
                    filters: availableFilters,
                    selectedFilter: $selectedFilter,
                    count: { resultCount(for: $0) }
                )
                .padding(.horizontal)
                .padding(.bottom, 8)
            }
            
            if normalizedSearchText.count < 2 {
                VStack(spacing: 20) {
                    Spacer()
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 50))
                        .foregroundColor(.secondary)
                    Text("Enter at least 2 characters to search")
                        .foregroundColor(.secondary)
                    if !dataService.searchHistory.isEmpty {
                        HStack {
                            Text("Recent searches")
                                .font(.headline)
                            Spacer()
                            Button("Clear") {
                                dataService.clearSearchHistory()
                            }
                            .font(.subheadline)
                        }
                        .padding(.horizontal)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(dataService.searchHistory, id: \.self) { query in
                                    Button(query) { searchText = query }
                                        .buttonStyle(.bordered)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                    Spacer()
                }
            } else if isSearching {
                Spacer()
                ProgressView("Searching")
                Spacer()
            } else if results.isEmpty {
                VStack(spacing: 20) {
                    Spacer()
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 50))
                        .foregroundColor(.secondary)
                    Text("No results found for \"\(normalizedSearchText)\"")
                        .foregroundColor(.secondary)
                    Spacer()
                }
            } else if filteredResults.isEmpty {
                VStack(spacing: 20) {
                    Spacer()
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .font(.system(size: 50))
                        .foregroundColor(.secondary)
                    Text("No \(selectedFilter.label) results for \"\(normalizedSearchText)\"")
                        .foregroundColor(.secondary)
                    Spacer()
                }
            } else {
                Text(resultCountText)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)

                List(filteredResults) { result in
                    NavigationLink(destination: searchDestination(for: result)) {
                        SearchResultRow(result: result, searchText: normalizedSearchText)
                    }
                    .simultaneousGesture(TapGesture().onEnded {
                        dataService.recordSearch(normalizedSearchText)
                    })
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollContentBackground(.hidden)
                .listStyle(.plain)
            }
        }
        .navigationTitle("Search")
        .aviationScreen()
        .onAppear {
            guard searchText.isEmpty else { return }
            DispatchQueue.main.async { searchFieldFocused = true }
        }
        .task(id: searchText) {
            let query = normalizedSearchText
            guard query.count >= 2 else {
                results = []
                selectedFilter = .all
                isSearching = false
                return
            }

            isSearching = true
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let nextResults = await Task.detached(priority: .userInitiated) {
                DataService.shared.search(query: query)
            }.value
            guard !Task.isCancelled else { return }
            results = nextResults
            selectedFilter = .all
            isSearching = false
        }
    }

    private var resultCountText: String {
        selectedFilter == .all ? "\(filteredResults.count) results" : "\(filteredResults.count) filtered results"
    }

    private func clearSearch() {
        searchText = ""
        searchFieldFocused = true
    }

    private func submitSearch() {
        let query = normalizedSearchText
        guard query.count >= 2 else { return }
        searchText = query
        dataService.recordSearch(query)
        searchFieldFocused = false
    }

    private func resultCount(for filter: SearchResultFilter) -> Int {
        filter == .all ? results.count : results.filter { $0.type == filter.resultType }.count
    }

    @ViewBuilder
    private func searchDestination(for result: DataService.SearchResult) -> some View {
        switch result.type {
        case "far":
            if let partNumber = Self.referenceNumber(from: result.link, prefix: "far"),
               let part = dataService.farParts.first(where: { $0.part == partNumber }) {
                FARPartDetailView(
                    part: part,
                    initialSearchText: normalizedSearchText,
                    initialSection: Self.sectionAnchor(from: result.link)
                )
            } else {
                FARListView()
            }
        case "aim":
            if let chapterNumber = Self.referenceNumber(from: result.link, prefix: "aim"),
               let chapter = dataService.aimChapters.first(where: { $0.chapter == chapterNumber }) {
                AIMChapterDetailView(
                    chapter: chapter,
                    initialSearchText: normalizedSearchText,
                    initialSection: Self.sectionAnchor(from: result.link)
                )
            } else {
                AIMListView()
            }
        case "pcg":
            GlossaryView(initialSearchText: normalizedSearchText, initialTerm: result.title)
        case "ac":
            if let circularId = result.link.split(separator: "#", maxSplits: 1).last.map(String.init),
               let circular = dataService.advisoryCirculars.first(where: { $0.id == circularId }),
               circular.contentPath != nil {
                AdvisoryCircularReaderView(ac: circular, initialSearchText: normalizedSearchText)
            } else {
                AdvisoryCircularsView(initialSearchText: normalizedSearchText)
            }
        case "flashcard":
            if let deckId = result.link.split(separator: "/").last.map(String.init),
               let deck = dataService.flashcardDecks.first(where: { $0.id == deckId }) {
                FlashcardStudyView(deck: deck)
            } else {
                FlashcardListView()
            }
        default:
            EmptyView()
        }
    }

    private static func referenceNumber(from link: String, prefix: String) -> Int? {
        guard link.hasPrefix("\(prefix)/") else { return nil }
        return link
            .dropFirst(prefix.count + 1)
            .split(separator: "#")
            .first
            .flatMap { Int($0) }
    }

    private static func sectionAnchor(from link: String) -> String? {
        link.split(separator: "#", maxSplits: 1).dropFirst().first.map(String.init)
    }
}

private enum SearchResultFilter: String, CaseIterable, Identifiable {
    case all
    case far
    case aim
    case pcg
    case ac
    case flashcard

    var id: String { rawValue }

    var resultType: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .far: return "FAR"
        case .aim: return "AIM"
        case .pcg: return "Glossary"
        case .ac: return "ACs"
        case .flashcard: return "Flashcards"
        }
    }
}

private struct SearchFilterBar: View {
    let filters: [SearchResultFilter]
    @Binding var selectedFilter: SearchResultFilter
    let count: (SearchResultFilter) -> Int

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(filters) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        HStack(spacing: 6) {
                            if selectedFilter == filter {
                                Image(systemName: "checkmark")
                                    .font(.caption.weight(.bold))
                            }
                            Text("\(filter.label) \(count(filter))")
                                .font(.subheadline.weight(.semibold))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(selectedFilter == filter ? Color.blue.opacity(0.14) : Color(.secondarySystemBackground))
                        .foregroundColor(selectedFilter == filter ? .blue : .primary)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(selectedFilter == filter ? Color.blue.opacity(0.35) : Color(.separator), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

struct SearchResultRow: View {
    let result: DataService.SearchResult
    let searchText: String
    
    var typeColor: Color {
        switch result.type {
        case "far": return .blue
        case "aim": return .green
        case "pcg": return .purple
        case "ac": return .teal
        case "flashcard": return .orange
        default: return .gray
        }
    }
    
    var typeLabel: String {
        switch result.type {
        case "far": return "FAR"
        case "aim": return "AIM"
        case "pcg": return "PCG"
        case "ac": return "AC"
        case "flashcard": return "CARD"
        default: return result.type.uppercased()
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(typeLabel)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(typeColor)
                    .cornerRadius(4)
                
                Text(result.reference)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            HighlightText(text: result.title, query: searchText)
                .font(.headline)
                .foregroundColor(.primary)
            
            HighlightText(text: result.content, query: searchText)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    GlossaryView()
}
