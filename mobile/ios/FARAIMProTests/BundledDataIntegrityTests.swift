import XCTest
@testable import FARAIMPro

final class BundledDataIntegrityTests: XCTestCase {
    override func setUp() async throws {
        for _ in 0..<200 where DataService.shared.loadState == .loading {
            try await Task.sleep(for: .milliseconds(25))
        }
        XCTAssertNotEqual(DataService.shared.loadState, .loading)
    }

    func testExternalContentURLsResolveToReaderRoutes() throws {
        XCTAssertEqual(
            ContentView.externalDestination(
                for: try XCTUnwrap(URL(string: "https://faraim.online/far/61#61.3"))
            )?.route,
            "far:61#61.3"
        )
        XCTAssertEqual(
            ContentView.externalDestination(
                for: try XCTUnwrap(URL(string: "faraimpro://aim/4#4-5-6"))
            )?.route,
            "aim:4#4-5-6"
        )
        XCTAssertEqual(
            ContentView.externalDestination(
                for: try XCTUnwrap(URL(string: "faraimpro://advisory-circulars/ac-120-100"))
            )?.route,
            "ac:ac-120-100"
        )
        XCTAssertNil(
            ContentView.externalDestination(
                for: try XCTUnwrap(URL(string: "https://example.com/far/61"))
            )
        )
    }

    func testReferenceCatalogsLoadFromAppBundle() throws {
        let dataService = DataService.shared

        XCTAssertEqual(dataService.farParts.count, dataService.farIndex.count)
        XCTAssertEqual(dataService.aimChapters.count, dataService.aimIndex.count)
        XCTAssertFalse(dataService.farParts.isEmpty)
        XCTAssertFalse(dataService.aimChapters.isEmpty)
        XCTAssertFalse(dataService.pcgTerms.isEmpty)
        XCTAssertFalse(dataService.advisoryCirculars.isEmpty)
        XCTAssertNotNil(dataService.sourceStatus)

        for partNumber in [1, 43, 61, 67, 91, 830] {
            let part = dataService.farParts.first { $0.part == partNumber }
            XCTAssertNotNil(part, "Part \(partNumber)")
            XCTAssertTrue(!(part?.sections ?? []).isEmpty || !(part?.subparts ?? []).isEmpty, "Part \(partNumber)")
        }
        XCTAssertTrue(dataService.aimChapters.allSatisfy { !$0.sections.isEmpty })
        XCTAssertEqual(dataService.aimChapters.map(\.chapter), Array(0...11))
        XCTAssertFalse(
            dataService.farParts.first { $0.part == 91 }?.appendices?.isEmpty ?? true
        )
        XCTAssertEqual(Set(dataService.pcgTerms.map(\.term)).count, dataService.pcgTerms.count)
        XCTAssertEqual(Set(dataService.advisoryCirculars.map(\.id)).count, dataService.advisoryCirculars.count)

        let sourceStatus = try XCTUnwrap(dataService.sourceStatus)
        let sources = Dictionary(uniqueKeysWithValues: sourceStatus.sources.map { ($0.id, $0) })
        XCTAssertEqual(sources["far"]?.itemCount, dataService.farIndex.count)
        XCTAssertEqual(sources["aim"]?.itemCount, dataService.aimIndex.count)
        XCTAssertEqual(sources["pcg"]?.itemCount, dataService.pcgTerms.count)
        XCTAssertEqual(sources["ac"]?.itemCount, dataService.advisoryCirculars.count)
    }

    func testEveryAdvisoryCircularContentFileLoadsAndMatchesItsIndex() {
        let dataService = DataService.shared
        var contentPaths = Set<String>()

        for circular in dataService.advisoryCirculars {
            if circular.contentStatus == "unavailable" {
                XCTAssertNil(circular.contentPath, circular.id)
                continue
            }

            guard let contentPath = circular.contentPath else {
                XCTFail("Missing content path for \(circular.id)")
                continue
            }
            XCTAssertTrue(contentPaths.insert(contentPath).inserted, contentPath)

            guard let content = dataService.advisoryCircularContent(for: circular) else {
                XCTFail("Could not load \(contentPath)")
                continue
            }
            XCTAssertEqual(content.id, circular.id)
            XCTAssertEqual(content.number, circular.number)
            XCTAssertEqual(content.status, circular.contentStatus)
            XCTAssertFalse(content.pages.isEmpty, circular.id)
            XCTAssertEqual(content.pages.map(\.page), Array(Set(content.pages.map(\.page))).sorted())
            XCTAssertTrue(content.pages.allSatisfy { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
            if content.status == "partial" {
                XCTAssertEqual(content.extractedPageCount, content.pages.count)
                XCTAssertLessThan(content.pages.count, content.pageCount)
            }
        }
    }

    func testStudyMaterialsHaveValidCountsAndAnswers() {
        let dataService = DataService.shared

        XCTAssertFalse(dataService.quizzes.isEmpty)
        XCTAssertFalse(dataService.flashcardDecks.isEmpty)

        for quiz in dataService.quizzes {
            XCTAssertEqual(quiz.questionCount, quiz.questions.count, quiz.id)
            XCTAssertFalse(quiz.questions.isEmpty, quiz.id)
            XCTAssertEqual(Set(quiz.questions.map(\.id)).count, quiz.questions.count, quiz.id)
            for question in quiz.questions {
                XCTAssertTrue(question.options.indices.contains(question.correctAnswer), question.id)
                XCTAssertFalse(question.reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, question.id)
            }
        }

        for deck in dataService.flashcardDecks {
            XCTAssertEqual(deck.cardCount, deck.cards.count, deck.id)
            XCTAssertFalse(deck.cards.isEmpty, deck.id)
            XCTAssertEqual(Set(deck.cards.map(\.id)).count, deck.cards.count, deck.id)
            XCTAssertTrue(deck.cards.allSatisfy { !$0.reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }, deck.id)
        }
    }

    func testStudyPathDestinationsResolveToBundledResources() {
        let dataService = DataService.shared
        let quizIDs = Set(dataService.quizzes.map(\.id))
        let deckIDs = Set(dataService.flashcardDecks.map(\.id))

        XCTAssertFalse(dataService.studyPaths.isEmpty)
        for path in dataService.studyPaths {
            XCTAssertTrue(Set(path.quizIds).isSubset(of: quizIDs), path.id)
            XCTAssertTrue(Set(path.flashcardDeckIds).isSubset(of: deckIDs), path.id)
            for reference in path.references {
                switch reference.type {
                case "far":
                    XCTAssertNotNil(
                        reference.part.flatMap { dataService.getFARPart(byNumber: $0) },
                        reference.label
                    )
                case "aim":
                    XCTAssertNotNil(
                        reference.chapter.flatMap { dataService.getAIMChapter(byNumber: $0) },
                        reference.label
                    )
                default:
                    XCTFail("Unsupported study path reference type \(reference.type)")
                }
            }
        }
    }

    func testStructuredAIMFieldsParticipateInSearch() throws {
        let dataService = DataService.shared
        let chapter = try XCTUnwrap(dataService.getAIMChapter(byNumber: 1))
        let section = try XCTUnwrap(chapter.sections.first { $0.section == "1-1-8" })

        XCTAssertTrue(section.searchableText.contains("SSV Designator"))
        XCTAssertTrue(section.searchableText.contains("Original Standard Service Volumes"))
        XCTAssertTrue(
            dataService.search(query: "SSV Designator").contains {
                $0.type == "aim" && $0.link == "aim/1#1-1-8"
            }
        )
        XCTAssertTrue(
            dataService.search(query: "Private Pilot Minimum Age").contains {
                $0.type == "flashcard"
            }
        )
    }

    func testFARContentTablesPreserveTextOrderEmptyCellsAndEscapedPipes() {
        let blocks = parseFARContent(
            "Before\n[TABLE]\n" +
                "| Name | Note | End |\n\n" +
                "| Route | Turns \\| Restrictions | |\n" +
                "| Alternate | | Do not use |\n" +
                "[/TABLE]\nAfter"
        )

        XCTAssertEqual(blocks.count, 3)
        guard case .text(let before) = blocks[0],
              case .table(let table) = blocks[1],
              case .text(let after) = blocks[2] else {
            XCTFail("Expected prose, a structured table, and trailing prose")
            return
        }

        XCTAssertEqual(before, "Before\n")
        XCTAssertEqual(after, "\nAfter")
        XCTAssertEqual(table.headers, ["Name", "Note", "End"])
        XCTAssertEqual(
            table.rows,
            [
                ["Route", "Turns | Restrictions", ""],
                ["Alternate", "", "Do not use"]
            ]
        )
    }

    func testLargeAIMTablePagingBoundsRowsAndReachesEverySourceRow() {
        let sourceRows = (0..<3_687).map { row in
            (0..<14).map { column in "row \(row), column \(column)" }
        }
        let pageCount = (sourceRows.count + aimTableRowsPerPage - 1) / aimTableRowsPerPage
        let first = pageAIMTableRows(rows: sourceRows, requestedPageIndex: 0)
        let second = pageAIMTableRows(rows: sourceRows, requestedPageIndex: 1)
        let last = pageAIMTableRows(rows: sourceRows, requestedPageIndex: pageCount - 1)
        let allRows = (0..<pageCount).flatMap { page in
            pageAIMTableRows(rows: sourceRows, requestedPageIndex: page).rows
        }

        XCTAssertEqual(pageCount, 148)
        XCTAssertEqual(first.rows.count, 25)
        XCTAssertEqual(first.firstRowNumber, 1)
        XCTAssertEqual(first.lastRowNumber, 25)
        XCTAssertEqual(second.firstRowNumber, 26)
        XCTAssertEqual(second.lastRowNumber, 50)
        XCTAssertEqual(last.firstRowNumber, 3_676)
        XCTAssertEqual(last.lastRowNumber, 3_687)
        XCTAssertEqual(last.rows.count, 12)
        XCTAssertTrue(allRows.allSatisfy { $0.value.count == 14 })
        XCTAssertEqual(allRows.map(\.sourceIndex), Array(sourceRows.indices))
        XCTAssertEqual(allRows.map(\.value), sourceRows)
        XCTAssertEqual(
            pageAIMTableRows(rows: sourceRows, requestedPageIndex: Int.max).pageIndex,
            last.pageIndex
        )
    }

    func testLargeAIMTableSearchFindsLateExactAndMultiTermRows() {
        let rowTexts = (0..<80).map { row in
            switch row {
            case 2: ["flux and then", "density"]
            case 57: ["UN value", "flux density"]
            case 61: ["oxygen material", "rate"]
            default: ["ordinary row \(row)"]
            }
        }.map { $0.joined(separator: " ") }

        XCTAssertEqual(firstMatchingAIMTableRow(rowTexts: rowTexts, query: "flux density"), 57)
        XCTAssertEqual(firstMatchingAIMTableRow(rowTexts: rowTexts, query: "oxygen rate"), 61)
        XCTAssertEqual(firstMatchingAIMTableRow(rowTexts: rowTexts, query: "ordinary absent"), 0)
        XCTAssertNil(firstMatchingAIMTableRow(rowTexts: rowTexts, query: "not present"))
    }

    func testGlossarySearchRanksExactTermBeforeDefinitionMatches() {
        let results = DataService.shared.searchPCG(query: "  middle marker ")

        XCTAssertEqual(results.first?.term, "MIDDLE MARKER")
        XCTAssertTrue(
            results.contains {
                $0.term == "MIDDLE COMPASS LOCATOR"
                    && $0.definition.localizedCaseInsensitiveContains("middle marker")
            }
        )
        XCTAssertTrue(
            results.contains {
                $0.term == "INSTRUMENT LANDING SYSTEM (ILS)"
                    && $0.definition.localizedCaseInsensitiveContains("middle marker")
            }
        )
    }

    func testGlossaryReferenceResolutionHandlesVisibleAndLegacyTargets() {
        let terms = [
            PCGTerm(term: "MARKER BEACON", definition: "A navigation aid."),
            PCGTerm(term: "AIR TRAFFIC [ICAO]", definition: "Aircraft operating in flight.")
        ]

        XCTAssertEqual(
            resolveGlossaryReference(terms, reference: "MARKER_BEACON")?.term,
            "MARKER BEACON"
        )
        XCTAssertEqual(
            resolveGlossaryReference(terms, reference: "AIR_TRAFFIC", isIcaoTerm: true)?.term,
            "AIR TRAFFIC [ICAO]"
        )
    }

    func testAIMFigurePathsRejectTraversalAndNormalizeBundledPaths() {
        XCTAssertEqual(
            DataService.normalizedAIMFigurePath("chapter1/section-1-1-8-img-1.png"),
            "chapter1/section-1-1-8-img-1.png"
        )
        XCTAssertNil(DataService.normalizedAIMFigurePath("../private.png"))
        XCTAssertNil(DataService.normalizedAIMFigurePath("/absolute.png"))
        XCTAssertNil(DataService.normalizedAIMFigurePath("chapter1\\private.png"))
    }

    func testFARFiguresDecodeParticipateInSearchableTextAndRejectTraversal() throws {
        let decodedSection = try JSONDecoder().decode(
            FARSection.self,
            from: Data("""
            {
              "section": "91.1",
              "title": "Operating rules",
              "content": "",
              "figures": [{
                "src": "appendix-a/figure-1.png",
                "alt": "Emergency exit diagram",
                "caption": "Figure A-1 Evacuation layout",
                "originalUrl": "https://www.faa.gov/example"
              }]
            }
            """.utf8)
        )
        let decodedAppendix = try JSONDecoder().decode(
            FARAppendix.self,
            from: Data("""
            {
              "appendix": "Appendix A",
              "title": "Emergency diagrams",
              "content": "",
              "figures": [{
                "src": "appendix-a/figure-1.png",
                "alt": "Emergency exit diagram",
                "caption": "Figure A-1 Evacuation layout",
                "originalUrl": "https://www.faa.gov/example"
              }]
            }
            """.utf8)
        )
        let figure = AIMFigure(
            src: "appendix-a/figure-1.png",
            alt: "Emergency exit diagram",
            caption: "Figure A-1 Evacuation layout",
            originalUrl: "https://www.faa.gov/example"
        )
        let section = FARSection(
            section: "91.1",
            title: "Operating rules",
            content: "",
            definitions: nil,
            abbreviations: nil,
            keyPoints: nil,
            figures: [figure]
        )
        let appendix = FARAppendix(
            appendix: "Appendix A",
            title: "Emergency diagrams",
            content: "",
            figures: [figure]
        )

        XCTAssertEqual(decodedSection.figures?.count, 1)
        XCTAssertEqual(decodedAppendix.figures?.first?.caption, figure.caption)
        XCTAssertTrue(decodedSection.searchableText.contains("Emergency exit diagram"))
        XCTAssertTrue(decodedAppendix.searchableText.contains("Figure A-1 Evacuation layout"))
        XCTAssertTrue(section.searchableText.contains("Emergency exit diagram"))
        XCTAssertTrue(appendix.searchableText.contains("Figure A-1 Evacuation layout"))
        XCTAssertEqual(
            DataService.normalizedFARFigurePath("appendix-a/figure-1.png"),
            "appendix-a/figure-1.png"
        )
        XCTAssertNil(DataService.normalizedFARFigurePath("../private.png"))
    }

    func testFlashcardProgressCompletesAndRestartsDeck() {
        var progress = FlashcardStudyProgress()
        let cardIDs = ["one", "two", "three"]

        progress.classify(cardID: "one", asKnown: true, cardIDs: cardIDs)
        XCTAssertEqual(progress.currentIndex, 1)
        progress.classify(cardID: "two", asKnown: false, cardIDs: cardIDs)
        XCTAssertEqual(progress.currentIndex, 2)
        progress.classify(cardID: "three", asKnown: true, cardIDs: cardIDs)

        XCTAssertTrue(progress.isComplete)
        XCTAssertEqual(progress.assessedCount, 3)
        XCTAssertEqual(progress.knownCardIDs, Set(["one", "three"]))
        XCTAssertEqual(progress.learningCardIDs, Set(["two"]))

        progress.restart()
        XCTAssertFalse(progress.isComplete)
        XCTAssertEqual(progress.currentIndex, 0)
        XCTAssertEqual(progress.assessedCount, 0)
    }

    func testFlashcardProgressSkipsDoNotCompleteAndDuplicateRatingsDoNotCount() {
        var progress = FlashcardStudyProgress()
        let cardIDs = ["one", "two", "three"]

        progress.moveNext(cardCount: cardIDs.count)
        progress.moveNext(cardCount: cardIDs.count)
        progress.classify(cardID: "three", asKnown: true, cardIDs: cardIDs)

        XCTAssertFalse(progress.isComplete)
        XCTAssertEqual(progress.assessedCount, 1)
        XCTAssertEqual(progress.currentIndex, 0)

        progress.classify(cardID: "one", asKnown: false, cardIDs: cardIDs)
        progress.movePrevious()
        progress.classify(cardID: "one", asKnown: true, cardIDs: cardIDs)

        XCTAssertFalse(progress.isComplete)
        XCTAssertEqual(progress.assessedCount, 2)
        XCTAssertEqual(progress.currentIndex, 1)

        progress.classify(cardID: "two", asKnown: true, cardIDs: cardIDs)
        XCTAssertTrue(progress.isComplete)
        XCTAssertEqual(progress.assessedCount, 3)
        XCTAssertEqual(progress.knownCardIDs, Set(["one", "two", "three"]))
        XCTAssertTrue(progress.learningCardIDs.isEmpty)

        progress.classify(cardID: "two", asKnown: false, cardIDs: cardIDs)
        XCTAssertEqual(progress.assessedCount, 3)
        XCTAssertEqual(progress.knownCardIDs, Set(["one", "two", "three"]))
        XCTAssertTrue(progress.learningCardIDs.isEmpty)
    }

    func testAdvisoryCircularSearchCandidatesIntersectAndRankDeterministically() throws {
        let documents = [
            AdvisoryCircularSearchDocument(
                title: "AC 1 - Wake Turbulence Avoidance",
                metadata: "Operational guidance"
            ),
            AdvisoryCircularSearchDocument(
                title: "AC 2 - Airport Operations",
                metadata: "Runway safety"
            ),
            AdvisoryCircularSearchDocument(
                title: "AC 3 - Weather Operations",
                metadata: "Convective guidance"
            )
        ]
        let index = [
            "wake": [2, 0, 2],
            "turbulence": [0, 2],
            "runway": [1]
        ]

        let candidates = AdvisoryCircularSearchEngine.candidates(
            for: "wake turbulence",
            index: index,
            documents: documents
        )

        XCTAssertEqual(candidates.map(\.documentID), [0, 2])
        let titleMatch = try XCTUnwrap(candidates.first)
        let fullTextMatch = try XCTUnwrap(candidates.last)
        XCTAssertFalse(titleMatch.isFullTextOnly)
        XCTAssertTrue(fullTextMatch.isFullTextOnly)
        XCTAssertGreaterThan(titleMatch.score, fullTextMatch.score)
    }

    func testAdvisoryCircularSearchCandidateTieBreakAndPrefixFallback() {
        let documents = [
            AdvisoryCircularSearchDocument(title: "First", metadata: ""),
            AdvisoryCircularSearchDocument(title: "Second", metadata: ""),
            AdvisoryCircularSearchDocument(title: "Third", metadata: "")
        ]
        let index = [
            "icing": [2, 0, 1],
            "icings": [1]
        ]

        let exactCandidates = AdvisoryCircularSearchEngine.candidates(
            for: "icing icing",
            index: index,
            documents: documents
        )
        let prefixCandidates = AdvisoryCircularSearchEngine.candidates(
            for: "icin",
            index: index,
            documents: documents
        )

        XCTAssertEqual(exactCandidates.map(\.documentID), [0, 1, 2])
        XCTAssertEqual(prefixCandidates.map(\.documentID), [0, 1, 2])
    }

    func testGlobalSearchFindsAdvisoryCircularFullTextOnlyTerm() throws {
        let result = try XCTUnwrap(
            DataService.shared.search(query: "zeitgeber").first { $0.type == "ac" }
        )

        XCTAssertEqual(result.link, "advisory-circulars#ac-120-100")
        XCTAssertTrue(result.content.hasPrefix("Full-text match in extracted circular."))
    }

    func testStudyPackRejectsUnknownSchemasAndPreservesSearchHistory() throws {
        let dataService = DataService.shared
        let defaults = UserDefaults.standard
        dataService.clearSearchHistory()
        defaults.removeObject(forKey: "far-aim-pro-study-marks")
        dataService.loadStudyMarks()
        dataService.clearAIMReadingHistory()
        defer {
            dataService.clearSearchHistory()
            defaults.removeObject(forKey: "far-aim-pro-study-marks")
            dataService.loadStudyMarks()
            dataService.clearAIMReadingHistory()
        }

        let invalidURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("invalid-study-pack.json")
        try #"{"schemaVersion":2,"app":"FAR/AIM Pro"}"#.write(
            to: invalidURL,
            atomically: true,
            encoding: .utf8
        )
        XCTAssertThrowsError(try dataService.importStudyPack(from: invalidURL))

        let validURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("valid-study-pack.json")
        dataService.saveAIMReadingHistory(chapter: 7, title: "AIM Chapter 7")
        try #"{"schemaVersion":1,"app":"FAR/AIM Pro","studyMarks":[{"type":"ac","reference":"AC 61-98D","title":"Currency guidance","path":"/advisory-circulars/ac-61-98d","saved":true,"updatedAt":200},{"type":"far","reference":"61.57","title":"Unsafe","path":"https://example.com","updatedAt":400},{"type":"aim","reference":"AIM 4-3-1","title":"Missing timestamp","path":"/aim/4"}],"readingHistory":[{"type":"aim","id":"4","title":"AIM Chapter 4","path":"/aim/4","timestamp":300},{"type":"far","id":"61","title":"Missing timestamp","path":"/far/61"}],"searchHistory":["night currency","Night Currency","airspace"]}"#.write(
            to: validURL,
            atomically: true,
            encoding: .utf8
        )

        let result = try dataService.importStudyPack(from: validURL)
        XCTAssertEqual(result.marksImported, 1)
        XCTAssertEqual(result.historyImported, 1)
        XCTAssertEqual(result.searchHistoryImported, 2)
        XCTAssertEqual(dataService.aimReadingHistory?.identifier, "7")
        XCTAssertEqual(dataService.searchHistory, ["night currency", "airspace"])
        dataService.recordSearch("weather")

        let exportedData = try XCTUnwrap(dataService.createStudyPackJSON().data(using: .utf8))
        let exported = try XCTUnwrap(
            JSONSerialization.jsonObject(with: exportedData) as? [String: Any]
        )
        XCTAssertEqual(exported["searchHistory"] as? [String], ["weather", "night currency", "airspace"])
        let marks = try XCTUnwrap(exported["studyMarks"] as? [[String: Any]])
        XCTAssertEqual(marks.first?["path"] as? String, "/advisory-circulars/ac-61-98d")
    }

    func testStudyMarkUpdatesRefreshLegacyAdvisoryCircularRoute() throws {
        let dataService = DataService.shared
        let defaults = UserDefaults.standard
        let key = "far-aim-pro-study-marks"
        let legacy = StudyMark(
            key: "ac:AC 61-98D",
            type: "ac",
            reference: "AC 61-98D",
            title: "Legacy title",
            route: "ac",
            saved: true,
            highlighted: false,
            note: "",
            savedAt: Date(),
            reviewedAt: nil,
            updatedAt: Date(timeIntervalSince1970: 1)
        )
        defaults.set(try JSONEncoder().encode([legacy]), forKey: key)
        dataService.loadStudyMarks()
        defer {
            defaults.removeObject(forKey: key)
            dataService.loadStudyMarks()
        }

        dataService.toggleHighlighted(StudyMarkInput(
            type: "ac",
            reference: "AC 61-98D",
            title: "Currency guidance",
            route: "ac:ac-61-98d"
        ))

        let updated = try XCTUnwrap(dataService.studyMarks.first)
        XCTAssertEqual(updated.title, "Currency guidance")
        XCTAssertEqual(updated.route, "ac:ac-61-98d")
        XCTAssertEqual(
            publicReferenceLink(for: updated.route),
            "https://faraim.online/advisory-circulars/ac-61-98d"
        )
    }
}
