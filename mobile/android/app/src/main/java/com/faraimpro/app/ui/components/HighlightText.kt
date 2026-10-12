package com.faraimpro.app.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
    val annotatedString = buildAnnotatedString {
        // First, process markdown formatting
        val formattedText = parseMarkdownFormatting(text)
        
        if (query.isBlank()) {
            // Just apply markdown formatting
            formattedText.forEach { segment ->
                withStyle(style = segment.style) {
                    append(segment.text)
                }
            }
        } else {
            // Build plain text for search matching
            val plainText = formattedText.joinToString("") { it.text }
            
            // Find all query matches
            val pattern = Pattern.compile(Pattern.quote(query), Pattern.CASE_INSENSITIVE)
            val matcher = pattern.matcher(plainText)
            val matches = mutableListOf<IntRange>()
            while (matcher.find()) {
                matches.add(matcher.start() until matcher.end())
            }
            
            // Apply formatting with highlights
            var globalPos = 0
            for (segment in formattedText) {
                val segmentStart = globalPos
                val segmentEnd = globalPos + segment.text.length
                
                var localPos = 0
                while (localPos < segment.text.length) {
                    val globalCharPos = segmentStart + localPos
                    
                    // Check if this position is within a match
                    val matchContaining = matches.find { globalCharPos in it }
                    
                    if (matchContaining != null) {
                        // Find how much of this segment is part of the match
                        val matchEndInSegment = minOf(matchContaining.last + 1 - segmentStart, segment.text.length)
                        val highlightText = segment.text.substring(localPos, matchEndInSegment)
                        
                        // Apply both segment style and highlight
                        val combinedStyle = segment.style.copy(
                            background = Color.Yellow.copy(alpha = 0.3f),
                            fontWeight = FontWeight.Bold
                        )
                        withStyle(style = combinedStyle) {
                            append(highlightText)
                        }
                        localPos = matchEndInSegment
                    } else {
                        // Find next match start or end of segment
                        val nextMatchStart = matches.filter { it.first > globalCharPos }
                            .minOfOrNull { it.first - segmentStart } ?: segment.text.length
                        val endPos = minOf(nextMatchStart, segment.text.length)
                        
                        withStyle(style = segment.style) {
                            append(segment.text.substring(localPos, endPos))
                        }
                        localPos = endPos
                    }
                }
                
                globalPos = segmentEnd
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
    val segments = mutableListOf<StyledSegment>()
    
    // Pattern to match *text* or **text** for bold, _text_ for italic
    // Match bold (**text** or *text*) and italic (_text_)
    val pattern = Pattern.compile(
        "\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*|_([^_]+)_"
    )
    val matcher = pattern.matcher(text)
    
    var lastEnd = 0
    
    while (matcher.find()) {
        // Add text before match as plain
        if (matcher.start() > lastEnd) {
            segments.add(StyledSegment(
                text = text.substring(lastEnd, matcher.start()),
                style = SpanStyle()
            ))
        }
        
        // Determine which group matched
        when {
            matcher.group(1) != null -> {
                // **bold**
                segments.add(StyledSegment(
                    text = matcher.group(1)!!,
                    style = SpanStyle(fontWeight = FontWeight.Bold)
                ))
            }
            matcher.group(2) != null -> {
                // *bold* (treating single asterisk as bold for definition terms)
                segments.add(StyledSegment(
                    text = matcher.group(2)!!,
                    style = SpanStyle(fontWeight = FontWeight.Bold)
                ))
            }
            matcher.group(3) != null -> {
                // _italic_
                segments.add(StyledSegment(
                    text = matcher.group(3)!!,
                    style = SpanStyle(fontStyle = FontStyle.Italic)
                ))
            }
        }
        
        lastEnd = matcher.end()
    }
    
    // Add remaining text
    if (lastEnd < text.length) {
        segments.add(StyledSegment(
            text = text.substring(lastEnd),
            style = SpanStyle()
        ))
    }
    
    // If no formatting found, return the whole text as plain
    if (segments.isEmpty()) {
        segments.add(StyledSegment(text = text, style = SpanStyle()))
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
