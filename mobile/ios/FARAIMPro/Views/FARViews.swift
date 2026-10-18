//
//  FARViews.swift
//  FARAIMPro
//
//  Views for displaying FAR content
//

import SwiftUI

// MARK: - Highlight Helper (Merged here to avoid project file issues)

struct HighlightText: View {
    let text: String
    let query: String

    var body: some View {
        if #available(iOS 15.0, *) {
            HighlightText15(text: text, query: query)
        } else {
            // Fallback for older iOS versions (basic highlighting, no markdown)
            highlightedText()
        }
    }

    func highlightedText() -> Text {
        guard !query.isEmpty else { return Text(text) }

        let lowerText = text.lowercased()
        let lowerQuery = query.lowercased()

        var result = Text("")
        var currentIndex = lowerText.startIndex

        while let range = lowerText.range(of: lowerQuery, range: currentIndex..<lowerText.endIndex) {
            // Text before match
            let prefix = text[currentIndex..<range.lowerBound]
            result = result + Text(String(prefix))

            // Match
            let match = text[range]
            result = result + Text(String(match)).bold().underline()

            currentIndex = range.upperBound
        }

        // Remaining text
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
        // Parse Markdown first
        var attributed = (try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(text)

        guard !query.isEmpty else { return attributed }

        // Find and highlight matches using NSRange for robustness
        let lowerText = String(attributed.characters).lowercased()
        let lowerQuery = query.lowercased()
        let nsString = lowerText as NSString

        // Find all occurrences
        var searchRange = NSRange(location: 0, length: nsString.length)
        while true {
            let foundRange = nsString.range(of: lowerQuery, options: .caseInsensitive, range: searchRange)
            if foundRange.location == NSNotFound { break }

            // Convert NSRange -> Range<AttributedString.Index>
            if let attrRange = Range(foundRange, in: attributed) {
                attributed[attrRange].backgroundColor = .yellow.opacity(0.5)
                attributed[attrRange].foregroundColor = .black
            }

            // Advance search
            let newLocation = foundRange.location + foundRange.length
            searchRange = NSRange(location: newLocation, length: nsString.length - newLocation)
        }

        return attributed
    }
}

struct StudyMarkTools: View {
    @ObservedObject var dataService = DataService.shared
    let input: StudyMarkInput
    @State private var noteOpen = false
    @State private var draft = ""
    @State private var confirmRemoval = false
    @State private var feedbackTrigger = 0

    private var mark: StudyMark? {
        dataService.getStudyMark(input)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    actionButtons(showTitles: true)
                }
                .controlSize(.small)

                HStack(spacing: 8) {
                    actionButtons(showTitles: false)
                }
                .controlSize(.regular)
            }

            if noteOpen {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Note for \(input.reference)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    TextEditor(text: $draft)
                        .frame(minHeight: 90)
                        .padding(8)
                        .background(Color(.systemBackground))
                        .cornerRadius(8)
                    Button("Save note") {
                        dataService.saveNote(input, note: draft)
                        feedbackTrigger += 1
                        noteOpen = false
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(12)
        .background(AviationTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .sensoryFeedback(.selection, trigger: feedbackTrigger)
        .confirmationDialog(
            "Remove \(input.reference) from Study?",
            isPresented: $confirmRemoval,
            titleVisibility: .visible
        ) {
            Button("Remove study item", role: .destructive) {
                dataService.removeStudyMark(key: input.key)
                draft = ""
                noteOpen = false
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
            draft = mark?.note ?? ""
            withAnimation { noteOpen.toggle() }
        }) {
            actionLabel(
                (mark?.note.isEmpty == false) ? "Note" : "Add note",
                systemImage: "note.text",
                showTitle: showTitles
            )
        }
        .buttonStyle(.bordered)

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
    if route.hasPrefix("far:") {
        return "https://faraim.online/far/\(route.replacingOccurrences(of: "far:", with: ""))"
    }
    if route.hasPrefix("aim:") {
        return "https://faraim.online/aim/\(route.replacingOccurrences(of: "aim:", with: ""))"
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

    var fontScale: CGFloat {
        Self.fontScales[fontScaleIndex.clamped(to: 0...(Self.fontScales.count - 1))]
    }

    var bodyFont: Font { .system(size: 17 * fontScale) }
    var subheadlineFont: Font { .system(size: 15 * fontScale) }
    var captionFont: Font { .system(size: 13 * fontScale) }

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

struct ReaderControls: View {
    @Binding var fontScaleIndex: Int
    @Binding var densityRawValue: String

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
            }
            .disabled(fontScaleIndex <= 0)
            .accessibilityLabel("Decrease reader text size")

            Text("\(Int((fontScale * 100).rounded()))%")
                .font(.caption)
                .fontWeight(.semibold)
                .frame(width: 44)

            Button {
                fontScaleIndex = min(fontScaleIndex + 1, ReaderPreferences.fontScales.count - 1)
            } label: {
                Image(systemName: "plus")
            }
            .disabled(fontScaleIndex >= ReaderPreferences.fontScales.count - 1)
            .accessibilityLabel("Increase reader text size")
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private var densityPicker: some View {
        Picker("Reader density", selection: $densityRawValue) {
            ForEach(ReaderDensity.allCases) { density in
                Text(density.label).tag(density.rawValue)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 320)
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

    var filteredParts: [FARPart] {
        if searchText.isEmpty {
            return dataService.farParts
        }
        let query = searchText.lowercased()
        return dataService.farParts.filter { part in
            // Match Part title/number
            if part.title.lowercased().contains(query) ||
               String(part.part).contains(query) {
                return true
            }
            // Match content inside sections
            if let sections = part.sections, sections.contains(where: {
                $0.searchableText.lowercased().contains(query)
            }) {
                return true
            }
            // Match subparts content
            if let subparts = part.subparts, subparts.contains(where: { sp in
                sp.title.lowercased().contains(query) ||
                sp.sections.contains(where: {
                    $0.searchableText.lowercased().contains(query)
                })
            }) {
                return true
            }
            if let appendices = part.appendices,
               appendices.contains(where: { $0.searchableText.lowercased().contains(query) }) {
                return true
            }
            return false
        }
    }

    var body: some View {
        ScrollView {
            if dataService.farParts.isEmpty {
                LibraryCollectionStateView(
                    catalog: .far,
                    title: "FAR Parts",
                    systemImage: "doc.text"
                )
            } else if filteredParts.isEmpty {
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
                        detail: "\(filteredParts.count) parts available offline",
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

                    ForEach(filteredParts) { part in
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

private struct FARReaderSection: Identifiable {
    var id: String { section.section }
    let section: FARSection
    let subpartHeading: String?
    let referenceLabel: String?
}

struct FARPartDetailView: View {
    let part: FARPart
    let initialSection: String?
    @State private var searchText = ""
    @AppStorage("far-aim-pro-reader-font-scale-index") private var readerFontScaleIndex = 1
    @AppStorage("far-aim-pro-reader-density") private var readerDensityRawValue = ReaderDensity.standard.rawValue
    @State private var showReaderControls = false
    @ObservedObject var dataService = DataService.shared

    // Allow initializing with a search query
    init(part: FARPart, initialSearchText: String = "", initialSection: String? = nil) {
        self.part = part
        self.initialSection = initialSection
        _searchText = State(initialValue: initialSearchText)
    }

    private var readerSections: [FARReaderSection] {
        let directSections = (part.sections ?? []).map {
            FARReaderSection(section: $0, subpartHeading: nil, referenceLabel: nil)
        }
        let subpartSections = (part.subparts ?? []).flatMap { subpart in
            subpart.sections.enumerated().map { index, section in
                FARReaderSection(
                    section: section,
                    subpartHeading: index == 0 ? "Subpart \(subpart.subpart) - \(subpart.title)" : nil,
                    referenceLabel: nil
                )
            }
        }
        let appendices = (part.appendices ?? []).enumerated().map { index, appendix in
            FARReaderSection(
                section: FARSection(
                    section: appendix.appendix,
                    title: appendix.title,
                    content: appendix.content,
                    definitions: nil,
                    abbreviations: nil,
                    keyPoints: nil,
                    figures: appendix.figures
                ),
                subpartHeading: index == 0 ? "Appendices" : nil,
                referenceLabel: appendix.appendix
            )
        }
        return directSections + subpartSections + appendices
    }

    var body: some View {
        let readerPreferences = ReaderPreferences(
            fontScaleIndex: readerFontScaleIndex,
            density: ReaderDensity(rawValue: readerDensityRawValue) ?? .standard
        )

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text(part.cfr)
                        .font(.subheadline)
                        .foregroundStyle(AviationTheme.sky)

                    Text(part.title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)

                    if let subchapter = part.subchapter, let subchapterTitle = part.subchapterTitle {
                        Text("Subchapter \(subchapter): \(subchapterTitle)")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }

                    if let url = part.url {
                        Link(destination: URL(string: url)!) {
                            HStack {
                                Text("View on eCFR")
                                    .font(.caption)
                                Image(systemName: "arrow.up.right.square")
                                    .font(.caption)
                            }
                            .foregroundStyle(AviationTheme.sky)
                        }
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AviationTheme.heroGradient)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                ForEach(readerSections) { item in
                    if let subpartHeading = item.subpartHeading {
                        Text(subpartHeading)
                                .font(.title3)
                                .fontWeight(.semibold)
                                .padding(.top, 8)
                    }

                    SectionCard(
                        section: item.section,
                        searchText: searchText,
                        defaultExpanded: initialSection == item.section.section,
                        referenceLabel: item.referenceLabel,
                        studyMarkInput: StudyMarkInput(
                            type: "far",
                            reference: "§ \(item.section.section)",
                            title: item.section.title,
                            route: "far:\(part.part)"
                        ),
                        readerPreferences: readerPreferences,
                        onExpanded: {
                            dataService.saveFARReadingHistory(
                                part: part.part,
                                title: part.title,
                                section: item.section.section
                            )
                        }
                    )
                    .id(item.section.section)
                }

                // Study Materials Link at end
                VStack(alignment: .leading, spacing: 12) {
                    Text("Study Materials")
                        .font(.headline)
                        .padding(.top, 8)

                    HStack(spacing: 12) {
                        NavigationLink(destination: QuizListView()) {
                            HStack {
                                Image(systemName: "questionmark.circle.fill")
                                Text("Quizzes")
                            }
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 16)
                            .background(Color.indigo)
                            .cornerRadius(8)
                        }

                        NavigationLink(destination: FlashcardListView()) {
                            HStack {
                                Image(systemName: "rectangle.on.rectangle.angled")
                                Text("Flashcards")
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
        .navigationTitle("Part \(part.part)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                ShareLink(
                    item: "14 CFR Part \(part.part) - \(part.title)\n\(publicReferenceLink(for: "far:\(part.part)"))"
                ) {
                    Label("Share Part \(part.part)", systemImage: "square.and.arrow.up")
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
        .searchable(text: $searchText, prompt: "Find in Part \(part.part)")
        .onAppear {
            // Save reading history when viewing part
            dataService.saveFARReadingHistory(
                part: part.part,
                title: part.title,
                section: initialSection
            )
        }
        .aviationScreen()
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

private struct FARContentView: View {
    let searchText: String
    let readerPreferences: ReaderPreferences
    @State private var blocks: [FARContentBlock]

    init(content: String, searchText: String, readerPreferences: ReaderPreferences) {
        self.searchText = searchText
        self.readerPreferences = readerPreferences
        _blocks = State(initialValue: parseFARContent(content))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                switch block {
                case .text(let text):
                    HighlightText(text: text, query: searchText)
                        .font(readerPreferences.bodyFont)
                        .lineSpacing(readerPreferences.lineSpacing)
                        .foregroundColor(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                case .table(let table):
                    AIMTableView(
                        table: table,
                        number: tableNumber(through: index),
                        searchText: searchText,
                        showsLabel: false,
                        tableFont: readerPreferences.bodyFont,
                        tableLineSpacing: readerPreferences.lineSpacing
                    )
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tableNumber(through index: Int) -> Int {
        blocks.prefix(index + 1).reduce(into: 0) { count, block in
            if case .table = block { count += 1 }
        }
    }
}

struct SectionCard: View {
    let section: FARSection
    let searchText: String
    var defaultExpanded: Bool = false
    var referenceLabel: String? = nil
    var studyMarkInput: StudyMarkInput? = nil
    var readerPreferences: ReaderPreferences = .standard
    var onExpanded: (() -> Void)? = nil
    @State private var userExpanded: Bool?

    // Auto-expand if matches search
    var shouldExpand: Bool {
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
                            HighlightText(text: referenceLabel ?? "§ \(section.section)", query: searchText)
                                .font(.caption)
                                .foregroundColor(.blue)
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
                    VStack(alignment: .leading, spacing: 12) {
                        if let studyMarkInput {
                            StudyMarkTools(input: studyMarkInput)
                        }

                        if !section.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            FARContentView(
                                content: section.content,
                                searchText: searchText,
                                readerPreferences: readerPreferences
                            )
                        }

                        // Definitions
                        if let definitions = section.definitions, !definitions.isEmpty {
                            Text("Definitions")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .padding(.top, 8)

                            ForEach(definitions) { def in
                                VStack(alignment: .leading, spacing: 4) {
                                    HighlightText(text: def.term, query: searchText)
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    HighlightText(text: def.definition, query: searchText)
                                        .font(readerPreferences.captionFont)
                                        .lineSpacing(readerPreferences.lineSpacing)
                                        .foregroundColor(.primary)
                                }
                                .padding(12)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(8)
                            }
                        }

                        if let abbreviations = section.abbreviations, !abbreviations.isEmpty {
                            Text("Abbreviations")
                                .font(.subheadline.weight(.semibold))
                                .padding(.top, 8)

                            ForEach(abbreviations) { abbreviation in
                                VStack(alignment: .leading, spacing: 4) {
                                    HighlightText(text: abbreviation.abbr, query: searchText)
                                        .font(.subheadline.weight(.medium))
                                    HighlightText(text: abbreviation.meaning, query: searchText)
                                        .font(readerPreferences.captionFont)
                                        .lineSpacing(readerPreferences.lineSpacing)
                                }
                                .padding(12)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(8)
                            }
                        }

                        // Key Points
                        if let keyPoints = section.keyPoints, !keyPoints.isEmpty {
                            Text("Key Points")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .padding(.top, 8)

                            ForEach(keyPoints, id: \.self) { point in
                                HStack(alignment: .top, spacing: 8) {
                                    Circle()
                                        .fill(Color.blue)
                                        .frame(width: 6, height: 6)
                                        .padding(.top, 6)
                                    HighlightText(text: point, query: searchText)
                                        .font(readerPreferences.subheadlineFont)
                                        .lineSpacing(readerPreferences.lineSpacing)
                                        .foregroundColor(.primary)
                                }
                            }
                        }

                        if let figures = section.figures, !figures.isEmpty {
                            LazyVStack(spacing: 14) {
                                ForEach(Array(figures.enumerated()), id: \.offset) { index, figure in
                                    DocumentFigureView(
                                        figure: figure,
                                        number: index + 1,
                                        searchText: searchText,
                                        catalog: .far
                                    )
                                }
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
