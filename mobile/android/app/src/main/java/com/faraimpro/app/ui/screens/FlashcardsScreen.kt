package com.faraimpro.app.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.FlashcardDeck
import com.faraimpro.app.data.Flashcard
import com.faraimpro.app.ui.components.ErrorState
import com.faraimpro.app.ui.components.LoadState
import com.faraimpro.app.ui.components.LoadingState
import com.faraimpro.app.ui.components.asLoadState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlashcardsScreen(navController: NavController, repository: DataRepository) {
    var retryKey by remember { mutableIntStateOf(0) }
    var loadState by remember {
        mutableStateOf<LoadState<List<FlashcardDeck>>>(LoadState.Loading)
    }
    LaunchedEffect(repository, retryKey) {
        loadState = LoadState.Loading
        loadState = withContext(Dispatchers.IO) {
            repository.loadFlashcardDecks(forceRefresh = retryKey > 0)
                .asLoadState { it.isEmpty() }
        }
    }
    val decks = (loadState as? LoadState.Loaded)?.value.orEmpty()
    val aimDecks = remember(decks) {
        decks.filter { it.category == "AIM" }.sortedBy { it.chapter ?: 0 }
    }
    val farDecks = remember(decks) {
        decks.filter { it.category == "FAR" }.sortedBy { it.title }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Flashcards") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        when (loadState) {
            LoadState.Loading -> LoadingState(modifier = Modifier.padding(padding))
            is LoadState.Error -> ErrorState(
                title = "Flashcards failed to load",
                detail = "Bundled flashcard decks could not be read.",
                onRetry = { retryKey++ },
                modifier = Modifier.padding(padding)
            )
            LoadState.Empty -> Box(
                modifier = Modifier.fillMaxSize().padding(padding).padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("No flashcard decks are bundled with this version.")
            }
            is LoadState.Loaded -> LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
            item {
                StudyLibraryHeader(
                    eyebrow = "ACTIVE RECALL",
                    title = "Flashcard decks",
                    detail = "${(farDecks + aimDecks).sumOf { it.cardCount }} cards across ${farDecks.size + aimDecks.size} decks",
                    icon = Icons.Default.Layers
                )
            }

            if (farDecks.isNotEmpty()) {
                item {
                    Text(
                        text = "FAR Flashcards",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
                    )
                }
                items(farDecks) { deck ->
                    FlashcardDeckCard(deck) { navController.navigate("flashcard_deck/${deck.id}") }
                }
            }
            
            if (aimDecks.isNotEmpty()) {
                item {
                    Text(
                        text = "AIM Flashcards",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
                    )
                }
                items(aimDecks) { deck ->
                    FlashcardDeckCard(deck) { navController.navigate("flashcard_deck/${deck.id}") }
                }
            }
            
            }
        }
    }
}

@Composable
fun FlashcardDeckCard(deck: FlashcardDeck, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = MaterialTheme.shapes.small
            ) {
                Text(
                    text = deck.category,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = deck.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            
            Text(
                text = deck.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.Layers,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "${deck.cardCount} cards",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlashcardDeckScreen(deckId: String, repository: DataRepository, navController: NavController) {
    var retryKey by remember { mutableIntStateOf(0) }
    val deckState by produceState<LoadState<FlashcardDeck>>(
        initialValue = LoadState.Loading,
        repository,
        deckId,
        retryKey
    ) {
        value = LoadState.Loading
        value = withContext(Dispatchers.IO) {
            repository.loadFlashcardDecks(forceRefresh = retryKey > 0).fold(
                onSuccess = { decks ->
                    decks.find { it.id == deckId }
                        ?.let { LoadState.Loaded(it) }
                        ?: LoadState.Empty
                },
                onFailure = { LoadState.Error(it) }
            )
        }
    }

    when (deckState) {
        LoadState.Loading -> {
            LoadingState()
            return
        }
        is LoadState.Error -> {
            ErrorState(
                title = "Flashcard deck failed to load",
                detail = "Bundled flashcard data could not be read.",
                onRetry = { retryKey++ }
            )
            return
        }
        LoadState.Empty -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Flashcard deck not found")
            }
            return
        }
        is LoadState.Loaded -> Unit
    }
    val deck = (deckState as LoadState.Loaded<FlashcardDeck>).value
    if (deck.cards.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Flashcard deck is empty")
        }
        return
    }

    var session by remember(deck.id) { mutableStateOf(FlashcardSessionState.from(deck.cards)) }
    var isFlipped by remember { mutableStateOf(false) }
    val currentCard = session.currentCard.flashcard
    val rotation by animateFloatAsState(
        targetValue = if (isFlipped) 180f else 0f,
        animationSpec = tween(400),
        label = "rotation"
    )
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(deck.title) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (session.isComplete) {
            FlashcardCompletionSummary(
                session = session,
                onRestart = {
                    session = session.restart()
                    isFlipped = false
                },
                onReshuffle = {
                    session = session.reshuffle()
                    isFlipped = false
                },
                modifier = Modifier.padding(padding)
            )
        } else {
            Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Progress
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Card ${session.currentIndex + 1} of ${session.cards.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Known ${session.knownCount}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Learning ${session.learningCount}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                LinearProgressIndicator(
                    progress = { session.completedCount.toFloat() / session.cards.size },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            
            Spacer(modifier = Modifier.weight(1f))
            
            // Flashcard
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp)
                    .padding(horizontal = 16.dp)
                    .graphicsLayer {
                        rotationY = rotation
                        cameraDistance = 12f * density
                    }
                    .semantics(mergeDescendants = true) {
                        stateDescription = if (isFlipped) "Definition shown" else "Term shown"
                    }
                    .clickable(
                        role = Role.Button,
                        onClickLabel = if (isFlipped) "Show term" else "Show definition"
                    ) { isFlipped = !isFlipped },
                colors = CardDefaults.cardColors(
                    containerColor = if (rotation <= 90f)
                        MaterialTheme.colorScheme.surfaceVariant
                    else
                        MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .graphicsLayer {
                            if (rotation > 90f) {
                                rotationY = 180f
                            }
                        }
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = if (rotation <= 90f) "TERM" else "DEFINITION",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        Text(
                            text = if (rotation <= 90f) currentCard.front else currentCard.back,
                            style = if (rotation <= 90f)
                                MaterialTheme.typography.headlineSmall
                            else
                                MaterialTheme.typography.bodyLarge,
                            fontWeight = if (rotation <= 90f) FontWeight.Bold else FontWeight.Normal,
                            textAlign = TextAlign.Center
                        )
                        
                        if (rotation > 90f) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = currentCard.reference,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))
            
            // Actions
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = {
                        session = session.rateCurrent(RecallRating.LEARNING)
                        isFlipped = false
                    },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Icon(Icons.Default.Close, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Still Learning")
                }
                
                Button(
                    onClick = {
                        session = session.rateCurrent(RecallRating.KNOWN)
                        isFlipped = false
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Got It!")
                }
            }
            
            // Navigation
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                IconButton(
                    onClick = {
                        if (session.currentIndex > 0) {
                            session = session.moveTo(session.currentIndex - 1)
                            isFlipped = false
                        }
                    },
                    enabled = session.currentIndex > 0
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Previous card")
                }
                
                IconButton(onClick = {
                    session = session.reshuffle()
                    isFlipped = false
                }) {
                    Icon(Icons.Default.Shuffle, contentDescription = "Shuffle and restart deck")
                }
                
                IconButton(onClick = {
                    session = session.restart()
                    isFlipped = false
                }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Restart deck")
                }
                
                IconButton(
                    onClick = {
                        if (session.currentIndex < session.cards.size - 1) {
                            session = session.moveTo(session.currentIndex + 1)
                            isFlipped = false
                        }
                    },
                    enabled = session.currentIndex < session.cards.size - 1
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Next card")
                }
            }
        }
        }
    }
}

@Composable
private fun FlashcardCompletionSummary(
    session: FlashcardSessionState,
    onRestart: () -> Unit,
    onReshuffle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val accuracy = (session.knownCount * 100) / session.cards.size

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        contentAlignment = Alignment.Center
    ) {
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(56.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Text(
                    "Deck complete",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "You reviewed ${session.completedCount} cards.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    SummaryMetric("${session.knownCount}", "Known", Modifier.weight(1f))
                    SummaryMetric("${session.learningCount}", "Learning", Modifier.weight(1f))
                    SummaryMetric("$accuracy%", "Recall", Modifier.weight(1f))
                }
                Button(onClick = onRestart, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Text("Restart deck", modifier = Modifier.padding(start = 8.dp))
                }
                OutlinedButton(onClick = onReshuffle, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Shuffle, contentDescription = null)
                    Text("Reshuffle and restart", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun SummaryMetric(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}
