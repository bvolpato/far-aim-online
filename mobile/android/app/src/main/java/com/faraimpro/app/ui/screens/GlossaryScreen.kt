package com.faraimpro.app.ui.screens

import android.net.Uri
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.PCGTerm
import com.faraimpro.app.data.SearchHistoryManager
import com.faraimpro.app.ui.components.HighlightText
import com.faraimpro.app.ui.components.ErrorState
import com.faraimpro.app.ui.components.LoadState
import com.faraimpro.app.ui.components.asLoadState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private val ReferenceScreenMaxWidth = 960.dp
private val glossarySeePattern = Regex(
    """\((See(?:\s+also)?)(\s+ICAO\s+term)?\s+((?:[^()]|\([^()]*\))+?)\.?\)""",
    RegexOption.IGNORE_CASE
)

private fun normalizeGlossaryTerm(value: String): String = value
    .replace('_', ' ')
    .replace(Regex("\\s+"), " ")
    .trim()
    .uppercase()

internal fun resolveGlossaryReference(
    terms: List<PCGTerm>,
    reference: String,
    isIcaoTerm: Boolean = false
): PCGTerm? {
    val normalizedReference = normalizeGlossaryTerm(reference)
    val expectedIcao = "$normalizedReference [ICAO]"
    return terms.firstOrNull { term ->
        val normalizedTerm = normalizeGlossaryTerm(term.term)
        if (isIcaoTerm) {
            normalizedTerm == expectedIcao || normalizedTerm.startsWith(expectedIcao)
        } else {
            normalizedTerm == normalizedReference || normalizedTerm.startsWith(normalizedReference)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlossaryScreen(
    repository: DataRepository,
    initialQuery: String = "",
    initialTerm: String = ""
) {
    var searchQuery by remember(initialQuery) { mutableStateOf(initialQuery) }
    var focusedTerm by remember(initialTerm) { mutableStateOf(initialTerm) }
    var loadState by remember { mutableStateOf<LoadState<List<PCGTerm>>>(LoadState.Loading) }
    var retryKey by remember { mutableIntStateOf(0) }
    val listState = rememberLazyListState()
    val allTerms = (loadState as? LoadState.Loaded)?.value
    val terms = remember(searchQuery, allTerms, focusedTerm) {
        val glossaryTerms = allTerms ?: emptyList()
        if (searchQuery.isBlank()) {
            glossaryTerms
        } else {
            val lowercased = searchQuery.lowercase()
            glossaryTerms.filter {
                it.term.equals(focusedTerm, ignoreCase = true) ||
                    it.term.lowercase().contains(lowercased) ||
                    it.definition.lowercase().contains(lowercased)
            }
        }
    }

    LaunchedEffect(repository, retryKey) {
        loadState = LoadState.Loading
        loadState = withContext(Dispatchers.IO) {
            repository.loadPCGTerms(forceRefresh = retryKey > 0)
                .asLoadState { it.isEmpty() }
        }
    }

    LaunchedEffect(terms, focusedTerm) {
        if (focusedTerm.isNotBlank()) {
            terms.indexOfFirst { it.term.equals(focusedTerm, ignoreCase = true) }
                .takeIf { it >= 0 }
                ?.let { listState.scrollToItem(it) }
        }
    }
    
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp
        ) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.TopCenter
            ) {
                Column(
                    modifier = Modifier
                        .widthIn(max = ReferenceScreenMaxWidth)
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Text(
                        text = "Pilot/Controller Glossary",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Official ATC terms and definitions",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier
                .widthIn(max = ReferenceScreenMaxWidth)
                .fillMaxWidth()
                .padding(16.dp),
            placeholder = { Text("Search glossary terms...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear glossary search")
                    }
                }
            },
            singleLine = true,
            shape = MaterialTheme.shapes.medium
        )
        
        if (loadState == LoadState.Loading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (loadState is LoadState.Loaded) {
            Text(
                text = "${terms.size} terms",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .widthIn(max = ReferenceScreenMaxWidth)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            )
        }

        if (loadState is LoadState.Error) {
            ErrorState(
                title = "Glossary failed to load",
                detail = "Bundled Pilot/Controller Glossary data could not be read.",
                onRetry = { retryKey++ }
            )
        } else if (loadState == LoadState.Empty) {
            Box(
                modifier = Modifier.fillMaxSize().padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("No glossary terms are bundled with this version.")
            }
        } else if (loadState is LoadState.Loaded && terms.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.SearchOff,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "No terms found for \"$searchQuery\"",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else if (loadState is LoadState.Loaded) {
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .widthIn(max = ReferenceScreenMaxWidth)
                    .fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                itemsIndexed(
                    terms,
                    key = { index, term -> "${term.term}:${term.definition.hashCode()}:$index" }
                ) { _, term ->
                    GlossaryTermCard(
                        term = term,
                        allTerms = allTerms.orEmpty(),
                        searchQuery = searchQuery,
                        initiallyExpanded = term.term.equals(focusedTerm, ignoreCase = true),
                        onReferenceClick = { target ->
                            searchQuery = ""
                            focusedTerm = target
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun GlossaryTermCard(
    term: PCGTerm,
    allTerms: List<PCGTerm>,
    searchQuery: String,
    initiallyExpanded: Boolean = false,
    onReferenceClick: (String) -> Unit = {}
) {
    var isExpanded by remember(term.term, initiallyExpanded) { mutableStateOf(initiallyExpanded) }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
            .semantics(mergeDescendants = true) {
                stateDescription = if (isExpanded) "Expanded" else "Collapsed"
            }
            .clickable(
                role = Role.Button,
                onClickLabel = if (isExpanded) "Collapse definition" else "Expand definition"
            ) { isExpanded = !isExpanded }
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                HighlightText(
                    text = term.term,
                    query = searchQuery,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold
                    ),
                    modifier = Modifier.weight(1f)
                        .semantics { heading() }
                )
                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            if (isExpanded) {
                Spacer(modifier = Modifier.height(12.dp))
                GlossaryDefinitionText(
                    definition = term.definition,
                    terms = allTerms,
                    query = searchQuery,
                    onReferenceClick = onReferenceClick
                )
            }
        }
    }
}

@Composable
private fun GlossaryDefinitionText(
    definition: String,
    terms: List<PCGTerm>,
    query: String,
    onReferenceClick: (String) -> Unit
) {
    val linkColor = MaterialTheme.colorScheme.primary
    val highlightColor = MaterialTheme.colorScheme.tertiaryContainer
    val annotated = remember(definition, terms, query, linkColor, highlightColor) {
        buildAnnotatedString {
            fun appendHighlighted(value: String) {
                if (query.isBlank()) {
                    append(value)
                    return
                }
                var offset = 0
                Regex(Regex.escape(query), RegexOption.IGNORE_CASE).findAll(value).forEach { match ->
                    append(value.substring(offset, match.range.first))
                    withStyle(SpanStyle(background = highlightColor)) {
                        append(match.value)
                    }
                    offset = match.range.last + 1
                }
                append(value.substring(offset))
            }

            var offset = 0
            glossarySeePattern.findAll(definition).forEach { match ->
                appendHighlighted(definition.substring(offset, match.range.first))
                val seeType = match.groupValues[1]
                val isIcaoTerm = match.groupValues[2].isNotBlank()
                val reference = match.groupValues[3].trim().removeSuffix(".")
                val target = resolveGlossaryReference(terms, reference, isIcaoTerm)
                append("($seeType${if (isIcaoTerm) " ICAO term " else " "}")
                if (target == null) {
                    appendHighlighted(reference)
                } else {
                    withLink(
                        LinkAnnotation.Clickable(
                            tag = target.term,
                            styles = TextLinkStyles(
                                style = SpanStyle(
                                    color = linkColor,
                                    textDecoration = TextDecoration.Underline
                                )
                            ),
                            linkInteractionListener = { onReferenceClick(target.term) }
                        )
                    ) {
                        appendHighlighted(reference)
                    }
                }
                append(".)")
                offset = match.range.last + 1
            }
            appendHighlighted(definition.substring(offset))
        }
    }

    Text(
        text = annotated,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

// Search Screen
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    repository: DataRepository,
    navController: androidx.navigation.NavController? = null
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    var searchQuery by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf("all") }
    var allResults by remember { mutableStateOf(emptyList<com.faraimpro.app.data.SearchResult>()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchError by remember { mutableStateOf<Throwable?>(null) }
    var retryKey by remember { mutableIntStateOf(0) }
    var recentSearches by remember { mutableStateOf(SearchHistoryManager.getSearchHistory(context)) }

    fun recordSearch() {
        if (searchQuery.trim().length >= 2) {
            recentSearches = SearchHistoryManager.recordSearch(context, searchQuery)
        }
    }

    LaunchedEffect(searchQuery, repository, retryKey) {
        if (searchQuery.length < 2) {
            allResults = emptyList()
            isSearching = false
            searchError = null
        } else {
            isSearching = true
            searchError = null
            delay(250)
            withContext(Dispatchers.Default) {
                runCatching { repository.search(searchQuery) }
            }.fold(
                onSuccess = { allResults = it },
                onFailure = {
                    allResults = emptyList()
                    searchError = it
                }
            )
            isSearching = false
        }
    }
    val resultTypes = remember(allResults) {
        listOf(
            "all" to "All",
            "far" to "FAR",
            "aim" to "AIM",
            "pcg" to "Glossary",
            "ac" to "ACs",
            "flashcard" to "Flashcards"
        ).filter { (type, _) -> type == "all" || allResults.any { it.type == type } }
    }
    val results = remember(allResults, selectedType) {
        if (selectedType == "all") allResults else allResults.filter { it.type == selectedType }
    }

    LaunchedEffect(searchQuery, resultTypes) {
        if (resultTypes.none { it.first == selectedType }) {
            selectedType = "all"
        }
    }
    
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primary,
            tonalElevation = 2.dp
        ) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.TopCenter
            ) {
                Column(
                    modifier = Modifier
                        .widthIn(max = ReferenceScreenMaxWidth)
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Text(
                        text = "Search",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Filter FAR, AIM, Glossary, Advisory Circulars, and flashcards",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f)
                    )
                }
            }
        }
        
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier
                .widthIn(max = ReferenceScreenMaxWidth)
                .fillMaxWidth()
                .padding(16.dp),
            placeholder = { Text("Search references and study cards...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear reference search")
                    }
                }
            },
            singleLine = true,
            shape = MaterialTheme.shapes.medium,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(
                onSearch = {
                    recordSearch()
                    focusManager.clearFocus()
                }
            )
        )

        if (searchQuery.length >= 2 && allResults.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .widthIn(max = ReferenceScreenMaxWidth)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                resultTypes.forEach { (type, label) ->
                    val count = if (type == "all") allResults.size else allResults.count { it.type == type }
                    FilterChip(
                        selected = selectedType == type,
                        onClick = { selectedType = type },
                        label = { Text("$label $count") },
                        leadingIcon = if (selectedType == type) {
                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        } else {
                            null
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
        }
        
        // Results
        when {
            searchQuery.length < 2 -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Enter at least 2 characters to search",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (recentSearches.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(20.dp))
                            Text(
                                text = "Recent searches",
                                style = MaterialTheme.typography.titleSmall
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                recentSearches.forEach { query ->
                                    AssistChip(
                                        onClick = { searchQuery = query },
                                        label = { Text(query) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
            isSearching -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            searchError != null -> {
                ErrorState(
                    title = "Search failed",
                    detail = "Bundled reference catalogs could not be searched.",
                    onRetry = { retryKey++ }
                )
            }
            results.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.SearchOff,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No results found for \"$searchQuery\"",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            else -> {
                Text(
                    text = if (selectedType == "all") "${results.size} results" else "${results.size} filtered results",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .widthIn(max = ReferenceScreenMaxWidth)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
                
                LazyColumn(
                    modifier = Modifier
                        .widthIn(max = ReferenceScreenMaxWidth)
                        .fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(results) { result ->
                        SearchResultCard(
                            result = result, 
                            searchQuery = searchQuery,
                            onClick = {
                                recordSearch()
                                navController?.let { nav ->
                                    // Navigate based on result type
                                    when (result.type) {
                                        "far" -> {
                                            // Parse link like "far/61#61.1"
                                            val parts = result.link.split("/", "#")
                                            if (parts.size >= 2) {
                                                val partId = parts[1].toIntOrNull() ?: return@let
                                                val section = Uri.encode(parts.getOrNull(2).orEmpty())
                                                nav.navigate(
                                                    "far_part/$partId?query=${Uri.encode(searchQuery)}&section=$section"
                                                )
                                            }
                                        }
                                        "aim" -> {
                                            // Parse link like "aim/1#1-1-1"
                                            val parts = result.link.split("/", "#")
                                            if (parts.size >= 2) {
                                                val chapterId = parts[1].toIntOrNull() ?: return@let
                                                val section = Uri.encode(parts.getOrNull(2).orEmpty())
                                                nav.navigate(
                                                    "aim_chapter/$chapterId?query=${Uri.encode(searchQuery)}&section=$section"
                                                )
                                            }
                                        }
                                        "pcg" -> {
                                            val term = result.link.substringAfter("#", result.title)
                                            nav.navigate(
                                                "glossary?query=${Uri.encode(searchQuery)}&term=${Uri.encode(term)}"
                                            )
                                        }
                                        "ac" -> {
                                            val circularId = result.link.substringAfter("#", "")
                                            if (circularId.isBlank()) {
                                                nav.navigate("advisory_circulars?query=${Uri.encode(searchQuery)}")
                                            } else {
                                                nav.navigate(
                                                    "advisory_circulars/${Uri.encode(circularId)}" +
                                                        "?query=${Uri.encode(searchQuery)}"
                                                )
                                            }
                                        }
                                        "flashcard" -> nav.navigate(result.link)
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SearchResultCard(
    result: com.faraimpro.app.data.SearchResult,
    searchQuery: String,
    onClick: () -> Unit = {}
) {
    val (typeColor, typeLabel) = when (result.type) {
        "far" -> Pair(MaterialTheme.colorScheme.primary, "FAR")
        "aim" -> Pair(MaterialTheme.colorScheme.tertiary, "AIM")
        "pcg" -> Pair(MaterialTheme.colorScheme.secondary, "PCG")
        "ac" -> Pair(MaterialTheme.colorScheme.primary, "AC")
        "flashcard" -> Pair(MaterialTheme.colorScheme.secondary, "CARD")
        else -> Pair(MaterialTheme.colorScheme.onSurface, result.type.uppercase())
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                role = Role.Button,
                onClickLabel = "Open ${result.title}",
                onClick = onClick
            )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    color = typeColor,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = typeLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
                Text(
                    text = result.reference,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                Spacer(modifier = Modifier.weight(1f))
                
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp)
                )
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            HighlightText(
                text = result.title,
                query = searchQuery,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
            )
            
            Spacer(modifier = Modifier.height(4.dp))
            
            HighlightText(
                text = result.content,
                query = searchQuery,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2
            )
        }
    }
}
