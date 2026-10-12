package com.faraimpro.app.ui.screens

import android.net.Uri
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.faraimpro.app.data.AIMChapter
import com.faraimpro.app.data.AIMSection
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.formatAIMChapterLabel
import com.faraimpro.app.data.ReaderPreferences
import com.faraimpro.app.data.ReaderPreferencesManager
import com.faraimpro.app.data.ReadingHistoryManager
import com.faraimpro.app.data.StudyMarkInput
import com.faraimpro.app.ui.components.HighlightText
import com.faraimpro.app.ui.components.AIMFigures
import com.faraimpro.app.ui.components.AIMTables
import com.faraimpro.app.ui.components.ErrorState
import com.faraimpro.app.ui.components.LoadState
import com.faraimpro.app.ui.components.asLoadState
import com.faraimpro.app.ui.components.ReaderControls
import com.faraimpro.app.ui.components.StudyMarkActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val AIMContentMaxWidth = 960.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIMScreen(
    navController: NavController,
    repository: DataRepository
) {
    var searchQuery by remember { mutableStateOf("") }
    var loadState by remember { mutableStateOf<LoadState<List<AIMChapter>>>(LoadState.Loading) }
    var retryKey by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val readingHistory = remember { ReadingHistoryManager.getAIMReadingHistory(context) }

    LaunchedEffect(repository, retryKey) {
        loadState = LoadState.Loading
        loadState = withContext(Dispatchers.IO) {
            repository.loadAIMChapters(forceRefresh = retryKey > 0)
                .asLoadState { it.isEmpty() }
        }
    }
    val allChapters = (loadState as? LoadState.Loaded)?.value

    // Filter logic
    val filteredChapters = remember(searchQuery, allChapters) {
        val chapters = allChapters.orEmpty()
        if (searchQuery.isBlank()) {
            chapters
        } else {
            val query = searchQuery.lowercase()
            chapters.filter { chapter ->
                // Check Chapter title/number
                if (chapter.title.lowercase().contains(query) ||
                    chapter.chapter.toString().contains(query)) {
                    return@filter true
                }

                // Check sections content
                chapter.sections.any { section ->
                    section.title.lowercase().contains(query) ||
                    (section.content?.lowercase()?.contains(query) == true) ||
                    section.section.contains(query)
                }
            }
        }
    }

    Scaffold(
        topBar = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CenterAlignedTopAppBar(
                    title = { Text("AIM") },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                )
                 // Search Bar
                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .widthIn(max = AIMContentMaxWidth)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search AIM...") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear AIM search")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    )
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                modifier = Modifier
                    .widthIn(max = AIMContentMaxWidth)
                    .fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (loadState) {
                    LoadState.Loading -> item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    is LoadState.Error -> item {
                        ErrorState(
                            title = "AIM failed to load",
                            detail = "Bundled AIM chapters could not be read.",
                            onRetry = { retryKey++ },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(280.dp)
                        )
                    }
                    LoadState.Empty -> item {
                        Text(
                            "No AIM chapters are bundled with this version.",
                            modifier = Modifier.padding(24.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    is LoadState.Loaded -> {
                    // Continue Reading Banner
                    readingHistory?.let { history ->
                        item {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        val section = Uri.encode(history.section.orEmpty())
                                        val route = "aim_chapter/${history.identifier}" +
                                            section.takeIf(String::isNotEmpty)?.let { "?section=$it" }.orEmpty()
                                        navController.navigate(route)
                                    },
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Icon(
                                        Icons.Filled.Book,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Continue Reading",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                        Text(
                                            text = if (history.identifier == "0") {
                                                history.title
                                            } else {
                                                "Chapter ${history.identifier}: ${history.title}"
                                            },
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                    Icon(
                                        Icons.Filled.ChevronRight,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    items(filteredChapters) { chapter ->
                        AIMChapterCard(
                            chapter = chapter,
                            searchQuery = searchQuery,
                            onClick = {
                                val query = Uri.encode(searchQuery)
                                val route = "aim_chapter/${chapter.chapter}" +
                                    query.takeIf(String::isNotEmpty)?.let { "?query=$it" }.orEmpty()
                                navController.navigate(route)
                            }
                        )
                    }
                    }
                }
            }
        }
    }
}

@Composable
fun AIMChapterCard(
    chapter: AIMChapter,
    searchQuery: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                role = Role.Button,
                onClickLabel = "Open AIM ${formatAIMChapterLabel(chapter.chapter)}",
                onClick = onClick
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.size(48.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = if (chapter.chapter == 0) "G" else "${chapter.chapter}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }

            Column {
                HighlightText(
                    text = chapter.title,
                    query = searchQuery,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "${chapter.sections.size} Sections",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIMChapterDetailScreen(
    chapterId: Int,
    initialQuery: String,
    initialSection: String = "",
    navController: NavController,
    repository: DataRepository
) {
    var retryKey by remember { mutableIntStateOf(0) }
    val chapterState by produceState<LoadState<AIMChapter>>(
        initialValue = LoadState.Loading,
        repository,
        chapterId,
        retryKey
    ) {
        value = LoadState.Loading
        value = withContext(Dispatchers.IO) {
            repository.loadAIMChapters(forceRefresh = retryKey > 0).fold(
                onSuccess = { chapters ->
                    chapters.find { it.chapter == chapterId }
                        ?.let { LoadState.Loaded(it) }
                        ?: LoadState.Empty
                },
                onFailure = { LoadState.Error(it) }
            )
        }
    }
    var searchQuery by remember { mutableStateOf(initialQuery) }
    val context = LocalContext.current
    var readerPreferences by remember { mutableStateOf(ReaderPreferencesManager.get(context)) }
    val updateReaderPreferences: (ReaderPreferences) -> Unit = {
        readerPreferences = it
        ReaderPreferencesManager.save(context, it)
    }

    when (chapterState) {
        LoadState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }
        is LoadState.Error -> {
            ErrorState(
                title = "Chapter failed to load",
                detail = "Bundled AIM content could not be read.",
                onRetry = { retryKey++ }
            )
            return
        }
        LoadState.Empty -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Chapter not found")
            }
            return
        }
        is LoadState.Loaded -> Unit
    }
    val chapter = (chapterState as LoadState.Loaded<AIMChapter>).value
    val listState = rememberLazyListState()

    LaunchedEffect(chapter, initialSection) {
        val sectionIndex = chapter.sections.indexOfFirst { it.section == initialSection }
        if (sectionIndex >= 0) {
            listState.scrollToItem(sectionIndex + 2)
        }
    }
    
    // Save reading history when this screen appears
    LaunchedEffect(chapter) {
        ReadingHistoryManager.saveAIMReadingHistory(context, chapter.chapter, chapter.title)
    }

    Scaffold(
        topBar = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                TopAppBar(
                    title = { Text(formatAIMChapterLabel(chapter.chapter)) },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                )
                // Persistent Search Bar
                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    modifier = Modifier
                        .widthIn(max = AIMContentMaxWidth)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search in ${formatAIMChapterLabel(chapter.chapter)}...") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear chapter search")
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    )
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.TopCenter
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .widthIn(max = AIMContentMaxWidth)
                    .fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(16.dp)
                    ) {
                        Text(
                            text = formatAIMChapterLabel(chapter.chapter),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = chapter.title,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                item {
                    ReaderControls(
                        preferences = readerPreferences,
                        onPreferencesChanged = updateReaderPreferences
                    )
                }

                // Sections stay compact until selected or matched.
                chapter.sections.forEach { section ->
                    item {
                        AIMSectionItem(
                            section = section,
                            searchQuery = searchQuery,
                            defaultExpanded = section.section == initialSection,
                            studyMarkInput = StudyMarkInput(
                                type = "aim",
                                reference = "AIM ${section.section}",
                                title = section.title,
                                route = "aim_chapter/${chapter.chapter}?section=${Uri.encode(section.section)}"
                            ),
                            readerPreferences = readerPreferences,
                            onExpanded = {
                                ReadingHistoryManager.saveAIMReadingHistory(
                                    context,
                                    chapter.chapter,
                                    chapter.title,
                                    section.section
                                )
                            }
                        )
                    }
                }

                // Study Materials at end
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Study Materials",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(
                                onClick = { navController.navigate("quizzes") },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary
                                )
                            ) {
                                Icon(Icons.Filled.Quiz, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Quizzes")
                            }
                            Button(
                                onClick = { navController.navigate("flashcards") },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.secondary
                                )
                            ) {
                                Icon(Icons.Filled.Style, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Flashcards")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AIMSectionItem(
    section: AIMSection,
    searchQuery: String,
    defaultExpanded: Boolean = false,
    studyMarkInput: StudyMarkInput? = null,
    readerPreferences: ReaderPreferences = ReaderPreferences(),
    onExpanded: () -> Unit = {}
) {
    var isExpanded by remember(section.section, defaultExpanded) { mutableStateOf(defaultExpanded) }
    val bodyStyle = MaterialTheme.typography.bodyMedium.copy(
        fontSize = (14 * readerPreferences.fontScale).sp,
        lineHeight = (14 * readerPreferences.fontScale * readerPreferences.lineHeightMultiplier).sp
    )
    val smallStyle = MaterialTheme.typography.bodySmall.copy(
        fontSize = (12 * readerPreferences.fontScale).sp,
        lineHeight = (12 * readerPreferences.fontScale * readerPreferences.lineHeightMultiplier).sp
    )

     // Auto-expand if search query matches content inside
    val matchesSearch = remember(searchQuery, section) {
        if (searchQuery.isBlank()) return@remember false
        val text = buildString {
            append(section.section).append(' ')
            append(section.title).append(' ')
            append(section.content.orEmpty()).append(' ')
            section.subsections.orEmpty().forEach { append(it.title).append(' ').append(it.content).append(' ') }
            section.definitions.orEmpty().forEach { append(it.term).append(' ').append(it.definition).append(' ') }
            section.figures.orEmpty().forEach { append(it.alt.orEmpty()).append(' ').append(it.caption.orEmpty()).append(' ') }
            section.tables.orEmpty().forEach { table ->
                append(table.headers.orEmpty().joinToString(" ")).append(' ')
                append(table.rows.orEmpty().flatten().joinToString(" ")).append(' ')
            }
        }.lowercase()
        searchQuery.lowercase().split(Regex("\\s+")).filter { it.isNotBlank() }
            .all { text.contains(it) }
    }

    LaunchedEffect(matchesSearch) {
        if (matchesSearch) {
            isExpanded = true
        }
    }

    // Hide if searching and NO match
    if (searchQuery.isNotBlank() && !matchesSearch && !defaultExpanded) {
        return
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .padding(readerPreferences.cardPadding.dp)
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics(mergeDescendants = true) {
                        stateDescription = if (isExpanded) "Expanded" else "Collapsed"
                    }
                    .clickable(
                        role = Role.Button,
                        onClickLabel = if (isExpanded) "Collapse section" else "Expand section"
                    ) {
                        isExpanded = !isExpanded
                        if (isExpanded) onExpanded()
                    }
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .semantics { heading() }
                ) {
                    HighlightText(
                        text = "§ ${section.section}",
                        query = searchQuery,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary
                    )
                    HighlightText(
                        text = section.title,
                        query = searchQuery,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium
                    )
                }

                Icon(
                    imageVector = if (isExpanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (isExpanded) {
                Spacer(modifier = Modifier.height(12.dp))

                studyMarkInput?.let {
                    StudyMarkActions(input = it)
                    Spacer(modifier = Modifier.height(12.dp))
                }

                section.content?.let { content ->
                    HighlightText(
                        text = content,
                        query = searchQuery,
                        style = bodyStyle,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                
                // Subsections
                section.subsections?.forEach { subsection ->
                    Column(
                        modifier = Modifier
                            .padding(top = 12.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                RoundedCornerShape(8.dp)
                            )
                            .padding(12.dp)
                            .fillMaxWidth()
                    ) {
                        Text(
                            text = "${subsection.subsection}. ${subsection.title}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = subsection.content,
                            style = smallStyle,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        
                        // Key Points
                        subsection.keyPoints?.let { points ->
                            if (points.isNotEmpty()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Key Points:",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                points.forEach { point ->
                                    Row(
                                        modifier = Modifier.padding(top = 2.dp),
                                        verticalAlignment = Alignment.Top
                                    ) {
                                        Text("• ", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall)
                                        Text(
                                            text = point,
                                            style = smallStyle
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                if (!section.figures.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    AIMFigures(figures = section.figures)
                }

                if (!section.tables.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    AIMTables(tables = section.tables)
                }

                // Definitions
                if (!section.definitions.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Definitions",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    section.definitions.forEach { def ->
                        Column(
                            modifier = Modifier
                                .padding(top = 8.dp)
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    RoundedCornerShape(8.dp)
                                )
                                .padding(8.dp)
                                .fillMaxWidth()
                        ) {
                            Text(
                                text = def.term,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = def.definition,
                                style = smallStyle,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Key Points
                if (!section.keyPoints.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Key Points",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    section.keyPoints.forEach { point ->
                        Row(
                            modifier = Modifier.padding(top = 4.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Text("• ", fontWeight = FontWeight.Bold)
                            Text(
                                text = point,
                                style = bodyStyle
                            )
                        }
                    }
                }
            }
        }
    }
}
