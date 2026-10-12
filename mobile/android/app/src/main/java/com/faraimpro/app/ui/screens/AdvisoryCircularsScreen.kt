package com.faraimpro.app.ui.screens

import android.net.Uri
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.faraimpro.app.data.AdvisoryCircular
import com.faraimpro.app.data.AdvisoryCircularContent
import com.faraimpro.app.data.AdvisoryCircularPage
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.StudyMarkInput
import com.faraimpro.app.ui.components.StudyMarkActions
import com.faraimpro.app.ui.components.ErrorState
import com.faraimpro.app.ui.components.LoadState
import com.faraimpro.app.ui.components.LoadingState
import com.faraimpro.app.ui.components.asLoadState
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val AdvisoryCircularsMaxWidth = 960.dp
private val AcNumberTokenPattern = Regex("\\d+|\\D+")

private val advisoryCircularNumberComparator = Comparator<AdvisoryCircular> { left, right ->
    compareAcNumbers(left.number, right.number)
}

private fun compareAcNumbers(left: String, right: String): Int {
    val leftTokens = AcNumberTokenPattern.findAll(left).map { it.value }.toList()
    val rightTokens = AcNumberTokenPattern.findAll(right).map { it.value }.toList()

    for (index in 0 until minOf(leftTokens.size, rightTokens.size)) {
        val leftToken = leftTokens[index]
        val rightToken = rightTokens[index]
        val comparison = if (leftToken.first().isDigit() && rightToken.first().isDigit()) {
            val normalizedLeft = leftToken.trimStart('0').ifEmpty { "0" }
            val normalizedRight = rightToken.trimStart('0').ifEmpty { "0" }
            normalizedLeft.length.compareTo(normalizedRight.length)
                .takeIf { it != 0 }
                ?: normalizedLeft.compareTo(normalizedRight)
        } else {
            leftToken.compareTo(rightToken, ignoreCase = true)
        }

        if (comparison != 0) return comparison
    }

    return leftTokens.size.compareTo(rightTokens.size)
        .takeIf { it != 0 }
        ?: left.compareTo(right, ignoreCase = true)
}

private enum class AdvisoryCircularSort(val label: String) {
    NEWEST("Newest issued"),
    OLDEST("Oldest issued"),
    NUMBER("AC number"),
    TITLE("Title A-Z")
}

private sealed interface AdvisoryCircularContentLoadState {
    data object Loading : AdvisoryCircularContentLoadState
    data object Unavailable : AdvisoryCircularContentLoadState
    data class Loaded(val content: AdvisoryCircularContent) : AdvisoryCircularContentLoadState
    data class Error(val cause: Throwable) : AdvisoryCircularContentLoadState
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdvisoryCircularsScreen(
    repository: DataRepository,
    initialCircularId: String? = null,
    initialQuery: String = ""
) {
    var query by remember(initialQuery) { mutableStateOf(initialQuery) }
    var sort by remember { mutableStateOf(AdvisoryCircularSort.NEWEST) }
    var sortMenuExpanded by remember { mutableStateOf(false) }
    var selectedCircular by remember { mutableStateOf<AdvisoryCircular?>(null) }
    var retryKey by remember { mutableIntStateOf(0) }
    var loadState by remember {
        mutableStateOf<LoadState<List<AdvisoryCircular>>>(LoadState.Loading)
    }
    val advisoryCirculars = (loadState as? LoadState.Loaded)?.value.orEmpty()

    LaunchedEffect(repository, retryKey) {
        loadState = LoadState.Loading
        loadState = withContext(Dispatchers.IO) {
            repository.loadAdvisoryCirculars(forceRefresh = retryKey > 0)
                .asLoadState { it.isEmpty() }
        }
    }
    val filteredCirculars = remember(query, sort, advisoryCirculars) {
        val normalizedQuery = query.trim().lowercase()
        val matches = if (normalizedQuery.isEmpty()) {
            advisoryCirculars
        } else {
            advisoryCirculars.filter { ac ->
                listOf(
                    ac.number,
                    ac.title,
                    ac.summary,
                    ac.category,
                    ac.office,
                    ac.status,
                    ac.replaces.orEmpty(),
                    ac.relatedCfr.joinToString(" "),
                    ac.tags.joinToString(" ")
                ).any { it.lowercase().contains(normalizedQuery) }
            }
        }

        when (sort) {
            AdvisoryCircularSort.NEWEST -> matches.sortedWith(
                compareByDescending<AdvisoryCircular> { it.issued }.thenBy { it.number }
            )
            AdvisoryCircularSort.OLDEST -> matches.sortedWith(
                compareBy<AdvisoryCircular> { it.issued }.thenBy { it.number }
            )
            AdvisoryCircularSort.NUMBER -> matches.sortedWith(advisoryCircularNumberComparator)
            AdvisoryCircularSort.TITLE -> matches.sortedWith(
                compareBy<AdvisoryCircular> { it.title.lowercase() }.thenBy { it.number }
            )
        }
    }

    LaunchedEffect(initialCircularId, advisoryCirculars) {
        if (initialCircularId != null) {
            selectedCircular = advisoryCirculars.firstOrNull { it.id == initialCircularId }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Advisory Circulars") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = AdvisoryCircularsMaxWidth)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Text(
                    text = when (loadState) {
                        LoadState.Loading -> "Loading FAA Advisory Circular records…"
                        is LoadState.Error -> "FAA Advisory Circular records unavailable."
                        LoadState.Empty -> "No FAA Advisory Circular records available."
                        is LoadState.Loaded -> "${advisoryCirculars.size} current FAA Advisory Circular records with official FAA pages and PDF links where published."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Search ACs, forms, records...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear Advisory Circular search")
                            }
                        }
                    },
                    singleLine = true,
                    shape = MaterialTheme.shapes.medium
                )

                Spacer(modifier = Modifier.height(8.dp))

                Box(modifier = Modifier.align(Alignment.End)) {
                    OutlinedButton(onClick = { sortMenuExpanded = true }) {
                        Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(sort.label)
                    }
                    DropdownMenu(
                        expanded = sortMenuExpanded,
                        onDismissRequest = { sortMenuExpanded = false }
                    ) {
                        AdvisoryCircularSort.entries.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.label) },
                                onClick = {
                                    sort = option
                                    sortMenuExpanded = false
                                }
                            )
                        }
                    }
                }
            }

            when (loadState) {
                LoadState.Loading -> LoadingState()
                is LoadState.Error -> ErrorState(
                    title = "Advisory Circulars failed to load",
                    detail = "Bundled FAA guidance records could not be read.",
                    onRetry = { retryKey++ }
                )
                LoadState.Empty -> Box(
                    modifier = Modifier.fillMaxSize().padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No Advisory Circular records are bundled with this version.")
                }
                is LoadState.Loaded -> LazyColumn(
                    modifier = Modifier
                        .widthIn(max = AdvisoryCircularsMaxWidth)
                        .fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (filteredCirculars.isEmpty()) {
                        item {
                            Text(
                                "No Advisory Circulars match \"$query\".",
                                modifier = Modifier.padding(24.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    items(filteredCirculars) { ac ->
                        AdvisoryCircularCard(ac, onRead = { selectedCircular = ac })
                    }
                }
            }
        }
    }

    selectedCircular?.let { ac ->
        AdvisoryCircularReaderDialog(
            advisoryCircular = ac,
            repository = repository,
            initialQuery = query,
            onDismiss = { selectedCircular = null }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AdvisoryCircularCard(ac: AdvisoryCircular, onRead: () -> Unit) {
    val uriHandler = LocalUriHandler.current

    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = "AC ${ac.number}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
                MetadataPill(ac.status)
                Text(
                    text = ac.issued,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Text(
                text = ac.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (ac.contentPath != null) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                modifier = Modifier.clickable(
                    enabled = ac.contentPath != null,
                    role = Role.Button,
                    onClickLabel = "Read AC ${ac.number}",
                    onClick = onRead
                )
            )

            Text(
                text = "${ac.category} · ${ac.office}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(
                text = ac.summary,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            StudyMarkActions(
                input = StudyMarkInput(
                    type = "ac",
                    reference = "AC ${ac.number}",
                    title = ac.title,
                    route = "advisory_circulars/${Uri.encode(ac.id)}"
                )
            )

            if (ac.relatedCfr.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    ac.relatedCfr.forEach { reference ->
                        MetadataPill(reference)
                    }
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(onClick = { uriHandler.openUri(ac.documentUrl) }) {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("FAA page")
                }
                ac.pdfUrl?.let { pdfUrl ->
                    OutlinedButton(onClick = { uriHandler.openUri(pdfUrl) }) {
                        Icon(Icons.Default.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("PDF")
                    }
                }
            }
        }
    }
}

@Composable
private fun MetadataPill(label: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AdvisoryCircularReaderDialog(
    advisoryCircular: AdvisoryCircular,
    repository: DataRepository,
    initialQuery: String,
    onDismiss: () -> Unit
) {
    var query by remember(advisoryCircular.id, initialQuery) { mutableStateOf(initialQuery) }
    var retryKey by remember(advisoryCircular.id) { mutableIntStateOf(0) }
    val loadState by produceState<AdvisoryCircularContentLoadState>(
        AdvisoryCircularContentLoadState.Loading,
        advisoryCircular.id,
        retryKey
    ) {
        value = AdvisoryCircularContentLoadState.Loading
        value = withContext(Dispatchers.IO) {
            repository.loadAdvisoryCircularContent(advisoryCircular).fold(
                onSuccess = { content ->
                    if (content == null || content.pages.isEmpty()) {
                        AdvisoryCircularContentLoadState.Unavailable
                    } else {
                        AdvisoryCircularContentLoadState.Loaded(content)
                    }
                },
                onFailure = { AdvisoryCircularContentLoadState.Error(it) }
            )
        }
    }
    val content = (loadState as? AdvisoryCircularContentLoadState.Loaded)?.content
    val pages = remember(content, query) {
        val normalizedQuery = query.trim().lowercase()
        if (normalizedQuery.isEmpty()) {
            content?.pages.orEmpty()
        } else {
            content?.pages.orEmpty().filter { it.text.lowercase().contains(normalizedQuery) }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column {
                TopAppBar(
                    title = {
                        Column {
                            Text("AC ${advisoryCircular.number}", maxLines = 1)
                            Text(
                                advisoryCircular.title,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Close reader")
                        }
                    }
                )

                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear document search")
                            }
                        }
                    },
                    placeholder = { Text("Find in this Advisory Circular") },
                    singleLine = true
                )

                when (loadState) {
                    AdvisoryCircularContentLoadState.Loading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }

                    AdvisoryCircularContentLoadState.Unavailable -> {
                        Box(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Offline text unavailable. Use official FAA PDF for this document.",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    is AdvisoryCircularContentLoadState.Error -> {
                        ErrorState(
                            title = "Document failed to load",
                            detail = "Offline Advisory Circular text could not be read.",
                            onRetry = { retryKey++ }
                        )
                    }

                    is AdvisoryCircularContentLoadState.Loaded -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(24.dp)
                        ) {
                            item {
                                Text(
                                    if (query.isEmpty()) {
                                        if (content!!.status == "partial") {
                                            "${content.extractedPageCount ?: content.pages.size} of ${content.pageCount} pages extracted · ${content.wordCount} words"
                                        } else {
                                            "${content.pageCount} pages · ${content.wordCount} words"
                                        }
                                    } else {
                                        "${pages.size} matching pages"
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            if (content!!.status == "partial") {
                                item {
                                    Text(
                                        "Extracted text is incomplete. Use official FAA PDF for omitted pages, figures, tables, and source formatting.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                            if (pages.isEmpty()) {
                                item {
                                    Text(
                                        "No pages match \"$query\".",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            items(pages, key = { it.page }) { page ->
                                AdvisoryCircularPageItem(
                                    page = page,
                                    defaultExpanded = query.isNotBlank() || page.page == pages.firstOrNull()?.page
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AdvisoryCircularPageItem(
    page: AdvisoryCircularPage,
    defaultExpanded: Boolean
) {
    var isExpanded by remember(page.page, defaultExpanded) { mutableStateOf(defaultExpanded) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics(mergeDescendants = true) {
                        stateDescription = if (isExpanded) "Expanded" else "Collapsed"
                    }
                    .clickable(
                        role = Role.Button,
                        onClickLabel = if (isExpanded) "Collapse page" else "Expand page"
                    ) { isExpanded = !isExpanded },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Page ${page.page}",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { heading() }
                )
                Icon(
                    imageVector = if (isExpanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (isExpanded) {
                SelectionContainer {
                    Text(page.text, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}
