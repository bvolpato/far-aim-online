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
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.FARPart
import com.faraimpro.app.data.FARSection
import com.faraimpro.app.data.ReaderPreferences
import com.faraimpro.app.data.ReaderPreferencesManager
import com.faraimpro.app.data.ReadingHistoryManager
import com.faraimpro.app.data.StudyMarkInput
import com.faraimpro.app.data.Subpart
import com.faraimpro.app.ui.components.HighlightText
import com.faraimpro.app.ui.components.ErrorState
import com.faraimpro.app.ui.components.FARFigures
import com.faraimpro.app.ui.components.LoadState
import com.faraimpro.app.ui.components.asLoadState
import com.faraimpro.app.ui.components.ReaderControls
import com.faraimpro.app.ui.components.StudyMarkActions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val ReferenceContentMaxWidth = 960.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FARScreen(
    navController: NavController,
    repository: DataRepository
) {
    var searchQuery by remember { mutableStateOf("") }
    var loadState by remember { mutableStateOf<LoadState<List<FARPart>>>(LoadState.Loading) }
    var retryKey by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val readingHistory = remember { ReadingHistoryManager.getFARReadingHistory(context) }

    LaunchedEffect(repository, retryKey) {
        loadState = LoadState.Loading
        loadState = withContext(Dispatchers.IO) {
            repository.loadFARParts(forceRefresh = retryKey > 0)
                .asLoadState { it.isEmpty() }
        }
    }
    val allParts = (loadState as? LoadState.Loaded)?.value
    
    // Filter logic
    val filteredParts = remember(searchQuery, allParts) {
        val parts = allParts.orEmpty()
        if (searchQuery.isBlank()) {
            parts
        } else {
            val query = searchQuery.lowercase()
            parts.filter { part ->
                // Check Part title/number
                if (part.title.lowercase().contains(query) ||
                    part.part.toString().contains(query)) {
                    return@filter true
                }

                // Check sections content
                val sectionsMatch = part.sections?.any { section ->
                    section.title.lowercase().contains(query) ||
                    section.searchableText.lowercase().contains(query) ||
                    section.section.contains(query)
                } == true

                if (sectionsMatch) return@filter true

                // Check subparts content
                val subpartsMatch = part.subparts?.any { subpart ->
                    subpart.title.lowercase().contains(query) ||
                    subpart.sections.any { section ->
                        section.title.lowercase().contains(query) ||
                        section.searchableText.lowercase().contains(query) ||
                        section.section.contains(query)
                    }
                } == true

                if (subpartsMatch) return@filter true

                part.appendices?.any { appendix ->
                    appendix.appendix.lowercase().contains(query) ||
                    appendix.title.lowercase().contains(query) ||
                    appendix.searchableText.lowercase().contains(query)
                } == true
            }
        }
    }

    Scaffold(
        topBar = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CenterAlignedTopAppBar(
                    title = { Text("FAR") },
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
                        .widthIn(max = ReferenceContentMaxWidth)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search FAR...") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear FAR search")
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
                    .widthIn(max = ReferenceContentMaxWidth)
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
                            title = "FAR failed to load",
                            detail = "Bundled regulations could not be read.",
                            onRetry = { retryKey++ },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(280.dp)
                        )
                    }
                    LoadState.Empty -> item {
                        Text(
                            "No FAR parts are bundled with this version.",
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
                                        val route = "far_part/${history.identifier}" +
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
                                            text = "Part ${history.identifier}: ${history.title}",
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

                    items(filteredParts) { part ->
                        FARPartCard(
                            part = part,
                            searchQuery = searchQuery,
                            onClick = {
                                val query = Uri.encode(searchQuery)
                                val route = "far_part/${part.part}" +
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
fun FARPartCard(
    part: FARPart,
    searchQuery: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                role = Role.Button,
                onClickLabel = "Open FAR Part ${part.part}",
                onClick = onClick
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primary,
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = "Part ${part.part}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                
                if (part.subchapter != null) {
                    Text(
                        text = "Subchapter ${part.subchapter}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            
            HighlightText(
                text = part.title,
                query = searchQuery,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            
            if (part.subchapterTitle != null) {
                Text(
                    text = part.subchapterTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FARPartDetailScreen(
    partId: Int,
    initialQuery: String,
    initialSection: String = "",
    navController: NavController,
    repository: DataRepository
) {
    var retryKey by remember { mutableIntStateOf(0) }
    val partState by produceState<LoadState<FARPart>>(
        initialValue = LoadState.Loading,
        repository,
        partId,
        retryKey
    ) {
        value = LoadState.Loading
        value = withContext(Dispatchers.IO) {
            repository.loadFARParts(forceRefresh = retryKey > 0).fold(
                onSuccess = { parts ->
                    parts.find { it.part == partId }
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

    when (partState) {
        LoadState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return
        }
        is LoadState.Error -> {
            ErrorState(
                title = "Part failed to load",
                detail = "Bundled FAR content could not be read.",
                onRetry = { retryKey++ }
            )
            return
        }
        LoadState.Empty -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Part not found")
            }
            return
        }
        is LoadState.Loaded -> Unit
    }
    val part = (partState as LoadState.Loaded<FARPart>).value
    val listState = rememberLazyListState()

    LaunchedEffect(part, initialSection) {
        var itemIndex = 2
        var targetIndex: Int? = null
        part.sections.orEmpty().forEach { section ->
            if (section.section == initialSection) targetIndex = itemIndex
            itemIndex++
        }
        part.subparts.orEmpty().forEach { subpart ->
            itemIndex++
            subpart.sections.forEach { section ->
                if (section.section == initialSection) targetIndex = itemIndex
                itemIndex++
            }
        }
        part.appendices.orEmpty().forEach { appendix ->
            if (appendix.appendix == initialSection) targetIndex = itemIndex
            itemIndex++
        }
        targetIndex?.let { listState.scrollToItem(it) }
    }
    
    // Save reading history when this screen appears
    LaunchedEffect(part) {
        ReadingHistoryManager.saveFARReadingHistory(context, part.part, part.title)
    }

    Scaffold(
        topBar = {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                TopAppBar(
                    title = { Text("Part ${part.part}") },
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
                        .widthIn(max = ReferenceContentMaxWidth)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search in Part ${part.part}...") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Filled.Close, contentDescription = "Clear part search")
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
                    .widthIn(max = ReferenceContentMaxWidth)
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
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = part.cfr,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = part.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (part.subchapter != null && part.subchapterTitle != null) {
                            Text(
                                text = "Subchapter ${part.subchapter}: ${part.subchapterTitle}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                item {
                    ReaderControls(
                        preferences = readerPreferences,
                        onPreferencesChanged = updateReaderPreferences
                    )
                }

                // Sections stay compact until selected or matched.
                part.sections?.forEach { section ->
                    item {
                        SectionItem(
                            section = section,
                            searchQuery = searchQuery,
                            defaultExpanded = section.section == initialSection,
                            studyMarkInput = StudyMarkInput(
                                type = "far",
                                reference = "§ ${section.section}",
                                title = section.title,
                                route = "far_part/${part.part}?section=${Uri.encode(section.section)}"
                            ),
                            readerPreferences = readerPreferences,
                            onExpanded = {
                                ReadingHistoryManager.saveFARReadingHistory(
                                    context,
                                    part.part,
                                    part.title,
                                    section.section
                                )
                            }
                        )
                    }
                }

                // Subparts
                part.subparts?.forEach { subpart ->
                    item {
                        Text(
                            text = "Subpart ${subpart.subpart} - ${subpart.title}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                    subpart.sections.forEach { section ->
                        item {
                            SectionItem(
                                section = section,
                                searchQuery = searchQuery,
                                defaultExpanded = section.section == initialSection,
                                studyMarkInput = StudyMarkInput(
                                    type = "far",
                                    reference = "§ ${section.section}",
                                    title = section.title,
                                    route = "far_part/${part.part}?section=${Uri.encode(section.section)}"
                                ),
                                readerPreferences = readerPreferences,
                                onExpanded = {
                                    ReadingHistoryManager.saveFARReadingHistory(
                                        context,
                                        part.part,
                                        part.title,
                                        section.section
                                    )
                                }
                            )
                        }
                    }
                }

                if (!part.appendices.isNullOrEmpty()) {
                    item {
                        Text(
                            text = "Appendices",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    part.appendices.forEach { appendix ->
                        item {
                            SectionItem(
                                section = FARSection(
                                    section = appendix.appendix,
                                    title = appendix.title,
                                    content = appendix.content,
                                    figures = appendix.figures
                                ),
                                searchQuery = searchQuery,
                                defaultExpanded = appendix.appendix == initialSection,
                                referenceLabel = appendix.appendix,
                                studyMarkInput = StudyMarkInput(
                                    type = "far",
                                    reference = appendix.appendix,
                                    title = appendix.title,
                                    route = "far_part/${part.part}?section=${Uri.encode(appendix.appendix)}"
                                ),
                                readerPreferences = readerPreferences
                            )
                        }
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
fun SectionItem(
    section: FARSection,
    searchQuery: String,
    defaultExpanded: Boolean = false,
    referenceLabel: String? = null,
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
    val matchesSearch = remember(searchQuery) {
        if (searchQuery.isBlank()) return@remember false
        val text = "${section.section} ${section.title} ${section.searchableText}".lowercase()
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
                        text = referenceLabel ?: "§ ${section.section}",
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

                HighlightText(
                    text = section.content,
                    query = searchQuery,
                    style = bodyStyle,
                    color = MaterialTheme.colorScheme.onSurface
                )

                if (!section.figures.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    FARFigures(figures = section.figures)
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
