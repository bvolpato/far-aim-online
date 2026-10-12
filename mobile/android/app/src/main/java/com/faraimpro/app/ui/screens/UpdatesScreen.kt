package com.faraimpro.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.faraimpro.app.data.DataRepository
import com.faraimpro.app.data.SourceChangeWatch
import com.faraimpro.app.data.SourceStatusItem

private val UpdatesMaxWidth = 960.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdatesScreen(repository: DataRepository, navController: NavController) {
    val status = remember(repository) { repository.getSourceStatus() }
    val uriHandler = LocalUriHandler.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Data Updates") }
            )
        }
    ) { padding ->
        if (status == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Text("Update status unavailable")
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            item {
                Card(
                    modifier = Modifier
                        .widthIn(max = UpdatesMaxWidth)
                        .fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Status date ${status.generatedAt}", fontWeight = FontWeight.SemiBold)
                        }
                        Text(
                            text = "Source dates, content coverage, release notes, and known limits for FAR/AIM Pro.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            items(status.sources) { source ->
                SourceStatusCard(
                    source = source,
                    onOpen = {
                        val route = source.officialUrl.toInternalRoute()
                        if (route != null) {
                            navController.navigate(route)
                        } else {
                            uriHandler.openUri(source.officialUrl)
                        }
                    }
                )
            }

            item {
                SectionCard(title = "Change Watch") {
                    status.changeWatch.forEach { item ->
                        ChangeWatchItem(
                            item = item,
                            onReview = {
                                item.link.toInternalRoute()?.let(navController::navigate)
                            }
                        )
                    }
                }
            }

            item {
                SectionCard(title = "Release Notes") {
                    status.releaseNotes.forEach { note ->
                        Text("${note.date} - ${note.title}", fontWeight = FontWeight.SemiBold)
                        note.details.forEach { detail ->
                            BulletText(detail)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                }
            }

            item {
                SectionCard(title = "Known Limits") {
                    status.limitations.forEach { BulletText(it) }
                }
            }

            item {
                SectionCard(title = "Next Checks") {
                    status.nextChecks.forEach { BulletText(it) }
                }
            }
        }
    }
}

@Composable
private fun ChangeWatchItem(
    item: SourceChangeWatch,
    onReview: () -> Unit
) {
    Column(
        modifier = Modifier.padding(vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AssistChip(onClick = {}, label = { Text(item.severity) })
            AssistChip(onClick = {}, label = { Text(item.date) })
        }
        Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(item.summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Affected references", fontWeight = FontWeight.SemiBold)
        item.affectedReferences.forEach { reference ->
            BulletText(reference)
        }
        Text("Review actions", fontWeight = FontWeight.SemiBold)
        item.actions.forEach { action ->
            BulletText(action)
        }
        OutlinedButton(onClick = onReview) {
            Text("Review")
        }
    }
}

@Composable
private fun SourceStatusCard(
    source: SourceStatusItem,
    onOpen: () -> Unit
) {
    Card(
        modifier = Modifier
            .widthIn(max = UpdatesMaxWidth)
            .fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AssistChip(onClick = {}, label = { Text(source.shortLabel) })
                AssistChip(onClick = {}, label = { Text(source.status) })
            }
            Text(source.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(source.source, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Updated ${source.lastUpdated}", fontWeight = FontWeight.SemiBold)
            Text(source.coverage, color = MaterialTheme.colorScheme.onSurfaceVariant)
            source.notes.forEach { BulletText(it) }
            OutlinedButton(onClick = onOpen) {
                Text(if (source.officialUrl.startsWith("/")) "Open" else "Official source")
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier
            .widthIn(max = UpdatesMaxWidth)
            .fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun BulletText(text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp)
        )
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun String.toInternalRoute(): String? = when (this) {
    "/far" -> "far"
    "/aim" -> "aim"
    "/glossary" -> "glossary"
    "/advisory-circulars" -> "advisory_circulars"
    "/study" -> "study"
    "/updates" -> "updates"
    else -> null
}
