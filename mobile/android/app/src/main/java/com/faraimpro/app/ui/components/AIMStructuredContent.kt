package com.faraimpro.app.ui.components

import android.content.res.AssetManager
import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.faraimpro.app.data.AIMFigure
import com.faraimpro.app.data.AIMTable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private sealed interface FigureLoadState {
    data object Loading : FigureLoadState
    data class Loaded(val bitmap: ImageBitmap) : FigureLoadState
    data object Missing : FigureLoadState
}

internal data class AIMTableLayout(
    val caption: String?,
    val headers: List<String>,
    val rows: List<List<String>>
)

internal sealed interface FARContentBlock {
    data class Text(val value: String) : FARContentBlock
    data class Table(val value: AIMTable) : FARContentBlock
}

internal fun parseFARContent(content: String): List<FARContentBlock> {
    val blocks = mutableListOf<FARContentBlock>()
    var cursor = 0

    fun addText(value: String) {
        if (value.isNotEmpty()) blocks += FARContentBlock.Text(value)
    }

    while (cursor < content.length) {
        val tableStart = content.indexOf("[TABLE]", startIndex = cursor)
        if (tableStart < 0) {
            addText(content.substring(cursor))
            break
        }
        addText(content.substring(cursor, tableStart))

        val bodyStart = tableStart + "[TABLE]".length
        val tableEnd = content.indexOf("[/TABLE]", startIndex = bodyStart)
        if (tableEnd < 0) {
            addText(content.substring(tableStart))
            break
        }

        val rows = content.substring(bodyStart, tableEnd)
            .lineSequence()
            .filter { it.isNotBlank() }
            .map(::parseFARTableRow)
            .toList()
        if (rows.isEmpty()) {
            addText(content.substring(tableStart, tableEnd + "[/TABLE]".length))
        } else {
            blocks += FARContentBlock.Table(
                AIMTable(
                    headers = rows.first(),
                    rows = rows.drop(1),
                    caption = null
                )
            )
        }
        cursor = tableEnd + "[/TABLE]".length
    }

    return blocks
}

private fun parseFARTableRow(line: String): List<String> {
    var row = line.trim()
    if (row.startsWith('|')) row = row.drop(1)
    if (row.endsWith('|') && !isEscapedPipe(row, row.lastIndex)) row = row.dropLast(1)

    val cells = mutableListOf<String>()
    val cell = StringBuilder()
    var index = 0
    while (index < row.length) {
        when {
            row[index] == '\\' && row.getOrNull(index + 1) == '|' -> {
                cell.append('|')
                index += 2
            }
            row[index] == '|' -> {
                cells += cell.toString().trim()
                cell.clear()
                index++
            }
            else -> cell.append(row[index++])
        }
    }
    cells += cell.toString().trim()
    return cells
}

private fun isEscapedPipe(value: String, pipeIndex: Int): Boolean {
    var backslashes = 0
    var index = pipeIndex - 1
    while (index >= 0 && value[index] == '\\') {
        backslashes++
        index--
    }
    return backslashes % 2 == 1
}

internal fun normalizeAIMTable(table: AIMTable): AIMTableLayout {
    val rows = table.rows.orEmpty().filter { row -> row.any { it.isNotBlank() } }
    val columnCount = maxOf(
        table.headers.orEmpty().size,
        rows.maxOfOrNull { it.size } ?: 0
    )
    if (columnCount == 0) return AIMTableLayout(table.caption, emptyList(), emptyList())

    fun List<String>.padded(): List<String> = take(columnCount) + List((columnCount - size).coerceAtLeast(0)) { "" }
    val headers = table.headers.orEmpty().padded()
    return AIMTableLayout(table.caption, headers, rows.map { it.padded() })
}

internal fun figureSampleSize(width: Int, height: Int, maximumDimension: Int = 2048): Int {
    var sampleSize = 1
    while (width / sampleSize > maximumDimension || height / sampleSize > maximumDimension) {
        sampleSize *= 2
    }
    return sampleSize
}

internal fun figureAssetCandidates(assetDirectory: String, source: String): List<String> {
    val normalizedSource = source.trim().trimStart('/')
    if (normalizedSource.isBlank()) return emptyList()

    val normalizedDirectory = assetDirectory.trim().trim('/')
    val parentDirectory = normalizedDirectory.substringBeforeLast('/', missingDelimiterValue = "")
    return buildList {
        if (normalizedDirectory.isNotBlank()) add("$normalizedDirectory/$normalizedSource")
        parentDirectory.takeIf { it.isNotBlank() }?.let { add("$it/$normalizedSource") }
        add(normalizedSource)
    }.distinct()
}

internal fun figureAccessibilityDescription(
    figure: AIMFigure,
    figureKind: String,
    figureNumber: Int
): String {
    return buildList {
        add("$figureKind figure $figureNumber")
        figure.alt?.takeIf { it.isNotBlank() }?.let(::add)
        figure.caption?.takeIf { it.isNotBlank() }?.let(::add)
    }.distinct().joinToString(". ")
}

private fun decodeFigure(assets: AssetManager, path: String): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    assets.open(path).use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    val options = BitmapFactory.Options().apply {
        inSampleSize = figureSampleSize(bounds.outWidth, bounds.outHeight)
    }
    return assets.open(path).use { stream ->
        BitmapFactory.decodeStream(stream, null, options)?.asImageBitmap()
    }
}

@Composable
fun AIMFigures(figures: List<AIMFigure>, modifier: Modifier = Modifier) {
    StructuredFigures(
        figures = figures,
        assetDirectory = "aim/images",
        figureKind = "AIM",
        modifier = modifier
    )
}

@Composable
fun FARFigures(figures: List<AIMFigure>, modifier: Modifier = Modifier) {
    StructuredFigures(
        figures = figures,
        assetDirectory = "far/images",
        figureKind = "FAR",
        modifier = modifier
    )
}

@Composable
private fun StructuredFigures(
    figures: List<AIMFigure>,
    assetDirectory: String,
    figureKind: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        figures.forEachIndexed { index, figure ->
            StructuredFigureCard(
                figure = figure,
                figureNumber = index + 1,
                assetDirectory = assetDirectory,
                figureKind = figureKind
            )
        }
    }
}

@Composable
private fun StructuredFigureCard(
    figure: AIMFigure,
    figureNumber: Int,
    assetDirectory: String,
    figureKind: String
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val accessibleDescription = figureAccessibilityDescription(figure, figureKind, figureNumber)
    val caption = figure.caption?.takeIf { it.isNotBlank() }
        ?: figure.alt?.takeIf { it.isNotBlank() }
    val state by produceState<FigureLoadState>(FigureLoadState.Loading, assetDirectory, figure.src) {
        value = withContext(Dispatchers.IO) {
            val bitmap = figureAssetCandidates(assetDirectory, figure.src).firstNotNullOfOrNull { path ->
                runCatching { decodeFigure(context.assets, path) }.getOrNull()
            }
            bitmap?.let(FigureLoadState::Loaded) ?: FigureLoadState.Missing
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$figureKind figure $figureNumber",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth()
            )
            when (val figureState = state) {
                FigureLoadState.Loading -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }

                is FigureLoadState.Loaded -> {
                    val ratio = (figureState.bitmap.width.toFloat() / figureState.bitmap.height)
                        .coerceIn(0.5f, 3f)
                    Image(
                        bitmap = figureState.bitmap,
                        contentDescription = accessibleDescription,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(ratio)
                    )
                }

                FigureLoadState.Missing -> {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surface
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(Icons.Default.BrokenImage, contentDescription = null)
                            Text(
                                "Figure unavailable offline",
                                style = MaterialTheme.typography.titleSmall
                            )
                            Text(
                                accessibleDescription,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                            figure.originalUrl?.takeIf { it.startsWith("https://") }?.let { url ->
                                OutlinedButton(onClick = { uriHandler.openUri(url) }) {
                                    Icon(
                                        Icons.AutoMirrored.Filled.OpenInNew,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text("Open FAA figure", modifier = Modifier.padding(start = 6.dp))
                                }
                            }
                        }
                    }
                }
            }
            caption?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun AIMTables(tables: List<AIMTable>, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        tables.forEachIndexed { index, table ->
            AIMTableView(
                layout = normalizeAIMTable(table),
                tableNumber = index + 1,
                showDefaultCaption = true
            )
        }
    }
}

@Composable
fun StructuredTable(
    table: AIMTable,
    searchQuery: String,
    modifier: Modifier = Modifier,
    tableTextStyle: TextStyle? = null
) {
    AIMTableView(
        layout = normalizeAIMTable(table),
        tableNumber = 1,
        searchQuery = searchQuery,
        showDefaultCaption = false,
        modifier = modifier,
        tableTextStyle = tableTextStyle
    )
}

@Composable
fun FARContent(
    content: String,
    searchQuery: String,
    modifier: Modifier = Modifier,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyMedium,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface
) {
    val blocks = remember(content) { parseFARContent(content) }
    if (blocks.size == 1 && blocks.first() is FARContentBlock.Text) {
        HighlightText(
            text = (blocks.first() as FARContentBlock.Text).value,
            query = searchQuery,
            modifier = modifier,
            style = style,
            color = color
        )
        return
    }

    Column(modifier = modifier) {
        blocks.forEach { block ->
            when (block) {
                is FARContentBlock.Text -> if (block.value.isNotEmpty()) {
                    HighlightText(
                        text = block.value,
                        query = searchQuery,
                        style = style,
                        color = color
                    )
                }
                is FARContentBlock.Table -> StructuredTable(
                    table = block.value,
                    searchQuery = searchQuery,
                    tableTextStyle = style
                )
            }
        }
    }
}

@Composable
private fun AIMTableView(
    layout: AIMTableLayout,
    tableNumber: Int,
    showDefaultCaption: Boolean,
    modifier: Modifier = Modifier,
    searchQuery: String = "",
    tableTextStyle: TextStyle? = null
) {
    if (layout.rows.isEmpty() && layout.headers.all { it.isBlank() }) return

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        val caption = layout.caption?.takeIf { it.isNotBlank() }
        if (caption != null || showDefaultCaption) {
            Text(
                text = caption ?: "Table $tableNumber",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold
            )
        }
        Box(modifier = Modifier.horizontalScroll(rememberScrollState())) {
            Column {
                if (layout.headers.any { it.isNotBlank() }) {
                    AIMTableRow(
                        cells = layout.headers,
                        accessibilityLabel = layout.headers.mapIndexed { index, value ->
                            "Column ${index + 1}: ${value.ifBlank { "Unlabeled" }}"
                        }.joinToString(". "),
                        isHeader = true,
                        searchQuery = searchQuery,
                        textStyle = tableTextStyle ?: MaterialTheme.typography.bodySmall
                    )
                }
                layout.rows.forEachIndexed { rowIndex, row ->
                    val label = row.mapIndexed { columnIndex, value ->
                        val header = layout.headers.getOrNull(columnIndex).orEmpty()
                            .ifBlank { "Column ${columnIndex + 1}" }
                        "$header: ${value.ifBlank { "blank" }}"
                    }.joinToString(". ")
                    AIMTableRow(
                        cells = row,
                        accessibilityLabel = "Row ${rowIndex + 1}. $label",
                        isHeader = false,
                        searchQuery = searchQuery,
                        textStyle = tableTextStyle ?: MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun AIMTableRow(
    cells: List<String>,
    accessibilityLabel: String,
    isHeader: Boolean,
    searchQuery: String,
    textStyle: TextStyle
) {
    Row(
        modifier = Modifier.clearAndSetSemantics { contentDescription = accessibilityLabel }
    ) {
        cells.forEach { value ->
            Surface(
                modifier = Modifier.width(132.dp),
                color = if (isHeader) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surface
                },
                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                HighlightText(
                    text = value.ifBlank { " " },
                    query = searchQuery,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    style = textStyle,
                    fontWeight = if (isHeader) FontWeight.SemiBold else FontWeight.Normal
                )
            }
        }
    }
}
