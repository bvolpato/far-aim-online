package com.faraimpro.app.ui.components

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Note
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.faraimpro.app.data.StudyMark
import com.faraimpro.app.data.StudyMarkInput
import com.faraimpro.app.data.StudyMarkManager

@Composable
fun StudyMarkActions(
    input: StudyMarkInput,
    modifier: Modifier = Modifier,
    onMarksChanged: (List<StudyMark>) -> Unit = {}
) {
    val context = LocalContext.current
    var mark by remember(input.key()) {
        mutableStateOf(StudyMarkManager.getStudyMark(context, input))
    }
    var noteOpen by remember(input.key()) { mutableStateOf(false) }
    var draft by remember(input.key(), mark?.note) { mutableStateOf(mark?.note.orEmpty()) }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            IconToggleButton(
                checked = mark?.saved == true,
                onCheckedChange = {
                    val marks = StudyMarkManager.toggleSaved(context, input)
                    mark = StudyMarkManager.getStudyMark(context, input)
                    onMarksChanged(marks)
                },
                colors = studyActionColors()
            ) {
                Icon(
                    Icons.Filled.Bookmark,
                    contentDescription = if (mark?.saved == true) "Remove saved reference" else "Save reference"
                )
            }
            IconToggleButton(
                checked = noteOpen || !mark?.note.isNullOrBlank(),
                onCheckedChange = { noteOpen = !noteOpen },
                colors = studyActionColors()
            ) {
                Icon(Icons.AutoMirrored.Filled.Note, contentDescription = "Edit note")
            }
            IconToggleButton(
                checked = mark?.highlighted == true,
                onCheckedChange = {
                    val marks = StudyMarkManager.toggleHighlighted(context, input)
                    mark = StudyMarkManager.getStudyMark(context, input)
                    onMarksChanged(marks)
                },
                colors = studyActionColors()
            ) {
                Icon(
                    Icons.Filled.Star,
                    contentDescription = if (mark?.highlighted == true) "Remove highlight" else "Highlight reference"
                )
            }
            IconToggleButton(
                checked = mark?.reviewedAt != null,
                onCheckedChange = {
                    val marks = StudyMarkManager.markReviewed(context, input)
                    mark = StudyMarkManager.getStudyMark(context, input)
                    onMarksChanged(marks)
                },
                colors = studyActionColors()
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = "Mark reviewed")
            }
            IconButton(onClick = { shareStudyReference(context, input) }) {
                Icon(Icons.Filled.Share, contentDescription = "Share reference")
            }
            mark?.let { currentMark ->
                IconButton(
                    onClick = {
                        val marks = StudyMarkManager.removeStudyMark(context, currentMark.key)
                        mark = null
                        noteOpen = false
                        draft = ""
                        onMarksChanged(marks)
                    }
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = "Clear study mark")
                }
            }
        }

        if (noteOpen) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Note for ${input.reference}") },
                minLines = 3
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    val marks = StudyMarkManager.saveNote(context, input, draft)
                    mark = StudyMarkManager.getStudyMark(context, input)
                    noteOpen = false
                    onMarksChanged(marks)
                }
            ) {
                Text("Save note")
            }
        }
    }
}

@Composable
private fun studyActionColors() = IconButtonDefaults.iconToggleButtonColors(
    checkedContentColor = MaterialTheme.colorScheme.primary,
    checkedContainerColor = MaterialTheme.colorScheme.primaryContainer
)

private fun shareStudyReference(context: Context, input: StudyMarkInput) {
    val subject = "${input.reference} - ${input.title}"
    val text = "$subject\n${publicReferenceUrl(input.route)}"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share reference"))
}

private fun publicReferenceUrl(route: String): String {
    return when {
        route.startsWith("far_part/") -> {
            val part = route.removePrefix("far_part/").substringBefore("?")
            "https://faraim.online/far/$part"
        }
        route.startsWith("aim_chapter/") -> {
            val chapter = route.removePrefix("aim_chapter/").substringBefore("?")
            "https://faraim.online/aim/$chapter"
        }
        route.startsWith("advisory_circulars/") -> {
            val id = route.removePrefix("advisory_circulars/").substringBefore("?")
            "https://faraim.online/advisory-circulars/$id"
        }
        route == "ac" -> "https://faraim.online/advisory-circulars"
        else -> "https://faraim.online"
    }
}
