//
//  FARViews.swift
//  FARAIMPro
//
//  Views for displaying FAR content
//

import SwiftUI
import Combine

// MARK: - Highlight Helper (Merged here to avoid project file issues)

struct HighlightText: View {
    let text: String
    let query: String

    var body: some View {
        if #available(iOS 15.0, *) {
            HighlightText15(text: text, query: query)
        } else {
            highlightedText()
        }
    }

    func highlightedText() -> Text {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return Text(text) }

        var result = Text("")
        var currentIndex = text.startIndex

        while let range = text.range(of: trimmed, options: .caseInsensitive, range: currentIndex..<text.endIndex) {
            let prefix = text[currentIndex..<range.lowerBound]
            result = result + Text(String(prefix))

            let match = text[range]
            result = result + Text(String(match)).bold().underline()

            currentIndex = range.upperBound
        }

        let suffix = text[currentIndex..<text.endIndex]
        result = result + Text(String(suffix))

        return result
    }
}

// Improved version using AttributedString for iOS 15+
@available(iOS 15.0, *)
struct HighlightText15: View {
    let text: String
    let query: String

    var body: some View {
        Text(attributedString)
    }

    var attributedString: AttributedString {
        HighlightedTextCache.value(text: text, query: query)
    }
}

@available(iOS 15.0, *)
private enum HighlightedTextCache {
    private final class Key: NSObject {
        let text: String
        let query: String

        init(text: String, query: String) {
            self.text = text
            self.query = query
        }

        override var hash: Int {
            var hasher = Hasher()
            hasher.combine(text)
            hasher.combine(query)
            return hasher.finalize()
        }

        override func isEqual(_ object: Any?) -> Bool {
            guard let other = object as? Key else { return false }
            return text == other.text && query == other.query
        }
    }

    private final class Entry {
        let value: AttributedString
        init(_ value: AttributedString) { self.value = value }
    }

    private static let storage: NSCache<Key, Entry> = {
        let cache = NSCache<Key, Entry>()
        cache.countLimit = 2048
        cache.totalCostLimit = 8 * 1024 * 1024
        return cache
    }()

    static func value(text: String, query: String) -> AttributedString {
        let key = Key(text: text, query: query)
        if let entry = storage.object(forKey: key) { return entry.value }
        let value = render(text: text, query: query)
        // Estimate keys, formatted text, and entry overhead. NSCache can discard
        // these immutable values under memory pressure without losing drafts.
        storage.setObject(Entry(value), forKey: key, cost: text.utf8.count * 4 + query.utf8.count + 256)
        return value
    }

    private static func render(text: String, query: String) -> AttributedString {
        var attributed = (try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)

        let terms = SearchQueryMatcher.highlightTerms(for: query)
        guard !terms.isEmpty else { return attributed }

        let plainText = String(attributed.characters)

        for term in terms where !term.isEmpty {
            let requireBoundaries = SearchQueryMatcher.requiresTokenBoundaries(for: term)
            var searchRange = plainText.startIndex..<plainText.endIndex
            while let foundRange = plainText.range(of: term, options: .caseInsensitive, range: searchRange) {
                if !requireBoundaries || SearchQueryMatcher.hasTokenBoundaries(in: plainText, range: foundRange) {
                    let nsRange = NSRange(foundRange, in: plainText)
                    if let attrRange = Range(nsRange, in: attributed) {
                        attributed[attrRange].backgroundColor = .yellow.opacity(0.45)
                        attributed[attrRange].foregroundColor = .black
                    }
                }
                searchRange = foundRange.upperBound..<plainText.endIndex
            }
        }

        return attributed
    }
}

final class StudyMarkNoteState: ObservableObject {
    @Published var draft = ""
    @Published var isOpen = false {
        willSet {
            if isOpen != newValue { onVisibilityChange?() }
        }
    }
    var onVisibilityChange: (() -> Void)?
}

enum StudyMarkToolsPresentation {
    case full, actions, note
}

struct StudyMarkTools: View {
    @ObservedObject var dataService = DataService.shared
    let input: StudyMarkInput
    @StateObject private var noteState: StudyMarkNoteState
    var presentation: StudyMarkToolsPresentation = .full
    var onNoteFocusChange: ((Bool) -> Void)?
    @FocusState private var noteFocused: Bool
    @State private var confirmRemoval = false
    @State private var feedbackTrigger = 0

    init(input: StudyMarkInput, noteState: StudyMarkNoteState? = nil,
         presentation: StudyMarkToolsPresentation = .full, onNoteFocusChange: ((Bool) -> Void)? = nil) {
        self.input = input
        _noteState = StateObject(wrappedValue: noteState ?? StudyMarkNoteState())
        self.presentation = presentation
        self.onNoteFocusChange = onNoteFocusChange
    }

    private var mark: StudyMark? {
        dataService.getStudyMark(input)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if presentation != .note {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        actionButtons(showTitles: true)
                    }
                    .controlSize(.small)

                    HStack(spacing: 8) {
                        actionButtons(showTitles: false)
                    }
                    .controlSize(.regular)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 44))], alignment: .leading, spacing: 8) {
                        actionButtons(showTitles: false)
                    }
                    .controlSize(.regular)
                }
            }

            if noteState.isOpen && presentation != .actions {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Note for \(input.reference)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    TextEditor(text: $noteState.draft)
                        .focused($noteFocused)
                        .accessibilityLabel("Note for \(input.reference)")
                        .accessibilityIdentifier("study-note-\(input.key)")
                        .frame(minHeight: 90)
                        .padding(8)
                        .background(Color(.systemBackground))
                        .cornerRadius(8)
                        .toolbar {
                            ToolbarItemGroup(placement: .keyboard) {
                                if noteFocused {
                                    Spacer()
                                    Button("Done") { noteFocused = false }
                                        .accessibilityLabel("Dismiss note keyboard")
                                        .accessibilityIdentifier("study-note-keyboard-done-\(input.key)")
                                }
                            }
                        }
                    Button("Save note") {
                        dataService.saveNote(input, note: noteState.draft)
                        feedbackTrigger += 1
                        noteState.isOpen = false
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, presentation == .note ? 5 : 12)
        .padding(.bottom, presentation == .actions && noteState.isOpen ? 5 : 12)
        .background(AviationTheme.surface)
        .clipShape(UnevenRoundedRectangle(
            topLeadingRadius: presentation == .note ? 0 : 14,
            bottomLeadingRadius: presentation == .actions && noteState.isOpen ? 0 : 14,
            bottomTrailingRadius: presentation == .actions && noteState.isOpen ? 0 : 14,
            topTrailingRadius: presentation == .note ? 0 : 14
        ))
        .onChange(of: noteFocused) { _, focused in onNoteFocusChange?(focused) }
        .onDisappear { onNoteFocusChange?(false) }
        .sensoryFeedback(.selection, trigger: feedbackTrigger)
        .confirmationDialog(
            "Remove \(input.reference) from Study?",
            isPresented: $confirmRemoval,
            titleVisibility: .visible
        ) {
            Button("Remove study item", role: .destructive) {
                dataService.removeStudyMark(key: input.key)
                noteState.draft = ""
                noteState.isOpen = false
                feedbackTrigger += 1
            }
        } message: {
            Text("This removes its bookmark, highlight, note, and review status.")
        }
    }

    @ViewBuilder
    private func actionButtons(showTitles: Bool) -> some View {
        Button(action: { performSelection { dataService.toggleSaved(input) } }) {
            actionLabel(
                mark?.saved == true ? "Saved" : "Save",
                systemImage: mark?.saved == true ? "bookmark.fill" : "bookmark",
                showTitle: showTitles
            )
        }
        .buttonStyle(.borderedProminent)
        .tint(mark?.saved == true ? .blue : .gray)

        Button(action: {
            noteState.draft = mark?.note ?? ""
            withAnimation { noteState.isOpen.toggle() }
        }) {
            actionLabel(
                (mark?.note.isEmpty == false) ? "Note" : "Add note",
                systemImage: "note.text",
                showTitle: showTitles
            )
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("study-note-toggle-\(input.key)")

        Button(action: { performSelection { dataService.toggleHighlighted(input) } }) {
            actionLabel(
                mark?.highlighted == true ? "Highlighted" : "Highlight",
                systemImage: mark?.highlighted == true ? "star.fill" : "star",
                showTitle: showTitles
            )
        }
        .buttonStyle(.bordered)
        .tint(mark?.highlighted == true ? .yellow : .gray)

        Button(action: { performSelection { dataService.markReviewed(input) } }) {
            actionLabel(
                mark?.reviewedAt == nil ? "Review" : "Reviewed",
                systemImage: "checkmark.circle",
                showTitle: showTitles
            )
        }
        .buttonStyle(.bordered)
        .tint(mark?.reviewedAt == nil ? .gray : .green)

        ShareLink(item: shareText) {
            actionLabel("Share", systemImage: "square.and.arrow.up", showTitle: showTitles)
        }
        .buttonStyle(.bordered)

        if mark != nil {
            Button(role: .destructive, action: { confirmRemoval = true }) {
                actionLabel("Remove", systemImage: "trash", showTitle: showTitles)
            }
            .buttonStyle(.bordered)
        }
    }

    private var shareText: String {
        "\(input.reference) - \(input.title)\n\(publicReferenceURL)"
    }

    private var publicReferenceURL: String {
        publicReferenceLink(for: input.route)
    }

    private func performSelection(_ action: () -> Void) {
        action()
        feedbackTrigger += 1
    }

    @ViewBuilder
    private func actionLabel(_ title: String, systemImage: String, showTitle: Bool) -> some View {
        if showTitle {
            Label(title, systemImage: systemImage)
                .lineLimit(1)
        } else {
            Image(systemName: systemImage)
                .accessibilityLabel(Text(title))
                .frame(minWidth: 24)
        }
    }
}

func publicReferenceLink(for route: String) -> String {
    if route.hasPrefix("far:") || route.hasPrefix("aim:") {
        let isFAR = route.hasPrefix("far:")
        let prefix = isFAR ? "far:" : "aim:"
        let baseURL = isFAR ? "https://faraim.online/far/" : "https://faraim.online/aim/"
        let remainder = String(route.dropFirst(prefix.count))
        let parts = remainder.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
        let identifier = String(parts[0])
        if parts.count == 2 {
            let rawFragment = String(parts[1])
            let unescaped = rawFragment.removingPercentEncoding ?? rawFragment
            if !unescaped.isEmpty,
               let encoded = unescaped.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed) {
                return "\(baseURL)\(identifier)#\(encoded)"
            }
        }
        return "\(baseURL)\(identifier)"
    }
    if route.hasPrefix("ac:") {
        return "https://faraim.online/advisory-circulars/\(route.replacingOccurrences(of: "ac:", with: ""))"
    }
    if route == "ac" {
        return "https://faraim.online/advisory-circulars"
    }
    return "https://faraim.online"
}

enum ReaderDensity: String, CaseIterable, Identifiable {
    case compact
    case standard
    case comfortable

    var id: String { rawValue }

    var label: String {
        switch self {
        case .compact: return "Compact"
        case .standard: return "Standard"
        case .comfortable: return "Comfort"
        }
    }
}

struct ReaderPreferences {
    static let fontScales: [CGFloat] = [0.9, 1, 1.1, 1.22, 1.36]
    static let standard = ReaderPreferences(fontScaleIndex: 1, density: .standard)

    let fontScaleIndex: Int
    let density: ReaderDensity
    var bodySize: CGFloat = 17
    var subheadlineSize: CGFloat = 15
    var captionSize: CGFloat = 13

    var fontScale: CGFloat {
        Self.fontScales[fontScaleIndex.clamped(to: 0...(Self.fontScales.count - 1))]
    }

    var bodyFont: Font { .system(size: bodySize * fontScale) }
    var subheadlineFont: Font { .system(size: subheadlineSize * fontScale) }
    var captionFont: Font { .system(size: captionSize * fontScale) }

    var lineSpacing: CGFloat {
        switch density {
        case .compact: return 2
        case .standard: return 5
        case .comfortable: return 8
        }
    }

    var cardPadding: CGFloat {
        switch density {
        case .compact: return 12
        case .standard: return 16
        case .comfortable: return 20
        }
    }
}

struct ReaderTypography: DynamicProperty {
    @ScaledMetric(relativeTo: .body) private var bodySize: CGFloat = 17
    @ScaledMetric(relativeTo: .subheadline) private var subheadlineSize: CGFloat = 15
    @ScaledMetric(relativeTo: .caption) private var captionSize: CGFloat = 13

    func preferences(fontScaleIndex: Int, density: ReaderDensity) -> ReaderPreferences {
        ReaderPreferences(
            fontScaleIndex: fontScaleIndex,
            density: density,
            bodySize: bodySize,
            subheadlineSize: subheadlineSize,
            captionSize: captionSize
        )
    }
}

func shouldPreserveReaderAnchor(searchText: String, initialSearchText: String) -> Bool {
    let initialQuery = initialSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
    return !initialQuery.isEmpty && searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        .caseInsensitiveCompare(initialQuery) == .orderedSame
}

struct ReaderControls: View {
    @Binding var fontScaleIndex: Int
    @Binding var densityRawValue: String
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var fontScale: CGFloat {
        ReaderPreferences.fontScales[fontScaleIndex.clamped(to: 0...(ReaderPreferences.fontScales.count - 1))]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Reader", systemImage: "textformat.size")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)

            ViewThatFits(in: .horizontal) {
                controls
                VStack(alignment: .leading, spacing: 10) {
                    sizeControls
                    densityPicker
                    resetButton
                }
            }
        }
        .padding(12)
        .background(AviationTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var controls: some View {
        HStack(spacing: 10) {
            sizeControls
            densityPicker
            resetButton
        }
    }

    private var sizeControls: some View {
        HStack(spacing: 8) {
            Button {
                fontScaleIndex = max(fontScaleIndex - 1, 0)
            } label: {
                Image(systemName: "minus")
                    .frame(minWidth: 28, minHeight: 32)
            }
            .disabled(fontScaleIndex <= 0)
            .accessibilityLabel("Decrease reader text size")
            .accessibilityIdentifier("reader-text-decrease")

            Text("\(Int((fontScale * 100).rounded()))%")
                .font(.caption)
                .fontWeight(.semibold)
                .fixedSize()
                .frame(minWidth: 44)
                .accessibilityLabel("Reader text size, \(Int((fontScale * 100).rounded())) percent")

            Button {
                fontScaleIndex = min(fontScaleIndex + 1, ReaderPreferences.fontScales.count - 1)
            } label: {
                Image(systemName: "plus")
                    .frame(minWidth: 28, minHeight: 32)
            }
            .disabled(fontScaleIndex >= ReaderPreferences.fontScales.count - 1)
            .accessibilityLabel("Increase reader text size")
            .accessibilityIdentifier("reader-text-increase")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    @ViewBuilder
    private var densityPicker: some View {
        if dynamicTypeSize.isAccessibilitySize {
            densityOptions.pickerStyle(.menu)
        } else {
            densityOptions.pickerStyle(.segmented)
        }
    }

    private var densityOptions: some View {
        Picker("Reader density", selection: $densityRawValue) {
            ForEach(ReaderDensity.allCases) { density in
                Text(density.label).tag(density.rawValue)
            }
        }
        .frame(maxWidth: 320)
        .accessibilityIdentifier("reader-density")
    }

    private var resetButton: some View {
        Button {
            fontScaleIndex = ReaderPreferences.standard.fontScaleIndex
            densityRawValue = ReaderPreferences.standard.density.rawValue
        } label: {
            Image(systemName: "arrow.counterclockwise")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .accessibilityLabel("Reset reader controls")
    }
}

struct ReaderControlsSheet: View {
    @Binding var fontScaleIndex: Int
    @Binding var densityRawValue: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                ReaderControls(fontScaleIndex: $fontScaleIndex, densityRawValue: $densityRawValue)
                    .frame(maxWidth: 480)
                    .padding()
                    .frame(maxWidth: .infinity)
            }
            .navigationTitle("Reader Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("reader-controls-done")
                }
            }
            .aviationScreen()
        }
        .presentationDetents([.medium, .large])
    }
}

extension Comparable {
    func clamped(to limits: ClosedRange<Self>) -> Self {
        min(max(self, limits.lowerBound), limits.upperBound)
    }
}

struct LibraryCollectionStateView: View {
    @ObservedObject private var dataService = DataService.shared
    let catalog: DataCatalog
    let title: String
    let systemImage: String
    var minHeight: CGFloat = 440

    var body: some View {
        VStack(spacing: 16) {
            switch dataService.loadState {
            case .loading:
                ProgressView("Loading \(title)")
            case .loaded:
                ContentUnavailableView(
                    "No \(title)",
                    systemImage: systemImage,
                    description: Text("Bundled content is empty.")
                )
            case .failed:
                if dataService.loadFailed(for: catalog) {
                    ContentUnavailableView(
                        "Couldn’t Load \(title)",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Bundled content could not be read. Try loading it again.")
                    )
                    Button("Retry", action: dataService.retryLoading)
                        .buttonStyle(.borderedProminent)
                } else {
                    ContentUnavailableView(
                        "No \(title)",
                        systemImage: systemImage,
                        description: Text("Bundled content is empty.")
                    )
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: minHeight)
        .padding()
    }
}

struct LibraryLoadErrorBanner: View {
    @ObservedObject private var dataService = DataService.shared
    let catalog: DataCatalog

    var body: some View {
        if dataService.loadFailed(for: catalog) {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(AviationTheme.amber)
                    .accessibilityHidden(true)
                Text("Some bundled content could not be loaded.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Button("Retry", action: dataService.retryLoading)
                    .buttonStyle(.bordered)
            }
            .padding(12)
            .background(AviationTheme.amber.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .contain)
        }
    }
}

struct FARListView: View {
    @ObservedObject var dataService = DataService.shared
    @State private var searchText = ""
    @State private var displayedParts: [FARPart] = DataService.shared.farParts
    @State private var isFiltering = false

    var body: some View {
        ScrollView {
            if dataService.farParts.isEmpty {
                LibraryCollectionStateView(
                    catalog: .far,
                    title: "FAR Parts",
                    systemImage: "doc.text"
                )
            } else if displayedParts.isEmpty && isFiltering {
                ProgressView("Searching FAR…")
                    .frame(maxWidth: .infinity, minHeight: 440)
            } else if displayedParts.isEmpty {
                ContentUnavailableView(
                    "No matching parts",
                    systemImage: "doc.text.magnifyingglass",
                    description: Text("Try another title, section, or phrase.")
                )
                .frame(minHeight: 440)
            } else {
                LazyVStack(alignment: .leading, spacing: 12) {
                    LibraryLoadErrorBanner(catalog: .far)

                    ReferenceLibraryBanner(
                        eyebrow: "14 CFR",
                        title: "Federal Aviation Regulations",
                        detail: "\(displayedParts.count) parts available offline",
                        icon: "doc.text.fill"
                    )

                    if let history = dataService.farReadingHistory,
                       let part = dataService.farParts.first(where: { $0.part == Int(history.identifier) }) {
                        NavigationLink(destination: FARPartDetailView(part: part, initialSection: history.section)) {
                            ContinueReadingRow(
                                badge: "CONTINUE · PART \(history.identifier)",
                                title: history.title,
                                icon: "bookmark.fill"
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(displayedParts) { part in
                        NavigationLink(destination: FARPartDetailView(part: part, initialSearchText: searchText)) {
                            ReferenceRowCard(
                                badge: "PART \(part.part)",
                                title: part.title,
                                subtitle: part.subchapterTitle,
                                metadata: part.subchapter.map { "Subchapter \($0)" },
                                query: searchText
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("far-part-\(part.part)")
                    }
                }
                .frame(maxWidth: 900, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("FAR")
        .searchable(text: $searchText, prompt: "Search FAR parts and sections")
        .aviationScreen()
        .task(id: "\(searchText)-\(dataService.farParts.count)") {
            let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                displayedParts = dataService.farParts
                isFiltering = false
                return
            }
            isFiltering = true
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled else { return }
            let filtered = await Task.detached(priority: .userInitiated) {
                DataService.shared.filterFARParts(query: trimmed)
            }.value
            guard !Task.isCancelled else { return }
            displayedParts = filtered
            isFiltering = false
        }
    }
}

struct ReferenceLibraryBanner: View {
    let eyebrow: String
    let title: String
    let detail: String
    let icon: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 54, height: 54)
                .background(AviationTheme.accent)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
                    .font(.caption2.weight(.bold))
                    .tracking(1.3)
                    .foregroundStyle(AviationTheme.accent)
                Text(title)
                    .font(.headline.weight(.bold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }
}

struct ReferenceRowCard: View {
    let badge: String
    let title: String
    let subtitle: String?
    let metadata: String?
    var query: String = ""

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(badge)
                        .font(.caption2.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(AviationTheme.accent)

                    if let metadata {
                        Text(metadata)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                HighlightText(text: title, query: query)
                    .font(.headline)
                    .foregroundStyle(.primary)

                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .padding(17)
        .background(AviationTheme.raisedSurface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(AviationTheme.border, lineWidth: 1)
        }
    }
}

struct FARReaderSection: Identifiable {
    var id: String { section.section }
    let section: FARSection
    let groupTitle: String?
    let referenceLabel: String?
}

struct FARReaderRowID: Hashable {
    enum Kind: Hashable {
        case partHeader, groupHeading, sectionHeader, studyTools, noteEditor
        case paragraph(Int), table(Int), heading(String), definition(Int), abbreviation(Int)
        case keyPoint(Int), figure(Int), empty, studyFooter
    }

    let part: Int
    let section: String
    let kind: Kind
}

enum FARReaderRowContent {
    case partHeader, groupHeading(String), sectionHeader, studyTools, noteEditor
    case paragraph(String), table(AIMTable, number: Int), heading(String)
    case definition(Definition), abbreviation(Abbreviation), keyPoint(String)
    case figure(AIMFigure, number: Int), reserved, noResults, studyFooter
}

struct FARReaderRow: Identifiable {
    let id: FARReaderRowID
    let content: FARReaderRowContent
    let sectionIndex: Int?
    let spacingBefore: CGFloat
    var beginsCard = false
    var endsCard = false
}

struct FARReaderRows {
    let rows: [FARReaderRow]
    let activeQuery: String
    let matchingSectionIDs: [String]

    func headerID(for section: String) -> FARReaderRowID? {
        rows.first { $0.id.section == section && $0.id.kind == .sectionHeader }?.id
    }

    var firstHeaderID: FARReaderRowID? {
        rows.first { $0.id.kind == .sectionHeader }?.id
    }
}

struct FARReaderDocumentKey: Hashable {
    struct SectionKey: Hashable {
        let fields: [String?]
        let definitions: [[String]]
        let abbreviations: [[String]]
        let keyPoints: [String]
        let figures: [[String?]]
    }

    let part: Int
    let fields: [String?]
    let sections: [SectionKey]

    init(part: FARPart) {
        self.part = part.part
        fields = [part.title, part.cfr, part.subchapter, part.subchapterTitle, part.effectiveDate, part.source, part.url]
        sections = FARReaderDocument.flatten(part).map { item in
            SectionKey(
                fields: [item.section.section, item.section.title, item.section.content, item.groupTitle, item.referenceLabel],
                definitions: (item.section.definitions ?? []).map { [$0.term, $0.definition] },
                abbreviations: (item.section.abbreviations ?? []).map { [$0.abbr, $0.meaning] },
                keyPoints: item.section.keyPoints ?? [],
                figures: (item.section.figures ?? []).map { [$0.src, $0.alt, $0.caption, $0.originalUrl] }
            )
        }
    }
}

final class FARReaderSession: ObservableObject {
    let objectWillChange = ObservableObjectPublisher()
    private var query: String
    private var expanded: [String: Bool] = [:]
    private var notes: [String: StudyMarkNoteState] = [:]
    private var tablePages: [FARReaderRowID: (query: String, rows: [[String]], page: Int)] = [:]

    init(query: String = "") {
        self.query = query
    }

    func synchronizeQuery(_ query: String) {
        guard self.query != query else { return }
        objectWillChange.send()
        self.query = query
        expanded.removeAll(keepingCapacity: true)
        tablePages.removeAll(keepingCapacity: true)
    }

    func expansionOverrides(for query: String) -> [String: Bool] {
        self.query == query ? expanded : [:]
    }

    func isExpanded(sectionID: String, query: String, defaultExpanded: Bool) -> Bool {
        expansionOverrides(for: query)[sectionID] ?? defaultExpanded
    }

    func setExpanded(_ value: Bool, for sectionID: String) {
        objectWillChange.send()
        expanded[sectionID] = value
    }

    func noteState(for key: String) -> StudyMarkNoteState {
        if let note = notes[key] { return note }
        let note = StudyMarkNoteState()
        note.onVisibilityChange = { [weak self] in self?.objectWillChange.send() }
        notes[key] = note
        return note
    }

    var openNoteKeys: Set<String> {
        Set(notes.compactMap { $0.value.isOpen ? $0.key : nil })
    }

    func tablePage(for id: FARReaderRowID, table: AIMTable, query: String) -> Int {
        if let saved = tablePages[id], saved.query == query, saved.rows == (table.rows ?? []) {
            return pageAIMTableRows(rows: table.rows ?? [], requestedPageIndex: saved.page).pageIndex
        }
        let page = firstMatchingAIMTableRow(
            rowTexts: (table.rows ?? []).map { $0.joined(separator: " ") }, query: query
        ).map { $0 / aimTableRowsPerPage } ?? 0
        tablePages[id] = (query, table.rows ?? [], page)
        return page
    }

    func setTablePage(_ page: Int, for id: FARReaderRowID, table: AIMTable, query: String) {
        objectWillChange.send()
        tablePages[id] = (query, table.rows ?? [], pageAIMTableRows(rows: table.rows ?? [], requestedPageIndex: page).pageIndex)
    }
}

final class FARReaderDocument {
    private struct PlanKey: Equatable {
        let query: String
        let initialQuery: String
        let initialSection: String?
        let expanded: [String: Bool]
        let openNotes: Set<String>
    }

    let key: FARReaderDocumentKey
    let part: FARPart
    let sections: [FARReaderSection]
    private let searchInputs: [String]
    private let contentRows: [[FARReaderRow]]
    private let searchMemo = FARReaderSearchMemo()
    private var lastPlan: (key: PlanKey, value: FARReaderRows)?

    init(part: FARPart) {
        self.part = part
        key = FARReaderDocumentKey(part: part)
        sections = Self.flatten(part)
        let context = "far part \(part.part) \(part.cfr)"
        searchInputs = sections.map { item in
            "\(context) \(item.groupTitle ?? "") \(item.referenceLabel ?? "§ \(item.id)") \(item.section.searchableText)"
        }
        contentRows = sections.enumerated().map { index, item in
            Self.prepareContent(part: part.part, item: item, sectionIndex: index)
        }
    }

    static func flatten(_ part: FARPart) -> [FARReaderSection] {
        let direct = (part.sections ?? []).map {
            FARReaderSection(section: $0, groupTitle: nil, referenceLabel: nil)
        }
        let subparts = (part.subparts ?? []).flatMap { subpart in
            subpart.sections.map {
                FARReaderSection(section: $0, groupTitle: "Subpart \(subpart.subpart) - \(subpart.title)", referenceLabel: nil)
            }
        }
        let appendices = (part.appendices ?? []).map { appendix in
            FARReaderSection(
                section: FARSection(section: appendix.appendix, title: appendix.title, content: appendix.content,
                                    definitions: nil, abbreviations: nil, keyPoints: nil, figures: appendix.figures),
                groupTitle: "Appendices", referenceLabel: appendix.appendix
            )
        }
        return direct + subparts + appendices
    }

    func studyMarkInput(for index: Int) -> StudyMarkInput {
        let item = sections[index]
        let reference = item.referenceLabel ?? "§ \(item.id)"
        return StudyMarkInput(type: "far", reference: reference,
                              title: item.section.title.isEmpty ? (item.referenceLabel ?? "FAR \(item.id)") : item.section.title,
                              route: "far:\(part.part)#\(item.id)")
    }

    func rows(query: String, initialQuery: String, initialSection: String?, session: FARReaderSession) -> FARReaderRows {
        let planKey = PlanKey(query: query, initialQuery: initialQuery, initialSection: initialSection,
                              expanded: session.expansionOverrides(for: query), openNotes: session.openNoteKeys)
        if let lastPlan, lastPlan.key == planKey { return lastPlan.value }

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let preservesAnchor = shouldPreserveReaderAnchor(searchText: query, initialSearchText: initialQuery)
        let anchorIndex = preservesAnchor ? sections.firstIndex { $0.id == initialSection } : nil
        let matching = searchMemo.matchingIndices(in: searchInputs, query: query, anchorIndex: anchorIndex)
        let initial = initialQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let metadataMatch = !initial.isEmpty && trimmed.caseInsensitiveCompare(initial) == .orderedSame
            && SearchQueryMatcher.matches(
                text: "far part \(part.part) \(part.cfr) \(part.title) \(part.subchapterTitle ?? "")", query: trimmed
            )
        let activeQuery = trimmed.isEmpty || (matching.isEmpty && metadataMatch) ? "" : query
        let selected = activeQuery.isEmpty ? Array(sections.indices) : matching
        var result = [FARReaderRow(id: FARReaderRowID(part: part.part, section: "", kind: .partHeader),
                                   content: .partHeader, sectionIndex: nil, spacingBefore: 0)]
        var previousGroup: String?
        for index in selected {
            let item = sections[index]
            if let group = item.groupTitle, group != previousGroup {
                result.append(FARReaderRow(id: FARReaderRowID(part: part.part, section: item.id, kind: .groupHeading),
                                           content: .groupHeading(group), sectionIndex: nil, spacingBefore: 24))
            }
            previousGroup = item.groupTitle
            let expanded = planKey.expanded[item.id] ?? (!activeQuery.isEmpty || initialSection == item.id)
            var header = FARReaderRow(id: FARReaderRowID(part: part.part, section: item.id, kind: .sectionHeader),
                                      content: .sectionHeader, sectionIndex: index, spacingBefore: 16)
            header.beginsCard = true
            header.endsCard = !expanded
            result.append(header)
            if expanded {
                result.append(FARReaderRow(id: FARReaderRowID(part: part.part, section: item.id, kind: .studyTools),
                                           content: .studyTools, sectionIndex: index, spacingBefore: 12))
                if planKey.openNotes.contains(studyMarkInput(for: index).key) {
                    result.append(FARReaderRow(id: FARReaderRowID(part: part.part, section: item.id, kind: .noteEditor),
                                               content: .noteEditor, sectionIndex: index, spacingBefore: 0))
                }
                result.append(contentsOf: contentRows[index])
                result[result.count - 1].endsCard = true
            }
        }
        if sections.isEmpty || selected.isEmpty {
            result.append(FARReaderRow(id: FARReaderRowID(part: part.part, section: "", kind: .empty),
                                       content: sections.isEmpty ? .reserved : .noResults, sectionIndex: nil, spacingBefore: 24))
        }
        result.append(FARReaderRow(id: FARReaderRowID(part: part.part, section: "", kind: .studyFooter),
                                   content: .studyFooter, sectionIndex: nil, spacingBefore: 16))
        let value = FARReaderRows(rows: result, activeQuery: activeQuery, matchingSectionIDs: selected.map { sections[$0].id })
        lastPlan = (planKey, value)
        return value
    }

    private static func prepareContent(part: Int, item: FARReaderSection, sectionIndex: Int) -> [FARReaderRow] {
        var rows: [FARReaderRow] = []
        func append(_ kind: FARReaderRowID.Kind, _ content: FARReaderRowContent, spacing: CGFloat = 12) {
            rows.append(FARReaderRow(id: FARReaderRowID(part: part, section: item.id, kind: kind),
                                    content: content, sectionIndex: sectionIndex, spacingBefore: spacing))
        }
        if !item.section.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let blocks = FARContentParserCache.blocks(for: item.section.content)
            var tableNumber = 0
            for (index, block) in blocks.enumerated() {
                switch block {
                case .text(let text):
                    append(.paragraph(index), .paragraph(farReaderDisplayText(text, in: blocks, at: index)), spacing: index == 0 ? 12 : 0)
                case .table(let table):
                    tableNumber += 1
                    append(.table(index), .table(table, number: tableNumber), spacing: index == 0 ? 12 : 0)
                }
            }
        }
        if let definitions = item.section.definitions, !definitions.isEmpty {
            append(.heading("definitions"), .heading("Definitions"), spacing: 20)
            for (index, definition) in definitions.enumerated() {
                append(.definition(index), .definition(definition))
            }
        }
        if let abbreviations = item.section.abbreviations, !abbreviations.isEmpty {
            append(.heading("abbreviations"), .heading("Abbreviations"), spacing: 20)
            for (index, abbreviation) in abbreviations.enumerated() {
                append(.abbreviation(index), .abbreviation(abbreviation))
            }
        }
        if let points = item.section.keyPoints, !points.isEmpty {
            append(.heading("key-points"), .heading("Key Points"), spacing: 20)
            for (index, point) in points.enumerated() { append(.keyPoint(index), .keyPoint(point)) }
        }
        for (index, figure) in (item.section.figures ?? []).enumerated() {
            append(.figure(index), .figure(figure, number: index + 1), spacing: index == 0 ? 12 : 14)
        }
        return rows
    }
}

final class FARReaderSearchMemo {
    private struct Entry {
        let inputs: [String]
        let query: String
        let anchorIndex: Int?
        let matchingIndices: [Int]
    }

    private var entry: Entry?

    func matchingIndices(in inputs: [String], query: String, anchorIndex: Int?) -> [Int] {
        if let entry, entry.query == query, entry.anchorIndex == anchorIndex, entry.inputs == inputs {
            return entry.matchingIndices
        }

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let matchingIndices = inputs.indices.filter { index in
            trimmed.isEmpty || index == anchorIndex || SearchQueryMatcher.matches(text: inputs[index], query: trimmed)
        }
        entry = Entry(inputs: inputs, query: query, anchorIndex: anchorIndex, matchingIndices: matchingIndices)
        return matchingIndices
    }
}

struct FARPartDetailView: View {
    let part: FARPart
    let initialSection: String?
    private let initialSearchText: String
    @State private var searchText: String
    @StateObject private var session: FARReaderSession
    @State private var document: FARReaderDocument?
    @State private var visibleRowID: FARReaderRowID?
    @State private var focusedNoteID: FARReaderRowID?
    @State private var viewportSize: CGSize = .zero
    @State private var rowLayoutAppeared = false
    @State private var didRequestInitialScroll = false
    @AppStorage("far-aim-pro-reader-font-scale-index") private var readerFontScaleIndex = 1
    @AppStorage("far-aim-pro-reader-density") private var readerDensityRawValue = ReaderDensity.standard.rawValue
    @State private var showReaderControls = false
    @ObservedObject var dataService = DataService.shared
    private var readerTypography = ReaderTypography()

    init(part: FARPart, initialSearchText: String = "", initialSection: String? = nil) {
        self.part = part
        self.initialSection = initialSection
        self.initialSearchText = initialSearchText
        _searchText = State(initialValue: initialSearchText)
        _session = StateObject(wrappedValue: FARReaderSession(query: initialSearchText))
    }

    var body: some View {
        let sourceKey = FARReaderDocumentKey(part: part)
        let readyDocument = document.flatMap { $0.key == sourceKey ? $0 : nil }
        let preferences = readerTypography.preferences(
            fontScaleIndex: readerFontScaleIndex,
            density: ReaderDensity(rawValue: readerDensityRawValue) ?? .standard
        )

        ScrollView {
            if let document = readyDocument {
                let plan = document.rows(query: searchText, initialQuery: initialSearchText,
                                         initialSection: initialSection, session: session)
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(plan.rows) { row in
                        FARReaderRowView(document: document, row: row, session: session,
                                         query: searchText, activeQuery: plan.activeQuery,
                                         initialSection: initialSection, preferences: preferences) { focused in
                            if focused {
                                focusedNoteID = row.id
                                visibleRowID = row.id
                            } else if focusedNoteID == row.id {
                                focusedNoteID = nil
                            }
                        }
                        .id(row.id)
                    }
                }
                .scrollTargetLayout()
                .padding()
                .onAppear {
                    rowLayoutAppeared = true
                    requestInitialPosition()
                }
                .onDisappear { rowLayoutAppeared = false }
            } else {
                ProgressView("Preparing reader…")
                    .frame(maxWidth: .infinity, minHeight: 200)
            }
        }
        .scrollPosition(id: $visibleRowID, anchor: .top)
        .scrollDismissesKeyboard(.interactively)
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
            let widthChanged = viewportSize.width > 0 && size.width > 0 && viewportSize.width != size.width
            viewportSize = size
            if widthChanged, let focusedNoteID,
               currentPlan?.rows.contains(where: { $0.id == focusedNoteID }) == true {
                visibleRowID = focusedNoteID
            }
            requestInitialPosition()
        }
        .task(id: sourceKey) {
            guard document?.key != sourceKey else { return }
            let sourcePart = part
            let prepared = await Task.detached(priority: .userInitiated) {
                FARReaderDocument(part: sourcePart)
            }.value
            guard !Task.isCancelled else { return }
            document = prepared
            requestInitialPosition()
        }
        .onChange(of: searchText) { _, query in
            session.synchronizeQuery(query)
            didRequestInitialScroll = true
            guard let plan = currentPlan else { return }
            if shouldPreserveReaderAnchor(searchText: query, initialSearchText: initialSearchText),
               let initialSection, let target = plan.headerID(for: initialSection) {
                visibleRowID = target
            } else if !plan.rows.contains(where: { $0.id == visibleRowID }) {
                visibleRowID = plan.firstHeaderID
            }
        }
        .navigationTitle("Part \(part.part)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                ShareLink(item: "14 CFR Part \(part.part) - \(part.title)\n\(publicReferenceLink(for: "far:\(part.part)"))") {
                    Label("Share Part \(part.part)", systemImage: "square.and.arrow.up")
                        .labelStyle(.iconOnly)
                }
                Button(action: { showReaderControls.toggle() }) {
                    Label("Reader controls", systemImage: "textformat.size")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel("Reader controls")
                .accessibilityIdentifier("reader-controls")
                .sheet(isPresented: $showReaderControls) {
                    ReaderControlsSheet(fontScaleIndex: $readerFontScaleIndex, densityRawValue: $readerDensityRawValue)
                }
            }
        }
        .searchable(text: $searchText, prompt: "Find in Part \(part.part)")
        .onAppear {
            dataService.saveFARReadingHistory(part: part.part, title: part.title, section: initialSection)
        }
        .aviationScreen()
    }

    private var currentPlan: FARReaderRows? {
        guard let document, document.key == FARReaderDocumentKey(part: part) else { return nil }
        return document.rows(query: searchText, initialQuery: initialSearchText,
                             initialSection: initialSection, session: session)
    }

    private func requestInitialPosition() {
        guard !didRequestInitialScroll, rowLayoutAppeared,
              viewportSize.width > 0, viewportSize.height > 0,
              searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                .caseInsensitiveCompare(initialSearchText.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame,
              let initialSection, let target = currentPlan?.headerID(for: initialSection) else { return }
        didRequestInitialScroll = true
        visibleRowID = target
    }
}

private struct FARReaderRowView: View {
    let document: FARReaderDocument
    let row: FARReaderRow
    @ObservedObject var session: FARReaderSession
    let query: String
    let activeQuery: String
    let initialSection: String?
    let preferences: ReaderPreferences
    var onNoteFocusChange: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, row.sectionIndex == nil ? 0 : preferences.cardPadding)
        .padding(.top, row.sectionIndex == nil || row.beginsCard ? (row.beginsCard ? preferences.cardPadding : 0) : row.spacingBefore)
        .padding(.bottom, row.endsCard ? preferences.cardPadding : 0)
        .background {
            if row.sectionIndex != nil {
                UnevenRoundedRectangle(
                    topLeadingRadius: row.beginsCard ? 16 : 0,
                    bottomLeadingRadius: row.endsCard ? 16 : 0,
                    bottomTrailingRadius: row.endsCard ? 16 : 0,
                    topTrailingRadius: row.beginsCard ? 16 : 0
                ).fill(AviationTheme.raisedSurface)
            }
        }
        .overlay {
            if row.sectionIndex != nil {
                FARReaderCardBorder(top: row.beginsCard, bottom: row.endsCard)
                    .stroke(AviationTheme.border, lineWidth: 1)
            }
        }
        .padding(.top, row.sectionIndex == nil || row.beginsCard ? row.spacingBefore : 0)
    }

    @ViewBuilder
    private var content: some View {
        switch row.content {
        case .partHeader:
            FARPartHeading(part: document.part)
        case .groupHeading(let heading):
            Text(heading).font(.title3.weight(.semibold))
        case .sectionHeader:
            if let index = row.sectionIndex {
                let item = document.sections[index]
                let expanded = session.isExpanded(sectionID: item.id, query: query,
                                                  defaultExpanded: !activeQuery.isEmpty || initialSection == item.id)
                FARSectionHeading(section: item.section, referenceLabel: item.referenceLabel,
                                  query: activeQuery, expanded: expanded) {
                    withAnimation { session.setExpanded(!expanded, for: item.id) }
                    if !expanded {
                        DataService.shared.saveFARReadingHistory(part: document.part.part, title: document.part.title,
                                                               section: item.id)
                    }
                }
            }
        case .studyTools, .noteEditor:
            if let index = row.sectionIndex {
                let input = document.studyMarkInput(for: index)
                StudyMarkTools(input: input, noteState: session.noteState(for: input.key),
                               presentation: row.id.kind == .noteEditor ? .note : .actions,
                               onNoteFocusChange: onNoteFocusChange)
            }
        case .paragraph(let text):
            HighlightText(text: text, query: activeQuery)
                .font(preferences.bodyFont)
                .lineSpacing(preferences.lineSpacing)
                .foregroundColor(.primary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .table(let table, let number):
            AIMTableView(table: table, number: number, searchText: activeQuery, showsLabel: false,
                         tableFont: preferences.bodyFont, tableLineSpacing: preferences.lineSpacing,
                         pageIndex: Binding(
                            get: { session.tablePage(for: row.id, table: table, query: activeQuery) },
                            set: { session.setTablePage($0, for: row.id, table: table, query: activeQuery) }
                         ))
        case .heading(let heading):
            Text(heading).font(.subheadline.weight(.semibold))
        case .definition(let definition):
            supplement(term: definition.term, text: definition.definition)
        case .abbreviation(let abbreviation):
            supplement(term: abbreviation.abbr, text: abbreviation.meaning)
        case .keyPoint(let point):
            HStack(alignment: .top, spacing: 8) {
                Circle().fill(Color.blue).frame(width: 6, height: 6).padding(.top, 6)
                HighlightText(text: point, query: activeQuery)
                    .font(preferences.subheadlineFont)
                    .lineSpacing(preferences.lineSpacing)
                    .foregroundColor(.primary)
                    .textSelection(.enabled)
            }
        case .figure(let figure, let number):
            DocumentFigureView(figure: figure, number: number, searchText: activeQuery, catalog: .far)
        case .reserved:
            ContentUnavailableView("Part Reserved", systemImage: "doc.badge.ellipsis",
                                   description: Text("This part is reserved in 14 CFR and currently contains no active sections."))
                .padding(.bottom, 24)
        case .noResults:
            ContentUnavailableView.search(text: query)
                .accessibilityIdentifier("reader-no-results")
                .padding(.bottom, 24)
        case .studyFooter:
            FARStudyMaterialsLinks()
        }
    }

    private func supplement(term: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HighlightText(text: term, query: activeQuery)
                .font(.subheadline.weight(.medium))
                .textSelection(.enabled)
            HighlightText(text: text, query: activeQuery)
                .font(preferences.captionFont)
                .lineSpacing(preferences.lineSpacing)
                .foregroundColor(.primary)
                .textSelection(.enabled)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(8)
    }
}

private struct FARReaderCardBorder: Shape {
    let top: Bool
    let bottom: Bool

    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 16
        var path = Path()
        if top {
            path.move(to: CGPoint(x: rect.minX, y: rect.minY + radius))
            path.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
            path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + radius), control: CGPoint(x: rect.maxX, y: rect.minY))
        } else {
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - (bottom ? radius : 0)))
        if bottom {
            path.addQuadCurve(to: CGPoint(x: rect.maxX - radius, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
            path.addQuadCurve(to: CGPoint(x: rect.minX, y: rect.maxY - radius), control: CGPoint(x: rect.minX, y: rect.maxY))
        } else {
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        }
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + (top ? radius : 0)))
        return path
    }
}

private struct FARSectionHeading: View {
    let section: FARSection
    let referenceLabel: String?
    let query: String
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HighlightText(text: referenceLabel ?? "§ \(section.section)", query: query)
                        .font(.caption).foregroundColor(.blue)
                    HighlightText(text: section.title, query: query)
                        .font(.headline).foregroundColor(.primary)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: expanded ? "chevron.up" : "chevron.down").foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
        .accessibilityHint(expanded ? "Collapse this section" : "Expand this section")
        .accessibilityIdentifier("far-section-\(section.section)")
        .contextMenu {
            Button("Copy section text", systemImage: "doc.on.doc") { copyFARSectionText(section) }
        }
    }
}

private struct FARPartHeading: View {
    let part: FARPart

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(part.cfr).font(.subheadline).foregroundStyle(AviationTheme.sky)
            Text(part.title).font(.title2.bold()).foregroundStyle(.white)
            if let subchapter = part.subchapter, let title = part.subchapterTitle {
                Text("Subchapter \(subchapter): \(title)").font(.subheadline).foregroundStyle(.white.opacity(0.7))
            }
            if let urlString = part.url, let url = URL(string: urlString) {
                Link(destination: url) {
                    HStack {
                        Text("View on eCFR").font(.caption)
                        Image(systemName: "arrow.up.right.square").font(.caption)
                    }.foregroundStyle(AviationTheme.sky)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AviationTheme.heroGradient)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct FARStudyMaterialsLinks: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Study Materials").font(.headline).padding(.top, 8)
            HStack(spacing: 12) {
                NavigationLink(destination: QuizListView()) {
                    Label("Quizzes", systemImage: "questionmark.circle.fill")
                        .font(.subheadline.weight(.semibold)).foregroundColor(.white)
                        .padding(.vertical, 10).padding(.horizontal, 16)
                        .background(Color.indigo).cornerRadius(8)
                }
                NavigationLink(destination: FlashcardListView()) {
                    Label("Flashcards", systemImage: "rectangle.on.rectangle.angled")
                        .font(.subheadline.weight(.semibold)).foregroundColor(.white)
                        .padding(.vertical, 10).padding(.horizontal, 16)
                        .background(Color.orange).cornerRadius(8)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}


enum FARContentBlock {
    case text(String)
    case table(AIMTable)
}

func parseFARContent(_ content: String) -> [FARContentBlock] {
    var blocks: [FARContentBlock] = []
    var cursor = content.startIndex

    func appendText(_ text: String) {
        if !text.isEmpty { blocks.append(.text(text)) }
    }

    while cursor < content.endIndex {
        guard let tableStart = content.range(of: "[TABLE]", range: cursor..<content.endIndex) else {
            appendText(String(content[cursor...]))
            break
        }
        appendText(String(content[cursor..<tableStart.lowerBound]))

        guard let tableEnd = content.range(of: "[/TABLE]", range: tableStart.upperBound..<content.endIndex) else {
            appendText(String(content[tableStart.lowerBound...]))
            break
        }

        let rows = String(content[tableStart.upperBound..<tableEnd.lowerBound])
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map(parseFARTableRow)
        if let headers = rows.first {
            blocks.append(.table(AIMTable(headers: headers, rows: Array(rows.dropFirst()), caption: nil)))
        } else {
            appendText(String(content[tableStart.lowerBound..<tableEnd.upperBound]))
        }
        cursor = tableEnd.upperBound
    }

    return blocks
}

func farReaderContentBlocks(_ content: String) -> [FARContentBlock] {
    parseFARContent(content).flatMap { block -> [FARContentBlock] in
        guard case .text(let text) = block else { return [block] }
        var paragraphs: [FARContentBlock] = []
        var start = text.startIndex
        var cursor = start
        while cursor < text.endIndex {
            let character = text[cursor]
            var next = text.index(after: cursor)
            if character == "\n" || character == "\r\n" {
                var separatorEnd: String.Index?
                while next < text.endIndex {
                    while next < text.endIndex, text[next] == " " || text[next] == "\t" {
                        next = text.index(after: next)
                    }
                    guard next < text.endIndex, text[next] == "\n" || text[next] == "\r\n" else { break }
                    next = text.index(after: next)
                    separatorEnd = next
                }
                if let separatorEnd {
                    paragraphs.append(.text(String(text[start..<separatorEnd])))
                    start = separatorEnd
                    cursor = separatorEnd
                    continue
                }
            }
            cursor = next
        }
        if start < text.endIndex {
            paragraphs.append(.text(String(text[start...])))
        }
        return paragraphs
    }
}

func farReaderDisplayText(_ text: String, in blocks: [FARContentBlock], at index: Int) -> String {
    // Separate Text views already introduce a line break between paragraphs.
    guard index + 1 < blocks.count, case .text = blocks[index + 1] else { return text }
    if text.last == "\n" || text.last == "\r\n" { return String(text.dropLast()) }
    return text
}

private func copyFARSectionText(_ section: FARSection) {
    UIPasteboard.general.string = parseFARContent(section.searchableText).map { block in
        switch block {
        case .text(let text):
            return (try? AttributedString(
                markdown: text,
                options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
            )).map { String($0.characters) } ?? text
        case .table(let table):
            let rows = (table.headers.map { [$0] } ?? []) + (table.rows ?? [])
            return "\n" + rows.map { $0.joined(separator: "\t") }.joined(separator: "\n") + "\n"
        }
    }.joined()
}

private func parseFARTableRow(_ line: String) -> [String] {
    var row = line.trimmingCharacters(in: .whitespacesAndNewlines)
    if row.hasPrefix("|") { row.removeFirst() }
    if row.hasSuffix("|"), !farTablePipeIsEscaped(row) { row.removeLast() }

    var cells: [String] = []
    var cell = ""
    var index = row.startIndex
    while index < row.endIndex {
        let character = row[index]
        let next = row.index(after: index)
        if character == "\\", next < row.endIndex, row[next] == "|" {
            cell.append("|")
            index = row.index(after: next)
        } else if character == "|" {
            cells.append(cell.trimmingCharacters(in: .whitespacesAndNewlines))
            cell = ""
            index = next
        } else {
            cell.append(character)
            index = next
        }
    }
    cells.append(cell.trimmingCharacters(in: .whitespacesAndNewlines))
    return cells
}

private func farTablePipeIsEscaped(_ row: String) -> Bool {
    var index = row.index(before: row.endIndex)
    guard row[index] == "|" else { return false }

    var backslashCount = 0
    while index > row.startIndex {
        index = row.index(before: index)
        guard row[index] == "\\" else { break }
        backslashCount += 1
    }
    return backslashCount.isMultiple(of: 2) == false
}

private enum FARContentParserCache {
    private static let lock = NSLock()
    private static var storage: [Int: (content: String, blocks: [FARContentBlock])] = [:]

    static func blocks(for content: String) -> [FARContentBlock] {
        let key = content.hashValue
        lock.lock()
        if let cached = storage[key], cached.content == content {
            lock.unlock()
            return cached.blocks
        }
        lock.unlock()

        let parsed = farReaderContentBlocks(content)
        lock.lock()
        if storage.count > 512 {
            storage.removeAll(keepingCapacity: true)
        }
        storage[key] = (content, parsed)
        lock.unlock()
        return parsed
    }
}

struct EmbeddedQuizView: View {
    let quiz: EmbeddedQuizQuestion
    let title: String
    @State private var selectedOption: String?
    @State private var showResult = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(quiz.question)
                    .font(.title3)
                    .fontWeight(.bold)

                ForEach(quiz.options, id: \.self) { option in
                    Button(action: {
                        selectedOption = option
                        showResult = true
                    }) {
                        HStack {
                            Text(option)
                                .font(.body)
                                .foregroundColor(.primary)
                                .multilineTextAlignment(.leading)
                            Spacer()
                            if showResult {
                                if option == quiz.answer {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                } else if option == selectedOption {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.red)
                                }
                            }
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(showResult && option == quiz.answer ? Color.green.opacity(0.1) :
                                      showResult && option == selectedOption ? Color.red.opacity(0.1) :
                                      Color(.secondarySystemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(showResult && option == quiz.answer ? Color.green :
                                        showResult && option == selectedOption ? Color.red :
                                        Color.clear, lineWidth: 2)
                        )
                    }
                    .disabled(showResult)
                }

                if showResult {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Explanation")
                            .font(.headline)
                        Text(quiz.explanation)
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemBackground))
                    .cornerRadius(12)
                    .shadow(radius: 2)
                }
            }
            .padding()
        }
        .navigationTitle(title)
    }
}

struct EmbeddedFlashcardView: View {
    let flashcard: EmbeddedFlashcard
    let title: String
    @State private var isFlipped = false

    var body: some View {
        VStack {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(radius: 10)

                VStack {
                    if isFlipped {
                        Text("ANSWER")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundColor(.orange)
                            .padding(.bottom, 20)

                        Text(flashcard.back)
                            .font(.title3)
                            .multilineTextAlignment(.center)
                    } else {
                        Text(flashcard.front)
                            .font(.title3)
                            .fontWeight(.medium)
                            .multilineTextAlignment(.center)

                        Text("Tap to flip")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding(.top, 20)
                    }
                }
                .padding()
            }
            .frame(height: 400)
            .padding()
            .onTapGesture {
                withAnimation(.spring()) {
                    isFlipped.toggle()
                }
            }

            Spacer()
        }
        .navigationTitle(title)
        .background(Color(.secondarySystemBackground))
    }
}

#Preview {
    FARListView()
}
