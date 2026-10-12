package com.faraimpro.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.ui.theme.AviationBlue
import com.faraimpro.app.ui.theme.AviationNavy
import com.faraimpro.app.ui.theme.AviationSky
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val HomeContentMaxWidth = 960.dp

private data class HomeStats(
    val farCount: Int,
    val aimCount: Int,
    val acCount: Int,
    val pcgCount: Int,
    val questionCount: Int,
    val cardCount: Int,
    val studyPathCount: Int
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(navController: NavController, repository: DataRepository) {
    var stats by remember { mutableStateOf<HomeStats?>(null) }
    val contentModifier = Modifier
        .widthIn(max = HomeContentMaxWidth)
        .fillMaxWidth()

    LaunchedEffect(repository) {
        stats = withContext(Dispatchers.IO) {
            HomeStats(
                farCount = repository.getFARParts().size,
                aimCount = repository.getAIMChapters().size,
                acCount = repository.getAdvisoryCirculars().size,
                pcgCount = repository.getPCGTerms().size,
                questionCount = repository.getQuizzes().sumOf { it.questionCount },
                cardCount = repository.getFlashcardDecks().sumOf { it.cardCount },
                studyPathCount = repository.getStudyPaths().size
            )
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(20.dp))

        HomeHeroCard(
            modifier = contentModifier,
            farCount = stats?.farCount,
            acCount = stats?.acCount,
            studyPathCount = stats?.studyPathCount,
            onSearchClick = { navController.navigate("search") },
            onStudyClick = { navController.navigate("study") }
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = contentModifier,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FeaturePill("Offline", Icons.Default.CloudOff, Modifier.weight(1f))
            FeaturePill("No tracking", Icons.Default.Shield, Modifier.weight(1f))
            FeaturePill("Free", Icons.Default.CheckCircle, Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(20.dp))

        Column(modifier = contentModifier) {
            Text(
                text = "OFFLINE & SEARCHABLE",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = "Reference library",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        QuickActionCard(
            title = "Search All References",
            subtitle = "Filter FAR, AIM, PCG, and AC results",
            icon = Icons.Default.Search,
            modifier = contentModifier,
            onClick = { navController.navigate("search") }
        )

        Spacer(modifier = Modifier.height(12.dp))

        QuickActionCard(
            title = "Federal Aviation Regulations",
            subtitle = "Browse FAR Parts",
            icon = Icons.Default.Description,
            modifier = contentModifier,
            onClick = { navController.navigate("far") }
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        QuickActionCard(
            title = "Aeronautical Information Manual",
            subtitle = "Study AIM Chapters",
            icon = Icons.Default.Book,
            modifier = contentModifier,
            onClick = { navController.navigate("aim") }
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        QuickActionCard(
            title = "Pilot/Controller Glossary",
            subtitle = "ATC Terms & Definitions",
            icon = Icons.AutoMirrored.Filled.MenuBook,
            modifier = contentModifier,
            onClick = { navController.navigate("glossary") }
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        QuickActionCard(
            title = "Practice Quizzes",
            subtitle = "Test Your Knowledge",
            icon = Icons.Default.Psychology,
            modifier = contentModifier,
            onClick = { navController.navigate("quizzes") }
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        QuickActionCard(
            title = "Flashcards",
            subtitle = "Learn Key Concepts",
            icon = Icons.Default.Layers,
            modifier = contentModifier,
            onClick = { navController.navigate("flashcards") }
        )

        Spacer(modifier = Modifier.height(12.dp))

        QuickActionCard(
            title = "Advisory Circulars",
            subtitle = stats?.acCount?.let { "$it current FAA guidance records" }
                ?: "Current FAA guidance records",
            icon = Icons.Default.Description,
            modifier = contentModifier,
            onClick = { navController.navigate("advisory_circulars") }
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Stats
        Text(
            text = "What's Included",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = contentModifier
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(
            modifier = contentModifier,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard(stats?.farCount?.toString() ?: "-", "FAR Parts", Modifier.weight(1f))
            StatCard(stats?.aimCount?.toString() ?: "-", "AIM Ch.", Modifier.weight(1f))
            StatCard(stats?.acCount?.toString() ?: "-", "ACs", Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = contentModifier,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard(stats?.pcgCount?.toString() ?: "-", "PCG Terms", Modifier.weight(1f))
            StatCard(stats?.questionCount?.toString() ?: "-", "Questions", Modifier.weight(1f))
            StatCard(stats?.cardCount?.toString() ?: "-", "Cards", Modifier.weight(1f))
        }
        
        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun HomeHeroCard(
    modifier: Modifier,
    farCount: Int?,
    acCount: Int?,
    studyPathCount: Int?,
    onSearchClick: () -> Unit,
    onStudyClick: () -> Unit
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = AviationNavy
        ),
        shape = RoundedCornerShape(24.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(
                    color = Color.White.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.size(52.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Flight,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.padding(12.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "FAR/AIM PRO",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = AviationSky
                    )
                    Text(
                        text = "Free pilot reference, ready offline.",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "FAA references and fast study tools. No signal required.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.72f)
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroMetric(farCount?.toString() ?: "-", "FAR", Modifier.weight(1f))
                HeroMetric(acCount?.toString() ?: "-", "ACs", Modifier.weight(1f))
                HeroMetric(studyPathCount?.toString() ?: "-", "paths", Modifier.weight(1f))
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onSearchClick,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = AviationBlue
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Search")
                }
                OutlinedButton(
                    onClick = onStudyClick,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = Color.White
                    ),
                    border = androidx.compose.foundation.BorderStroke(
                        width = 1.dp,
                        color = Color.White.copy(alpha = 0.65f)
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.School, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Study")
                }
            }
        }
    }
}

@Composable
private fun HeroMetric(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color.White.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.78f)
            )
        }
    }
}

@Composable
private fun FeaturePill(
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(14.dp),
        tonalElevation = 1.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun QuickActionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier
                        .padding(12.dp)
                        .fillMaxSize(),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            
            Spacer(modifier = Modifier.width(16.dp))
            
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
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

@Composable
fun StatCard(value: String, label: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(14.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
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
