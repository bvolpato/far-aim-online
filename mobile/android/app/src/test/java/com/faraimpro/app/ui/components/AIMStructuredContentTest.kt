package com.faraimpro.app.ui.components

import com.faraimpro.app.data.AIMTable
import com.faraimpro.app.data.AIMFigure
import com.faraimpro.app.data.FARAppendix
import com.faraimpro.app.data.FARSection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AIMStructuredContentTest {
    @Test
    fun largeFiguresUsePowerOfTwoDownsampling() {
        assertEquals(1, figureSampleSize(width = 1200, height = 1800))
        assertEquals(4, figureSampleSize(width = 4203, height = 5024))
    }

    @Test
    fun unevenSourceRowsArePaddedAndBlankRowsDropped() {
        val layout = normalizeAIMTable(
            AIMTable(
                headers = listOf("Signal", "Meaning"),
                rows = listOf(
                    listOf("", ""),
                    listOf("Red", "Stop", "Extra source note"),
                    listOf("Green")
                ),
                caption = "Signal meanings"
            )
        )

        assertEquals("Signal meanings", layout.caption)
        assertEquals(listOf("Signal", "Meaning", ""), layout.headers)
        assertEquals(
            listOf(
                listOf("Red", "Stop", "Extra source note"),
                listOf("Green", "", "")
            ),
            layout.rows
        )
    }

    @Test
    fun farContentTablesPreserveTextOrderEmptyCellsAndEscapedPipes() {
        val blocks = parseFARContent(
            "Before\n[TABLE]\n" +
                "| Name | Note | End |\n\n" +
                "| Route | Turns \\| Restrictions | |\n" +
                "| Alternate | | Do not use |\n" +
                "[/TABLE]\nAfter"
        )

        assertEquals(3, blocks.size)
        assertEquals(FARContentBlock.Text("Before\n"), blocks[0])
        assertEquals(FARContentBlock.Text("\nAfter"), blocks[2])

        val table = (blocks[1] as FARContentBlock.Table).value
        assertEquals(listOf("Name", "Note", "End"), table.headers)
        assertEquals(
            listOf(
                listOf("Route", "Turns | Restrictions", ""),
                listOf("Alternate", "", "Do not use")
            ),
            table.rows
        )
    }

    @Test
    fun figureAssetPathsKeepAIMFallbacksAndSupportFARImages() {
        assertEquals(
            listOf(
                "aim/images/chapter4/figure.png",
                "aim/chapter4/figure.png",
                "chapter4/figure.png"
            ),
            figureAssetCandidates("aim/images", "/chapter4/figure.png")
        )
        assertEquals(
            listOf(
                "far/images/appendix-a.png",
                "far/appendix-a.png",
                "appendix-a.png"
            ),
            figureAssetCandidates("far/images", "appendix-a.png")
        )
    }

    @Test
    fun figureAccessibilityDescriptionIncludesLabelAltAndCaption() {
        val figure = AIMFigure(
            src = "figure.png",
            alt = "Airport diagram",
            caption = "Figure A-1. Airport layout"
        )

        assertEquals(
            "FAR figure 1. Airport diagram. Figure A-1. Airport layout",
            figureAccessibilityDescription(figure, "FAR", 1)
        )
    }

    @Test
    fun FARFigureMetadataIsSearchableIncludingImageOnlyAppendices() {
        val figure = AIMFigure(
            src = "appendix-a.png",
            alt = "Holding pattern diagram",
            caption = "Figure A-1. Holding pattern"
        )

        val section = FARSection("91.1", "Scope", "", figures = listOf(figure))
        val appendix = FARAppendix("Appendix A", "Holding pattern", figures = listOf(figure))

        assertTrue(section.searchableText.contains("Holding pattern diagram"))
        assertTrue(appendix.searchableText.contains("Figure A-1. Holding pattern"))
    }
}
