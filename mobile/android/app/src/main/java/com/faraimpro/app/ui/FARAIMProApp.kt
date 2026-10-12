package com.faraimpro.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.ui.screens.*

sealed class Screen(val route: String, val title: String, val icon: @Composable () -> Unit) {
    object Home : Screen("home", "Home", { Icon(Icons.Default.Home, contentDescription = null) })
    object FAR : Screen("far", "FAR", { Icon(Icons.Default.Description, contentDescription = null) })
    object AIM : Screen("aim", "AIM", { Icon(Icons.Default.Book, contentDescription = null) })
    object Study : Screen("study", "Study", { Icon(Icons.Default.School, contentDescription = null) })
    object AdvisoryCirculars : Screen("advisory_circulars", "ACs", { Icon(Icons.Default.Description, contentDescription = null) })
    object Updates : Screen("updates", "Updates", { Icon(Icons.Default.Refresh, contentDescription = null) })
    object Glossary : Screen("glossary", "Glossary", { Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null) })
    object Search : Screen("search", "Search", { Icon(Icons.Default.Search, contentDescription = null) })
    object More : Screen("more", "More", { Icon(Icons.Default.MoreHoriz, contentDescription = null) })
}

// Phone navigation items (5 items max with More for overflow)
val phoneNavItems = listOf(
    Screen.Home,
    Screen.FAR,
    Screen.AIM,
    Screen.Study,
    Screen.More
)

// Tablet navigation items
val tabletNavItems = listOf(
    Screen.Home,
    Screen.FAR,
    Screen.AIM,
    Screen.Study,
    Screen.AdvisoryCirculars,
    Screen.Glossary,
    Screen.Search,
    Screen.More
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FARAIMProApp(initialRoute: String = Screen.Home.route) {
    val navController = rememberNavController()
    val context = LocalContext.current
    val windowInfo = LocalWindowInfo.current
    val density = LocalDensity.current
    val initialRootRoute = remember(initialRoute) {
        when {
            initialRoute in setOf(
                Screen.Home.route,
                Screen.FAR.route,
                Screen.AIM.route,
                Screen.Study.route,
                Screen.AdvisoryCirculars.route,
                Screen.Updates.route,
                Screen.Glossary.route,
                Screen.Search.route,
                Screen.More.route,
                "quizzes",
                "flashcards"
            ) -> initialRoute
            initialRoute.startsWith("far_part/") -> initialRoute
            initialRoute.startsWith("aim_chapter/") -> initialRoute
            initialRoute.startsWith("advisory_circulars/") -> initialRoute
            initialRoute.startsWith("quiz/") -> initialRoute
            initialRoute.startsWith("flashcard_deck/") -> initialRoute
            else -> Screen.Home.route
        }
    }
    
    // Create repository with context
    val repository = remember { DataRepository(context) }
    
    // Determine if we're on a tablet (width >= 600dp is typically tablet)
    val isTablet = with(density) { windowInfo.containerSize.width.toDp() >= 600.dp }
    val navItems = if (isTablet) tabletNavItems else phoneNavItems

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp
            ) {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                
                navItems.forEach { screen ->
                    val isSelected = currentDestination?.hierarchy?.any { 
                        it.route == screen.route || it.route?.startsWith(screen.route) == true 
                    } == true
                    
                    NavigationBarItem(
                        icon = screen.icon,
                        label = { Text(screen.title) },
                        selected = isSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        onClick = {
                            if (isSelected) {
                                val alreadyAtRoot = currentDestination.route == screen.route
                                val popped = navController.popBackStack(screen.route, inclusive = false)
                                if (!alreadyAtRoot && !popped) {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            inclusive = true
                                        }
                                        launchSingleTop = true
                                    }
                                }
                            } else {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = false
                                    }
                                    launchSingleTop = true
                                    restoreState = false
                                }
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = initialRootRoute,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) { HomeScreen(navController, repository) }
            composable(Screen.FAR.route) { FARScreen(navController, repository) }
            composable(Screen.AIM.route) { AIMScreen(navController, repository) }
            composable(Screen.Study.route) { StudyScreen(navController, repository) }
            composable(
                route = "advisory_circulars?query={query}",
                arguments = listOf(navArgument("query") {
                    type = NavType.StringType
                    defaultValue = ""
                })
            ) { backStackEntry ->
                AdvisoryCircularsScreen(
                    repository = repository,
                    initialQuery = backStackEntry.arguments?.getString("query").orEmpty()
                )
            }
            composable(
                route = "advisory_circulars/{acId}?query={query}",
                arguments = listOf(
                    navArgument("acId") { type = NavType.StringType },
                    navArgument("query") {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                )
            ) { backStackEntry ->
                AdvisoryCircularsScreen(
                    repository = repository,
                    initialCircularId = backStackEntry.arguments?.getString("acId"),
                    initialQuery = backStackEntry.arguments?.getString("query").orEmpty()
                )
            }
            composable(Screen.Updates.route) { UpdatesScreen(repository, navController) }
            composable(Screen.More.route) { MoreScreen(navController) }
            composable(
                route = "glossary?query={query}&term={term}",
                arguments = listOf(
                    navArgument("query") {
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument("term") {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                )
            ) { backStackEntry ->
                GlossaryScreen(
                    repository = repository,
                    initialQuery = backStackEntry.arguments?.getString("query").orEmpty(),
                    initialTerm = backStackEntry.arguments?.getString("term").orEmpty()
                )
            }
            composable(Screen.Search.route) { SearchScreen(repository, navController) }
            
            // FAR Part Detail route
            composable(
                route = "far_part/{partId}?query={query}&section={section}",
                arguments = listOf(
                    navArgument("partId") { type = NavType.IntType },
                    navArgument("query") { 
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument("section") {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                )
            ) { backStackEntry ->
                val partId = backStackEntry.arguments?.getInt("partId") ?: 1
                val query = backStackEntry.arguments?.getString("query") ?: ""
                FARPartDetailScreen(
                    partId = partId,
                    initialQuery = query,
                    initialSection = backStackEntry.arguments?.getString("section").orEmpty(),
                    navController = navController,
                    repository = repository
                )
            }
            
            // AIM Chapter Detail route
            composable(
                route = "aim_chapter/{chapterId}?query={query}&section={section}",
                arguments = listOf(
                    navArgument("chapterId") { type = NavType.IntType },
                    navArgument("query") { 
                        type = NavType.StringType
                        defaultValue = ""
                    },
                    navArgument("section") {
                        type = NavType.StringType
                        defaultValue = ""
                    }
                )
            ) { backStackEntry ->
                val chapterId = backStackEntry.arguments?.getInt("chapterId") ?: 1
                val query = backStackEntry.arguments?.getString("query") ?: ""
                AIMChapterDetailScreen(
                    chapterId = chapterId,
                    initialQuery = query,
                    initialSection = backStackEntry.arguments?.getString("section").orEmpty(),
                    navController = navController,
                    repository = repository
                )
            }
            
            // Quiz routes
            composable("quizzes") { QuizzesScreen(navController, repository) }
            composable(
                route = "quiz/{quizId}",
                arguments = listOf(navArgument("quizId") { type = NavType.StringType })
            ) { backStackEntry ->
                val quizId = backStackEntry.arguments?.getString("quizId") ?: ""
                QuizDetailScreen(quizId = quizId, repository = repository, navController = navController)
            }
            
            // Flashcard routes
            composable("flashcards") { FlashcardsScreen(navController, repository) }
            composable(
                route = "flashcard_deck/{deckId}",
                arguments = listOf(navArgument("deckId") { type = NavType.StringType })
            ) { backStackEntry ->
                val deckId = backStackEntry.arguments?.getString("deckId") ?: ""
                FlashcardDeckScreen(deckId = deckId, repository = repository, navController = navController)
            }
        }
    }
}
