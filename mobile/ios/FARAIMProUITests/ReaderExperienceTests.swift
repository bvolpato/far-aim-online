import XCTest

final class ReaderExperienceTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testFARSearchReplacesTheInitialSection() {
        assertReaderSearchReplacesHandoff(route: "far:61#61.3", query: "61.3", section: "far-section-61.3")
    }

    @MainActor
    func testAIMSearchReplacesTheInitialSection() {
        assertReaderSearchReplacesHandoff(route: "aim:4#4-1-2", query: "4-1-2", section: "aim-section-4-1-2")
    }

    @MainActor
    func testGlobalSearchOpensTheMatchingFARSection() {
        let app = launch()
        defer { app.terminate() }

        let searchLink = app.buttons["home-search"]
        reveal(searchLink, in: app)
        searchLink.tap()

        let field = app.textFields["global-search-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("FAR 61.8")

        let result = app.buttons["global-result-far/61#61.8"]
        XCTAssertTrue(result.waitForExistence(timeout: 10))
        reveal(result, in: app)
        result.tap()

        XCTAssertTrue(app.navigationBars["Part 61"].waitForExistence(timeout: 10))
        let section = app.buttons["far-section-61.8"]
        XCTAssertTrue(section.waitForExistence(timeout: 10))
        XCTAssertEqual(section.value as? String, "Expanded")
    }

    @MainActor
    func testReaderDraftSurvivesRotationAndTabSwitching() {
        let app = launch()
        defer {
            XCUIDevice.shared.orientation = .portrait
            app.terminate()
        }

        selectTab("FAR", in: app)
        replaceSearch(in: app, with: "Inapplicability unmanned")
        let part = app.buttons["far-part-61"]
        XCTAssertTrue(part.waitForExistence(timeout: 10))
        part.tap()

        let noteButton = app.buttons["study-note-toggle-far:§ 61.8"]
        reveal(noteButton, in: app)
        noteButton.tap()
        let editor = app.textViews["study-note-far:§ 61.8"]
        reveal(editor, in: app)
        editor.tap()
        let draft = "Unfinished reader note"
        editor.typeText(draft)

        XCUIDevice.shared.orientation = .landscapeRight
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue((editor.value as? String)?.contains(draft) == true)
        XCUIDevice.shared.orientation = .portrait
        app.swipeDown()

        selectTab("Study", in: app)
        selectTab("FAR", in: app)
        XCTAssertTrue(app.navigationBars["Part 61"].waitForExistence(timeout: 5))
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertTrue((editor.value as? String)?.contains(draft) == true)
    }

    @MainActor
    func testReaderTextScalesAndControlsWorkAtAccessibilitySize() {
        let app = launch(route: "far:61#61.8", query: "Inapplicability unmanned", contentSize: "UICTContentSizeCategoryL")
        resetReaderControls(in: app)
        let paragraph = app.staticTexts.matching(NSPredicate(
            format: "label BEGINSWITH %@", "Any action conducted pursuant to part 107 of this chapter"
        )).firstMatch
        XCTAssertTrue(paragraph.waitForExistence(timeout: 10))
        let standardHeight = paragraph.frame.height
        XCTAssertGreaterThan(standardHeight, 0)
        app.terminate()

        app.launchArguments = launchArguments(
            route: "far:61#61.8", query: "Inapplicability unmanned", contentSize: "UICTContentSizeCategoryAccessibilityXXXL"
        )
        app.launch()
        defer { app.terminate() }
        resetReaderControls(in: app)
        XCTAssertTrue(paragraph.waitForExistence(timeout: 10))
        XCTAssertGreaterThan(paragraph.frame.height, standardHeight * 1.2,
                             "Reader body text must respond to the system accessibility text size.")

        let controls = app.buttons["reader-controls"]
        XCTAssertTrue(controls.waitForExistence(timeout: 5))
        controls.tap()
        let increase = app.buttons["reader-text-increase"]
        let decrease = app.buttons["reader-text-decrease"]
        XCTAssertTrue(increase.waitForExistence(timeout: 5))
        XCTAssertTrue(increase.isHittable)
        XCTAssertTrue(decrease.isHittable)
        increase.tap()
        decrease.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "reader-density").firstMatch.exists)

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Reader controls at accessibility text size"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func assertReaderSearchReplacesHandoff(route: String, query: String, section: String) {
        let app = launch(route: route, query: query)
        defer { app.terminate() }
        let sectionButton = app.buttons[section]
        XCTAssertTrue(sectionButton.waitForExistence(timeout: 10))
        XCTAssertEqual(sectionButton.value as? String, "Expanded")

        replaceSearch(in: app, with: "nonexistentxyz")
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "reader-no-results").firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(sectionButton.exists)

        replaceSearch(in: app, with: query)
        reveal(sectionButton, in: app)
        sectionButton.tap()
        XCTAssertEqual(sectionButton.value as? String, "Collapsed",
                       "An active search must not disable the collapse control.")
    }

    @MainActor
    private func launch(route: String? = nil, query: String = "", contentSize: String? = nil) -> XCUIApplication {
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = launchArguments(route: route, query: query, contentSize: contentSize)
        app.launch()
        return app
    }

    private func launchArguments(route: String?, query: String, contentSize: String?) -> [String] {
        var arguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        if let route {
            arguments += ["--initial-route", route, "--initial-query", query]
        }
        if let contentSize {
            arguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        return arguments
    }

    @MainActor
    private func replaceSearch(in app: XCUIApplication, with query: String) {
        let field = app.searchFields.firstMatch
        if !field.exists {
            let searchButton = app.buttons["Search"].firstMatch
            if searchButton.exists {
                searchButton.tap()
            } else {
                app.swipeDown()
            }
        }
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        if !field.isHittable { app.swipeDown() }
        field.tap()
        let clear = field.buttons["Clear text"]
        if clear.exists {
            clear.tap()
            field.tap()
        }
        field.typeText(query)
        let searchKey = app.keyboards.buttons["Search"]
        if searchKey.exists { searchKey.tap() }
    }

    @MainActor
    private func resetReaderControls(in app: XCUIApplication) {
        let controls = app.buttons["reader-controls"]
        XCTAssertTrue(controls.waitForExistence(timeout: 10))
        controls.tap()
        let reset = app.buttons["Reset reader controls"]
        XCTAssertTrue(reset.waitForExistence(timeout: 5))
        reveal(reset, in: app)
        reset.tap()
        app.buttons["reader-controls-done"].tap()
    }

    @MainActor
    private func selectTab(_ title: String, in app: XCUIApplication) {
        let tab = app.tabBars.buttons.matching(identifier: title).firstMatch
        let button = tab.exists ? tab : app.buttons.matching(identifier: title).firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 10))
        button.tap()
    }

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists)
        XCTAssertTrue(element.isHittable)
    }
}
