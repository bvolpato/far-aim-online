package com.faraimpro.app.ui.components

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performSemanticsAction
import com.faraimpro.app.data.AIMTable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AIMStructuredContentRenderingTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun offscreenTableRowsAreNotComposed() {
        renderTable(rowCount = 40)
        compose.onNode(hasContentDescription("Row 40.", substring = true)).assertDoesNotExist()
        compose.onNode(hasContentDescription("Row 1.", substring = true)).assertIsDisplayed()
    }

    @Test
    fun largeTableComposesVisibleRowsAndCanReachLastRowAndColumn() {
        renderTable(rowCount = 3687)

        val lastRow = hasContentDescription("Row 3687.", substring = true)
        compose.onNode(lastRow).assertDoesNotExist()
        compose.onNode(hasContentDescription("Row 1.", substring = true)).assertIsDisplayed()

        val tableRows = hasScrollToIndexAction() and hasAnyAncestor(hasScrollToIndexAction())
        compose.onNode(tableRows).performScrollToIndex(3686)
        compose.onNode(lastRow).assertIsDisplayed()

        val horizontalScroll = SemanticsMatcher.keyIsDefined(SemanticsProperties.HorizontalScrollAxisRange)
        val tableViewport = compose.onNode(horizontalScroll)
        val initialRange = tableViewport.fetchSemanticsNode().config[SemanticsProperties.HorizontalScrollAxisRange]
        assertTrue(initialRange.maxValue() > 0f)
        tableViewport.performSemanticsAction(SemanticsActions.ScrollBy) { scrollBy ->
            scrollBy(100_000f, 0f)
        }
        compose.waitForIdle()
        val finalRange = tableViewport.fetchSemanticsNode().config[SemanticsProperties.HorizontalScrollAxisRange]
        assertEquals(finalRange.maxValue(), finalRange.value(), 1f)
        compose.onNode(lastRow).assertIsDisplayed()
    }

    private fun renderTable(rowCount: Int) {
        val table = AIMTable(
            headers = List(14) { "Column ${it + 1}" },
            rows = List(rowCount) { row -> List(14) { column -> "R${row + 1}C${column + 1}" } },
            caption = null
        )
        compose.setContent {
            MaterialTheme {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item { StructuredTable(table = table, searchQuery = "") }
                }
            }
        }
    }
}
