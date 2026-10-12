package com.faraimpro.app.ui.screens

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.FlashcardDeck
import com.faraimpro.app.data.Quiz
import com.faraimpro.app.data.StudyPath
import com.faraimpro.app.data.StudyPathReference
import com.faraimpro.app.data.StudyMarkInput
import com.faraimpro.app.data.StudyMarkManager
import com.faraimpro.app.data.StudyPackManager
import com.faraimpro.app.ui.theme.AviationNavy
import com.faraimpro.app.ui.theme.AviationSky
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.charset.StandardCharsets

private val StudyContentMaxWidth = 960.dp

private data class StudyContent(
    val quizzes: List<Quiz>,
    val flashcardDecks: List<FlashcardDeck>,
    val studyPaths: List<StudyPath>
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudyScreen(navController: NavController, repository: DataRepository) {
    var content by remember { mutableStateOf<StudyContent?>(null) }
    val context = LocalContext.current
    var studyMarks by remember { mutableStateOf(StudyMarkManager.getStudyMarks(context)) }
    val quizzes = content?.quizzes.orEmpty()
    val flashcardDecks = content?.flashcardDecks.orEmpty()
    val reviewQueue = studyMarks
        .filter { it.saved || it.highlighted || it.note.isNotBlank() || it.reviewedAt != null }
        .take(6)
    
    val totalQuestions = quizzes.sumOf { it.questionCount }
    val totalCards = flashcardDecks.sumOf { it.cardCount }
    val savedCount = studyMarks.count { it.saved }
    val highlightedCount = studyMarks.count { it.highlighted }
    val notesCount = studyMarks.count { it.note.isNotBlank() }
    val reviewedCount = studyMarks.count { it.reviewedAt != null }
    var studyPackStatus by remember { mutableStateOf<String?>(null) }
    val exportStudyPack = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(StudyPackManager.createStudyPackJson(context).toByteArray(StandardCharsets.UTF_8))
            } ?: error("Unable to open export file")
        }.onSuccess {
            studyPackStatus = "Study pack exported"
        }.onFailure { error ->
            studyPackStatus = "Export failed"
            Toast.makeText(context, error.message ?: "Export failed", Toast.LENGTH_LONG).show()
        }
    }
    val importStudyPack = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                ?: error("Unable to open import file")
        }.mapCatching { content ->
            StudyPackManager.importStudyPackJson(context, content)
        }.onSuccess { result ->
            studyMarks = StudyMarkManager.getStudyMarks(context)
            studyPackStatus = "${result.marksImported} marks imported"
        }.onFailure { error ->
            studyPackStatus = "Import failed"
            Toast.makeText(context, error.message ?: "Import failed", Toast.LENGTH_LONG).show()
        }
    }
    val contentModifier = Modifier
        .widthIn(max = StudyContentMaxWidth)
        .fillMaxWidth()

    LaunchedEffect(repository) {
        content = withContext(Dispatchers.IO) {
            StudyContent(
                quizzes = repository.getQuizzes(),
                flashcardDecks = repository.getFlashcardDecks(),
                studyPaths = repository.getStudyPaths()
            )
        }
        studyMarks = StudyMarkManager.getStudyMarks(context)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Study") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Stats header
            Card(
                modifier = contentModifier,
                colors = CardDefaults.cardColors(
                    containerColor = AviationNavy
                ),
                shape = MaterialTheme.shapes.extraLarge
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.Start
                ) {
                    Icon(
                        imageVector = Icons.Default.FlightTakeoff,
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                        tint = Color.White
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "CHECKRIDE PREP",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = AviationSky
                    )
                    Text(
                        text = "Train with purpose.",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Follow a certificate path or sharpen one topic at a time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.72f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    HorizontalDivider(color = Color.White.copy(alpha = 0.18f))
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "${quizzes.size}",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Quizzes",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "$totalQuestions",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Questions",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "$totalCards",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                text = "Cards",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Certificate Paths",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = contentModifier
            )

            Spacer(modifier = Modifier.height(12.dp))

            content?.studyPaths.orEmpty().forEach { path ->
                StudyPathCard(
                    path = path,
                    modifier = contentModifier.padding(vertical = 4.dp),
                    onReferenceClick = { reference ->
                        navController.navigate(studyReferenceRoute(reference))
                    }
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Saved & Notes",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = contentModifier
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = contentModifier,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StudyStatChip("Saved", savedCount, Modifier.weight(1f))
                StudyStatChip("Marked", highlightedCount, Modifier.weight(1f))
                StudyStatChip("Notes", notesCount, Modifier.weight(1f))
                StudyStatChip("Reviewed", reviewedCount, Modifier.weight(1f))
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = contentModifier,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { importStudyPack.launch(arrayOf("application/json", "text/json", "text/plain")) },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.UploadFile, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Import pack")
                }
                Button(
                    onClick = {
                        exportStudyPack.launch("far-aim-pro-study-pack-${System.currentTimeMillis()}.json")
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Download, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Export pack")
                }
            }

            studyPackStatus?.let { status ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = contentModifier
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (reviewQueue.isEmpty()) {
                StudyActionCard(
                    title = "Build review queue",
                    subtitle = "Save FAR, AIM, or AC references, add notes, and mark them reviewed.",
                    icon = Icons.Default.Bookmark,
                    modifier = contentModifier,
                    onClick = { navController.navigate("far_part/61") }
                )
            } else {
                reviewQueue.forEach { mark ->
                    Card(
                        onClick = { navController.navigate(mark.route) },
                        modifier = Modifier
                            .widthIn(max = StudyContentMaxWidth)
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                AssistChip(
                                    onClick = { },
                                    label = { Text(mark.reference) }
                                )
                                if (mark.reviewedAt != null) {
                                    Text(
                                        text = "reviewed",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                if (mark.highlighted) {
                                    Text(
                                        text = "highlighted",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.tertiary
                                    )
                                }
                            }
                            Text(
                                text = mark.title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold
                            )
                            if (mark.note.isNotBlank()) {
                                Text(
                                    text = mark.note,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = {
                                        studyMarks = StudyMarkManager.markReviewed(
                                            context,
                                            StudyMarkInput(mark.type, mark.reference, mark.title, mark.route)
                                        )
                                    }
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Review")
                                }
                                TextButton(
                                    onClick = {
                                        studyMarks = StudyMarkManager.removeStudyMark(context, mark.key)
                                    }
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = null)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Remove")
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            if (content == null) {
                Box(
                    modifier = contentModifier.height(220.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
                Spacer(modifier = Modifier.height(32.dp))
                return@Column
            }
            
            // Quizzes Section
            Text(
                text = "Practice Quizzes",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = contentModifier
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            StudyActionCard(
                title = "All Quizzes",
                subtitle = "${quizzes.size} quizzes with $totalQuestions questions",
                icon = Icons.Default.Quiz,
                modifier = contentModifier,
                onClick = { navController.navigate("quizzes") }
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Flashcards Section
            Text(
                text = "Flashcards",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = contentModifier
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            StudyActionCard(
                title = "All Flashcard Decks",
                subtitle = "${flashcardDecks.size} decks with $totalCards cards",
                icon = Icons.Default.Style,
                modifier = contentModifier,
                onClick = { navController.navigate("flashcards") }
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Quick access to individual items
            Text(
                text = "Quick Start",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = contentModifier
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            // Show first few quizzes
            quizzes.take(3).forEach { quiz ->
                Card(
                    onClick = { navController.navigate("quiz/${quiz.id}") },
                    modifier = Modifier
                        .widthIn(max = StudyContentMaxWidth)
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = quiz.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = "${quiz.questionCount} questions",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Icon(
                            imageVector = Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

private fun studyReferenceRoute(reference: StudyPathReference): String {
    return when (reference.type) {
        "far" -> "far_part/${reference.part ?: 61}"
        "aim" -> "aim_chapter/${reference.chapter ?: 1}"
        else -> "study"
    }
}

@Composable
private fun StudyPathCard(
    path: StudyPath,
    modifier: Modifier = Modifier,
    onReferenceClick: (StudyPathReference) -> Unit
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Route,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = path.category,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    Text(
                        text = path.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = path.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Text(
                text = path.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StudyPathStat("Refs", path.references.size, Modifier.weight(1f))
                StudyPathStat("Quizzes", path.quizIds.size, Modifier.weight(1f))
                StudyPathStat("Decks", path.flashcardDeckIds.size, Modifier.weight(1f))
            }

            path.references.take(5).forEach { reference ->
                OutlinedButton(
                    onClick = { onReferenceClick(reference) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = reference.label,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                    Icon(Icons.Default.ChevronRight, contentDescription = null)
                }
            }
        }
    }
}

@Composable
private fun StudyPathStat(label: String, value: Int, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        shape = MaterialTheme.shapes.medium,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$value",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun StudyStatChip(label: String, value: Int, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$value",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun StudyActionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = modifier
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.size(56.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier
                        .padding(14.dp)
                        .fillMaxSize(),
                    tint = MaterialTheme.colorScheme.onSecondaryContainer
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
