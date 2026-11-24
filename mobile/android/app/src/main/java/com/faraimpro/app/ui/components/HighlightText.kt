package com.faraimpro.app.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import java.util.regex.Pattern

private val MARKDOWN_PATTERN: Pattern = Pattern.compile(
    "\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*|_([^_]+)_"
)

private val PLAIN_SPAN_STYLE = SpanStyle()
private val BOLD_SPAN_STYLE = SpanStyle(fontWeight = FontWeight.Bold)
private val ITALIC_SPAN_STYLE = SpanStyle(fontStyle = FontStyle.Italic)

/**
 * Parse markdown-like formatting in text:
 * - *text* or **text** -> bold
 * - _text_ -> italic
 * Also highlights search query matches
 */
@Composable
fun HighlightText(
    text: String,
    query: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    maxLines: Int = Int.MAX_VALUE
) {
    val annotatedString = remember(text, query) {
        buildAnnotatedString {
            val formattedText = parseMarkdownFormatting(text)

            if (query.isBlank()) {
                formattedText.forEach { segment ->
                    withStyle(style = segment.style) {
                        append(segment.text)
                    }
                }
            } else {
                val plainText = buildString(text.length) {
                    formattedText.forEach { append(it.text) }
                }

                val pattern = Pattern.compile(Pattern.quote(query), Pattern.CASE_INSENSITIVE)
                val matcher = pattern.matcher(plainText)
                val matches = mutableListOf<IntRange>()
                while (matcher.find()) {
                    matches.add(matcher.start() until matcher.end())
                }

                if (matches.isEmpty()) {
                    formattedText.forEach { segment ->
                        withStyle(style = segment.style) {
                            append(segment.text)
                        }
                    }
                } else {
                    var globalPos = 0
                    var matchIdx = 0
                    for (segment in formattedText) {
                        val segmentStart = globalPos
                        val segmentEnd = globalPos + segment.text.length
                        var localPos = 0

                        while (localPos < segment.text.length) {
                            val globalCharPos = segmentStart + localPos
                            while (matchIdx < matches.size && matches[matchIdx].last < globalCharPos) {
                                matchIdx++
                            }

                            val currentMatch = matches.getOrNull(matchIdx)
                            if (currentMatch != null && globalCharPos in currentMatch) {
                                val matchEndInSegment = minOf(currentMatch.last + 1 - segmentStart, segment.text.length)
                                val combinedStyle = segment.style.copy(
                                    background = Color.Yellow.copy(alpha = 0.3f),
                                    fontWeight = FontWeight.Bold
                                )
                                withStyle(style = combinedStyle) {
                                    append(segment.text, localPos, matchEndInSegment)
                                }
                                localPos = matchEndInSegment
                            } else {
                                val nextMatchStart = if (currentMatch != null && currentMatch.first > globalCharPos) {
                                    minOf(currentMatch.first - segmentStart, segment.text.length)
                                } else {
                                    segment.text.length
                                }
                                withStyle(style = segment.style) {
                                    append(segment.text, localPos, nextMatchStart)
                                }
                                localPos = nextMatchStart
                            }
                        }

                        globalPos = segmentEnd
                    }
                }
            }
        }
    }

    Text(
        text = annotatedString,
        modifier = modifier,
        style = style,
        color = color,
        fontWeight = fontWeight,
        maxLines = maxLines,
        overflow = if (maxLines < Int.MAX_VALUE) TextOverflow.Ellipsis else TextOverflow.Clip
    )
}

/**
 * A text segment with associated style
 */
private data class StyledSegment(
    val text: String,
    val style: SpanStyle
)

/**
 * Parse markdown-like formatting and return styled segments
 */
private fun parseMarkdownFormatting(text: String): List<StyledSegment> {
    if (!text.contains('*') && !text.contains('_')) {
        return listOf(StyledSegment(text = text, style = PLAIN_SPAN_STYLE))
    }

    val segments = mutableListOf<StyledSegment>()
    val matcher = MARKDOWN_PATTERN.matcher(text)

    var lastEnd = 0

    while (matcher.find()) {
        if (matcher.start() > lastEnd) {
            segments.add(
                StyledSegment(
                    text = text.substring(lastEnd, matcher.start()),
                    style = PLAIN_SPAN_STYLE
                )
            )
        }

        when {
            matcher.group(1) != null -> {
                segments.add(
                    StyledSegment(
                        text = matcher.group(1)!!,
                        style = BOLD_SPAN_STYLE
                    )
                )
            }
            matcher.group(2) != null -> {
                segments.add(
                    StyledSegment(
                        text = matcher.group(2)!!,
                        style = BOLD_SPAN_STYLE
                    )
                )
            }
            matcher.group(3) != null -> {
                segments.add(
                    StyledSegment(
                        text = matcher.group(3)!!,
                        style = ITALIC_SPAN_STYLE
                    )
                )
            }
        }

        lastEnd = matcher.end()
    }

    if (lastEnd < text.length) {
        segments.add(
            StyledSegment(
                text = text.substring(lastEnd),
                style = PLAIN_SPAN_STYLE
            )
        )
    }

    if (segments.isEmpty()) {
        segments.add(StyledSegment(text = text, style = PLAIN_SPAN_STYLE))
    }

    return segments
}

/**
 * Simple formatted text without search highlighting
 * Renders markdown-like formatting (bold, italic)
 */
@Composable
fun FormattedText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    maxLines: Int = Int.MAX_VALUE
) {
    HighlightText(
        text = text,
        query = "",
        modifier = modifier,
        style = style,
        color = color,
        fontWeight = fontWeight,
        maxLines = maxLines
    )
}
