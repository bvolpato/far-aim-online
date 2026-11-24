package com.faraimpro.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.faraimpro.app.FARAIMProApplication
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.ui.screens.*

sealed class Screen(val route: String, val title: String, val icon: @Composable () -> Unit) {
    object Home : Screen("home", "Home", { Icon(Icons.Default.Home, contentDescription = null) })
    object FAR : Screen("far", "FAR", { Icon(Icons.Default.Description, contentDescription = null) })
    object AIM : Screen("aim", "AIM", { Icon(Icons.Default.Book, contentDescription = null) })
    object Study : Screen("study", "Study", { Icon(Icons.Default.School, contentDescription = null) })
    object AdvisoryCirculars : Screen("advisory_circulars", "ACs", { Icon(Icons.AutoMirrored.Filled.Assignment, contentDescription = null) })
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

// Tablet navigation rail items
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

private fun isSupportedDeepLinkRoute(route: String): Boolean {
    return route in setOf(
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
    ) ||
        route.startsWith("far_part/") ||
        route.startsWith("aim_chapter/") ||
        route.startsWith("advisory_circulars") ||
        route.startsWith("glossary") ||
        route.startsWith("quiz/") ||
        route.startsWith("flashcard_deck/")
}

private fun isScreenSelected(screen: Screen, currentDestination: NavDestination?, isTablet: Boolean): Boolean {
    val routes = currentDestination?.hierarchy?.mapNotNull { it.route }?.toList().orEmpty()
    if (routes.isEmpty()) return false
    return when (screen) {
        Screen.Home -> routes.any { it == Screen.Home.route }
        Screen.FAR -> routes.any { it == Screen.FAR.route || it.startsWith("far_part/") }
        Screen.AIM -> routes.any { it == Screen.AIM.route || it.startsWith("aim_chapter/") }
        Screen.Study -> routes.any {
            it == Screen.Study.route ||
                it == "quizzes" || it.startsWith("quiz/") ||
                it == "flashcards" || it.startsWith("flashcard_deck/")
        }
        Screen.AdvisoryCirculars -> routes.any { it.startsWith("advisory_circulars") }
        Screen.Glossary -> routes.any { it.startsWith("glossary") }
        Screen.Search -> routes.any { it == Screen.Search.route }
        Screen.More -> routes.any {
            it == Screen.More.route || it == Screen.Updates.route ||
                (!isTablet && (it.startsWith("advisory_circulars") || it.startsWith("glossary") || it == Screen.Search.route))
        }
        Screen.Updates -> routes.any { it == Screen.Updates.route }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FARAIMProApp(
    initialRoute: String = Screen.Home.route,
    pendingDeepLinkRoute: String? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    val navController = rememberNavController()
    val context = LocalContext.current
    val appContext = context.applicationContext
    val windowInfo = LocalWindowInfo.current
    val density = LocalDensity.current

    // Reuse application-scoped repository so JSON caches survive configuration changes.
    val repository = remember(appContext) {
        (appContext as? FARAIMProApplication)?.repository ?: DataRepository(appContext)
    }

    // Determine if we're on a tablet (width >= 600dp)
    val isTablet = with(density) { windowInfo.containerSize.width.toDp() >= 600.dp }
    val navItems = if (isTablet) tabletNavItems else phoneNavItems

    val targetRoute = pendingDeepLinkRoute ?: initialRoute.takeIf { it != Screen.Home.route }
    LaunchedEffect(targetRoute) {
        if (targetRoute != null && isSupportedDeepLinkRoute(targetRoute)) {
            if (targetRoute == Screen.Home.route) {
                navController.popBackStack(Screen.Home.route, inclusive = false)
            } else {
                navController.navigate(targetRoute) {
                    launchSingleTop = true
                }
            }
            onDeepLinkConsumed()
        }
    }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    fun onNavItemClick(screen: Screen, isSelected: Boolean) {
        if (isSelected) {
            val alreadyAtRoot = currentDestination?.route == screen.route
            val popped = navController.popBackStack(screen.route, inclusive = false)
            if (!alreadyAtRoot && !popped) {
                navController.navigate(screen.route) {
                    popUpTo(navController.graph.findStartDestination().id) {
                        saveState = true
                    }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        } else {
            navController.navigate(screen.route) {
                popUpTo(navController.graph.findStartDestination().id) {
                    saveState = true
                }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    val navHostContent: @Composable (Modifier) -> Unit = { hostModifier ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = hostModifier
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

            composable("quizzes") { QuizzesScreen(navController, repository) }
            composable(
                route = "quiz/{quizId}",
                arguments = listOf(navArgument("quizId") { type = NavType.StringType })
            ) { backStackEntry ->
                val quizId = backStackEntry.arguments?.getString("quizId") ?: ""
                QuizDetailScreen(quizId = quizId, repository = repository, navController = navController)
            }

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

    if (isTablet) {
        Row(modifier = Modifier.fillMaxSize()) {
            NavigationRail(
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                navItems.forEach { screen ->
                    val isSelected = isScreenSelected(screen, currentDestination, isTablet = true)
                    NavigationRailItem(
                        icon = screen.icon,
                        label = { Text(screen.title) },
                        selected = isSelected,
                        onClick = { onNavItemClick(screen, isSelected) }
                    )
                }
            }
            navHostContent(Modifier.weight(1f).fillMaxHeight())
        }
    } else {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 2.dp
                ) {
                    navItems.forEach { screen ->
                        val isSelected = isScreenSelected(screen, currentDestination, isTablet = false)
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
                            onClick = { onNavItemClick(screen, isSelected) }
                        )
                    }
                }
            }
        ) { innerPadding ->
            navHostContent(Modifier.padding(innerPadding))
        }
    }
}
