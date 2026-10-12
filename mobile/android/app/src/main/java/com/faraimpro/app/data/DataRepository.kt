package com.faraimpro.app.data

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import androidx.core.content.edit
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import java.io.IOException
import java.time.Instant

// Reading History data class
data class ReadingHistory(
    val type: String,  // "aim" or "far"
    val identifier: String,  // chapter number or part number
    val title: String,
    val section: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

// Reading History Manager
object ReadingHistoryManager {
    private const val PREFS_NAME = "far_aim_pro_prefs"
    private const val AIM_HISTORY_KEY = "far-aim-pro-aim-reading-history"
    private const val FAR_HISTORY_KEY = "far-aim-pro-far-reading-history"

    private val gson = Gson()
    
    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    fun getAIMReadingHistory(context: Context): ReadingHistory? {
        val prefs = getPrefs(context)
        val historyJson = prefs.getString(AIM_HISTORY_KEY, null) ?: return null
        return try {
            gson.fromJson(historyJson, ReadingHistory::class.java)?.takeIf { history ->
                history.type == "aim" &&
                    history.identifier.isNotBlank() &&
                    history.title.isNotBlank() &&
                    history.timestamp >= 0
            }
        } catch (_: Exception) {
            null
        }
    }
    
    fun getFARReadingHistory(context: Context): ReadingHistory? {
        val prefs = getPrefs(context)
        val historyJson = prefs.getString(FAR_HISTORY_KEY, null) ?: return null
        return try {
            gson.fromJson(historyJson, ReadingHistory::class.java)?.takeIf { history ->
                history.type == "far" &&
                    history.identifier.isNotBlank() &&
                    history.title.isNotBlank() &&
                    history.timestamp >= 0
            }
        } catch (_: Exception) {
            null
        }
    }
    
    fun saveAIMReadingHistory(context: Context, chapter: Int, title: String, section: String? = null) {
        val history = ReadingHistory(
            type = "aim",
            identifier = chapter.toString(),
            title = title,
            section = section
        )
        val prefs = getPrefs(context)
        prefs.edit { putString(AIM_HISTORY_KEY, gson.toJson(history)) }
    }
    
    fun saveFARReadingHistory(context: Context, part: Int, title: String, section: String? = null) {
        val history = ReadingHistory(
            type = "far",
            identifier = part.toString(),
            title = title,
            section = section
        )
        val prefs = getPrefs(context)
        prefs.edit { putString(FAR_HISTORY_KEY, gson.toJson(history)) }
    }
    
    fun clearAIMReadingHistory(context: Context) {
        val prefs = getPrefs(context)
        prefs.edit { remove(AIM_HISTORY_KEY) }
    }
    
    fun clearFARReadingHistory(context: Context) {
        val prefs = getPrefs(context)
        prefs.edit { remove(FAR_HISTORY_KEY) }
    }
}

object SearchHistoryManager {
    private const val PREFS_NAME = "far_aim_pro_prefs"
    private const val SEARCH_HISTORY_KEY = "search_history"
    private const val SEARCH_HISTORY_LIMIT = 10
    private val gson = Gson()
    private val stringListType = object : TypeToken<List<String>>() {}.type

    fun getSearchHistory(context: Context): List<String> {
        val value = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(SEARCH_HISTORY_KEY, null) ?: return emptyList()
        return try {
            normalize(gson.fromJson<List<String>>(value, stringListType).orEmpty())
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun recordSearch(context: Context, query: String): List<String> {
        return merge(context, listOf(query))
    }

    fun merge(context: Context, incoming: List<String>): List<String> {
        val history = normalize(incoming + getSearchHistory(context))
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
            putString(SEARCH_HISTORY_KEY, gson.toJson(history))
        }
        return history
    }

    private fun normalize(values: List<String>): List<String> {
        val seen = mutableSetOf<String>()
        return values.map(String::trim).filter { value ->
            value.isNotEmpty() && seen.add(value.lowercase())
        }.take(SEARCH_HISTORY_LIMIT)
    }
}

data class StudyMark(
    val key: String,
    val type: String,
    val reference: String,
    val title: String,
    val route: String,
    val saved: Boolean = false,
    val highlighted: Boolean = false,
    val note: String = "",
    val savedAt: Long? = null,
    val reviewedAt: Long? = null,
    val updatedAt: Long = System.currentTimeMillis()
)

data class StudyMarkInput(
    val type: String,
    val reference: String,
    val title: String,
    val route: String
) {
    fun key(): String = "$type:$reference"
}

private fun normalizedStoredRoute(type: String, route: String): String? {
    val readerRoute = Regex(
        "^(?:far_part|aim_chapter)/\\d+(?:\\?(?:(?:query|section)=[A-Za-z0-9._~%+-]*)(?:&(?:query|section)=[A-Za-z0-9._~%+-]*)*)?$"
    )
    return when (type) {
        "far" -> route.takeIf { it.startsWith("far_part/") && it.matches(readerRoute) }
        "aim" -> route.takeIf { it.startsWith("aim_chapter/") && it.matches(readerRoute) }
        "ac" -> when {
            route == "ac" || route == "advisory_circulars" -> "advisory_circulars"
            route.matches(Regex("^advisory_circulars/[A-Za-z0-9._~%+-]+$")) -> route
            else -> null
        }
        else -> null
    }
}

object StudyMarkManager {
    private const val PREFS_NAME = "far_aim_pro_prefs"
    private const val STUDY_MARKS_KEY = "far-aim-pro-study-marks"
    private val gson = Gson()
    private data class StoredStudyMark(
        val type: String?,
        val reference: String?,
        val title: String?,
        val route: String?,
        val saved: Boolean?,
        val highlighted: Boolean?,
        val note: String?,
        val savedAt: Long?,
        val reviewedAt: Long?,
        val updatedAt: Long?
    )

    private val markListType = object : TypeToken<List<StoredStudyMark>>() {}.type

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getStudyMarks(context: Context): List<StudyMark> {
        val json = getPrefs(context).getString(STUDY_MARKS_KEY, null) ?: return emptyList()
        return try {
            gson.fromJson<List<StoredStudyMark>>(json, markListType).orEmpty()
                .mapNotNull { stored ->
                    val type = stored.type?.takeIf { it in setOf("far", "aim", "ac") }
                        ?: return@mapNotNull null
                    val reference = stored.reference?.takeIf { it.isNotBlank() }
                        ?: return@mapNotNull null
                    val title = stored.title?.takeIf { it.isNotBlank() }
                        ?: return@mapNotNull null
                    val route = stored.route?.let { normalizedStoredRoute(type, it) }
                        ?: return@mapNotNull null
                    val updatedAt = stored.updatedAt?.takeIf { it >= 0 }
                        ?: return@mapNotNull null
                    StudyMark(
                        key = "$type:$reference",
                        type = type,
                        reference = reference,
                        title = title,
                        route = route,
                        saved = stored.saved == true,
                        highlighted = stored.highlighted == true,
                        note = stored.note.orEmpty(),
                        savedAt = stored.savedAt?.takeIf { it >= 0 },
                        reviewedAt = stored.reviewedAt?.takeIf { it >= 0 },
                        updatedAt = updatedAt
                    )
                }
                .sortedByDescending { it.updatedAt }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun getStudyMark(context: Context, input: StudyMarkInput): StudyMark? {
        return getStudyMarks(context).firstOrNull { it.key == input.key() }
    }

    fun toggleSaved(context: Context, input: StudyMarkInput): List<StudyMark> {
        return upsert(context, input) { mark ->
            mark.copy(
                saved = !mark.saved,
                savedAt = if (mark.saved) null else System.currentTimeMillis()
            )
        }
    }

    fun saveNote(context: Context, input: StudyMarkInput, note: String): List<StudyMark> {
        return upsert(context, input) { mark ->
            mark.copy(note = note.trim())
        }
    }

    fun toggleHighlighted(context: Context, input: StudyMarkInput): List<StudyMark> {
        return upsert(context, input) { mark ->
            mark.copy(highlighted = !mark.highlighted)
        }
    }

    fun markReviewed(context: Context, input: StudyMarkInput): List<StudyMark> {
        return upsert(context, input) { mark ->
            mark.copy(reviewedAt = System.currentTimeMillis())
        }
    }

    fun removeStudyMark(context: Context, key: String): List<StudyMark> {
        val marks = getStudyMarks(context).filterNot { it.key == key }
        writeStudyMarks(context, marks)
        return marks
    }

    private fun upsert(
        context: Context,
        input: StudyMarkInput,
        update: (StudyMark) -> StudyMark
    ): List<StudyMark> {
        val marks = getStudyMarks(context)
        val existing = marks.firstOrNull { it.key == input.key() }
        val base = existing ?: StudyMark(
            key = input.key(),
            type = input.type,
            reference = input.reference,
            title = input.title,
            route = input.route
        )
        val next = update(
            base.copy(
                title = input.title,
                route = input.route,
                updatedAt = System.currentTimeMillis()
            )
        )
        val updated = marks.filterNot { it.key == input.key() }.toMutableList()
        if (next.saved || next.highlighted || next.note.isNotBlank() || next.reviewedAt != null) {
            updated.add(0, next)
        }
        val sorted = updated.sortedByDescending { it.updatedAt }
        writeStudyMarks(context, sorted)
        return sorted
    }

    fun writeStudyMarks(context: Context, marks: List<StudyMark>) {
        getPrefs(context).edit { putString(STUDY_MARKS_KEY, gson.toJson(marks)) }
    }
}

data class StudyPackImportResult(
    val marksImported: Int,
    val historyImported: Int,
    val searchHistoryImported: Int = 0
)

private data class StudyPack(
    val schemaVersion: Int = 1,
    val app: String = "FAR/AIM Pro",
    val exportedAt: String = Instant.now().toString(),
    val studyMarks: List<StudyPackMark>,
    val readingHistory: List<StudyPackHistory>,
    val searchHistory: List<String> = emptyList()
)

private data class StudyPackMark(
    val key: String,
    val type: String,
    val reference: String,
    val title: String,
    val path: String,
    val saved: Boolean,
    val highlighted: Boolean,
    val note: String,
    val savedAt: Long?,
    val reviewedAt: Long?,
    val updatedAt: Long
)

private data class StudyPackHistory(
    val type: String,
    val id: String,
    val title: String,
    val path: String,
    val subtitle: String? = null,
    val timestamp: Long
)

object StudyPackManager {
    private const val PREFS_NAME = "far_aim_pro_prefs"
    private const val AIM_HISTORY_KEY = "far-aim-pro-aim-reading-history"
    private const val FAR_HISTORY_KEY = "far-aim-pro-far-reading-history"
    private val gson = Gson()

    fun createStudyPackJson(context: Context): String {
        val marks = StudyMarkManager.getStudyMarks(context).map { mark ->
            StudyPackMark(
                key = mark.key,
                type = mark.type,
                reference = mark.reference,
                title = mark.title,
                path = routeToPath(mark.route),
                saved = mark.saved,
                highlighted = mark.highlighted,
                note = mark.note,
                savedAt = mark.savedAt,
                reviewedAt = mark.reviewedAt,
                updatedAt = mark.updatedAt
            )
        }
        val histories = listOfNotNull(
            ReadingHistoryManager.getFARReadingHistory(context),
            ReadingHistoryManager.getAIMReadingHistory(context)
        ).map { history ->
            StudyPackHistory(
                type = history.type,
                id = history.identifier,
                title = history.title,
                path = historyToPath(history),
                subtitle = history.section,
                timestamp = history.timestamp
            )
        }
        val searchHistory = SearchHistoryManager.getSearchHistory(context)

        return gson.toJson(
            StudyPack(
                studyMarks = marks,
                readingHistory = histories.sortedByDescending { it.timestamp },
                searchHistory = searchHistory
            )
        )
    }

    fun importStudyPackJson(context: Context, content: String): StudyPackImportResult {
        val root = JsonParser.parseString(content).asJsonObject
        if (root.intValue("schemaVersion") != 1 || root.stringValue("app") != "FAR/AIM Pro") {
            throw IllegalArgumentException("Invalid FAR/AIM Pro study pack")
        }

        val incomingMarks = root.arrayObjects("studyMarks").mapNotNull(::normalizeStudyMark)
        val mergedMarks = mergeStudyMarks(StudyMarkManager.getStudyMarks(context), incomingMarks)
        StudyMarkManager.writeStudyMarks(context, mergedMarks)

        val histories = root.arrayObjects("readingHistory").mapNotNull(::normalizeHistory)
        importReadingHistory(context, histories)

        val incomingSearchHistory = root.arrayStrings("searchHistory")
        val searchHistory = SearchHistoryManager.merge(context, incomingSearchHistory)
        return StudyPackImportResult(
            marksImported = incomingMarks.size,
            historyImported = histories.size,
            searchHistoryImported = searchHistory.count { saved ->
                incomingSearchHistory.any { it.trim().equals(saved, ignoreCase = true) }
            }
        )
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun normalizeStudyMark(value: JsonObject): StudyMark? {
        val type = value.stringValue("type") ?: return null
        if (type !in setOf("far", "aim", "ac")) return null

        val reference = value.stringValue("reference") ?: return null
        val title = value.stringValue("title") ?: return null
        if (reference.isBlank() || title.isBlank()) return null
        val path = value.stringValue("path") ?: value.stringValue("route") ?: return null
        val route = pathToRoute(path, type) ?: return null
        val updatedAt = value.longValue("updatedAt")?.takeIf { it >= 0 } ?: return null
        val key = "$type:$reference"

        return StudyMark(
            key = key,
            type = type,
            reference = reference,
            title = title,
            route = route,
            saved = value.booleanValue("saved") == true,
            highlighted = value.booleanValue("highlighted") == true,
            note = value.stringValue("note").orEmpty(),
            savedAt = value.longValue("savedAt"),
            reviewedAt = value.longValue("reviewedAt"),
            updatedAt = updatedAt
        )
    }

    private fun normalizeHistory(value: JsonObject): ReadingHistory? {
        val type = value.stringValue("type") ?: return null
        if (type != "far" && type != "aim") return null

        val identifier = when (val id = value.stringValue("id")) {
            null -> identifierFromPath(value.stringValue("path").orEmpty(), type)
            else -> id
        }?.takeIf { it.matches(Regex("^\\d+$")) } ?: return null

        val title = value.stringValue("title") ?: return null
        if (title.isBlank()) return null
        val timestamp = value.longValue("timestamp")?.takeIf { it >= 0 } ?: return null
        return ReadingHistory(
            type = type,
            identifier = identifier,
            title = title,
            section = value.stringValue("subtitle"),
            timestamp = timestamp
        )
    }

    private fun mergeStudyMarks(current: List<StudyMark>, incoming: List<StudyMark>): List<StudyMark> {
        val byKey = current.associateBy { it.key }.toMutableMap()
        incoming.forEach { mark ->
            val existing = byKey[mark.key]
            if (existing == null || mark.updatedAt >= existing.updatedAt) {
                byKey[mark.key] = mark
            }
        }
        return byKey.values.sortedByDescending { it.updatedAt }
    }

    private fun importReadingHistory(context: Context, histories: List<ReadingHistory>) {
        val current = listOfNotNull(
            ReadingHistoryManager.getFARReadingHistory(context),
            ReadingHistoryManager.getAIMReadingHistory(context)
        )
        val latestByType = (histories + current)
            .filter { it.type == "far" || it.type == "aim" }
            .groupBy { it.type }
            .mapValues { (_, values) -> values.maxBy { it.timestamp } }
        getPrefs(context).edit {
            latestByType["far"]?.let { putString(FAR_HISTORY_KEY, gson.toJson(it)) }
            latestByType["aim"]?.let { putString(AIM_HISTORY_KEY, gson.toJson(it)) }
        }
    }

    private fun routeToPath(route: String): String {
        return when {
            route.startsWith("far_part/") -> readerRouteToPath(route, "far_part/", "/far/")
            route.startsWith("aim_chapter/") -> readerRouteToPath(route, "aim_chapter/", "/aim/")
            route.startsWith("advisory_circulars/") ->
                "/advisory-circulars/${route.removePrefix("advisory_circulars/")}"
            route == "ac" || route == "advisory_circulars" -> "/advisory-circulars"
            route.startsWith("/") -> route
            else -> "/"
        }
    }

    private fun pathToRoute(path: String, type: String): String? {
        if (path.contains("..") || path.startsWith("//") || path.contains("://")) return null

        normalizedStoredRoute(type, path)?.let { return it }
        if (type == "far" || type == "aim") {
            val prefix = if (type == "far") "/far/" else "/aim/"
            if (!path.startsWith(prefix)) return null
            val identifier = path.removePrefix(prefix).substringBefore("#").substringBefore("?")
            if (!identifier.matches(Regex("^\\d+$"))) return null
            val section = path.substringAfter("#", "").substringBefore("?")
            if (section.isNotEmpty() && !section.matches(Regex("^[A-Za-z0-9._~%+-]+$"))) return null
            val route = if (type == "far") "far_part/$identifier" else "aim_chapter/$identifier"
            return route + section.takeIf(String::isNotEmpty)?.let { "?section=$it" }.orEmpty()
        }

        if (path == "/advisory-circulars") return "advisory_circulars"
        if (!path.startsWith("/advisory-circulars/")) return null
        val identifier = path.removePrefix("/advisory-circulars/").substringBefore("#").substringBefore("?")
        if (!identifier.matches(Regex("^[A-Za-z0-9._~%+-]+$"))) return null
        return "advisory_circulars/$identifier"
    }

    private fun readerRouteToPath(route: String, routePrefix: String, pathPrefix: String): String {
        val target = route.removePrefix(routePrefix)
        val identifier = target.substringBefore("?")
        val section = target.substringAfter("?", "")
            .split("&")
            .firstOrNull { it.startsWith("section=") }
            ?.substringAfter("section=")
            ?.takeIf(String::isNotEmpty)
        return "$pathPrefix$identifier" + section?.let { "#${Uri.decode(it)}" }.orEmpty()
    }

    private fun historyToPath(history: ReadingHistory): String {
        return when (history.type) {
            "far" -> "/far/${history.identifier}"
            "aim" -> "/aim/${history.identifier}"
            else -> "/"
        }
    }

    private fun identifierFromPath(path: String, type: String): String? {
        val prefix = if (type == "far") "/far/" else "/aim/"
        if (!path.startsWith(prefix)) return null
        return path.removePrefix(prefix).substringBefore("#").substringBefore("?")
            .takeIf { it.matches(Regex("^\\d+$")) }
    }

    private fun JsonObject.stringValue(name: String): String? {
        return get(name)?.takeIf { !it.isJsonNull }?.asString
    }

    private fun JsonObject.intValue(name: String): Int? {
        return get(name)?.takeIf { !it.isJsonNull }?.asInt
    }

    private fun JsonObject.longValue(name: String): Long? {
        val value = get(name)?.takeIf { !it.isJsonNull } ?: return null
        return runCatching { value.asLong }.getOrNull()
    }

    private fun JsonObject.booleanValue(name: String): Boolean? {
        return get(name)?.takeIf { !it.isJsonNull }?.asBoolean
    }

    private fun JsonObject.arrayObjects(name: String): List<JsonObject> {
        val value = get(name)?.takeIf { it.isJsonArray } ?: return emptyList()
        return value.asJsonArray.mapNotNull { element ->
            element.takeIf { it.isJsonObject }?.asJsonObject
        }
    }

    private fun JsonObject.arrayStrings(name: String): List<String> {
        val value = get(name)?.takeIf { it.isJsonArray } ?: return emptyList()
        return value.asJsonArray.mapNotNull { element ->
            element.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
        }
    }
}

/**
 * Repository for loading data from JSON asset files
 */
class DataRepository(private val context: Context) {
    private val gson = Gson()
    
    // Cached data
    private var _farParts: List<FARPart>? = null
    private var _aimChapters: List<AIMChapter>? = null
    private var _quizzes: List<Quiz>? = null
    private var _flashcardDecks: List<FlashcardDeck>? = null
    private var _pcgTerms: List<PCGTerm>? = null
    private var _studyPaths: List<StudyPath>? = null
    private var _advisoryCirculars: List<AdvisoryCircular>? = null
    private var _acSearchIndex: ACInvertedIndex? = null
    private var _sourceStatus: SourceStatusData? = null
    
    // Helper to load JSON from assets
    private fun loadJsonFromAssets(fileName: String): String? {
        return try {
            context.assets.open(fileName).bufferedReader().use { it.readText() }
        } catch (e: IOException) {
            e.printStackTrace()
            null
        }
    }
    
    private inline fun <reified T> loadJson(fileName: String): T? {
        val json = loadJsonFromAssets(fileName) ?: return null
        return try {
            gson.fromJson(json, T::class.java)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private inline fun <reified T> requireJson(fileName: String): T {
        val json = context.assets.open(fileName).bufferedReader().use { it.readText() }
        return requireNotNull(gson.fromJson(json, T::class.java)) {
            "Bundled data is empty: $fileName"
        }
    }

    private fun loadACSearchIndex(): ACInvertedIndex {
        _acSearchIndex?.let { return it }

        val type = object : TypeToken<ACInvertedIndex>() {}.type
        val index = context.assets.open("search/inverted-index-ac.json")
            .bufferedReader()
            .use { reader ->
                requireNotNull(gson.fromJson<ACInvertedIndex>(reader, type)) {
                    "Bundled AC search index is empty"
                }
            }
        require(index.isNotEmpty()) { "Bundled AC search index has no tokens" }
        _acSearchIndex = index
        return index
    }

    fun loadFARParts(forceRefresh: Boolean = false): Result<List<FARPart>> = runCatching {
        if (!forceRefresh) {
            _farParts?.let { return@runCatching it }
        }

        val index = requireJson<FARIndex>("far/index.json")
        val parts = index.parts
            .map { it.part }
            .distinct()
            .sorted()
            .map { requireJson<FARPart>("far/part$it.json") }
            .sortedBy { it.part }
        _farParts = parts
        parts
    }

    fun loadAIMChapters(forceRefresh: Boolean = false): Result<List<AIMChapter>> = runCatching {
        if (!forceRefresh) {
            _aimChapters?.let { return@runCatching it }
        }

        val index = requireJson<AIMIndex>("aim/index.json")
        val chapters = index.chapters
            .map { it.chapter }
            .distinct()
            .sorted()
            .map { requireJson<AIMChapter>("aim/chapter$it.json") }
            .sortedBy { it.chapter }
        _aimChapters = chapters
        chapters
    }

    fun loadFlashcardDecks(forceRefresh: Boolean = false): Result<List<FlashcardDeck>> = runCatching {
        if (!forceRefresh) {
            _flashcardDecks?.let { return@runCatching it }
        }

        val deckFiles = context.assets.list("flashcards")
            ?.filter { it.endsWith(".json") }
            ?.sorted()
            .orEmpty()
        val decks = deckFiles.map { requireJson<FlashcardDeck>("flashcards/$it") }
        _flashcardDecks = decks
        decks
    }

    fun loadAdvisoryCirculars(forceRefresh: Boolean = false): Result<List<AdvisoryCircular>> = runCatching {
        if (!forceRefresh) {
            _advisoryCirculars?.let { return@runCatching it }
        }

        val circulars = requireJson<AdvisoryCircularsData>("advisory-circulars/index.json").items
        _advisoryCirculars = circulars
        circulars
    }

    fun loadAdvisoryCircularContent(advisoryCircular: AdvisoryCircular): Result<AdvisoryCircularContent?> {
        val contentPath = advisoryCircular.contentPath ?: return Result.success(null)
        return runCatching {
            requireJson<AdvisoryCircularContent>("advisory-circulars/$contentPath")
        }
    }

    fun loadPCGTerms(forceRefresh: Boolean = false): Result<List<PCGTerm>> = runCatching {
        if (!forceRefresh) {
            _pcgTerms?.let { return@runCatching it }
        }

        val terms = requireJson<PCGData>("aim/pcg.json").terms
        _pcgTerms = terms
        terms
    }

    // FAR Parts
    fun getFARParts(): List<FARPart> {
        return loadFARParts().getOrElse { emptyList() }
    }
    
    // AIM Chapters
    fun getAIMChapters(): List<AIMChapter> {
        return loadAIMChapters().getOrElse { emptyList() }
    }
    
    // Quizzes
    fun getQuizzes(): List<Quiz> {
        if (_quizzes != null) return _quizzes!!
        
        val quizFiles = listOf(
            // Miscellaneous (show first)
            "quizzes/hard-challenge.json",
            // FAR
            "quizzes/private-pilot-far.json",
            "quizzes/airspace-quiz.json",
            "quizzes/far-part43-maintenance.json",
            "quizzes/far-part61-certification.json",
            "quizzes/far-part67-medical.json",
            "quizzes/far-part91-operating-rules.json",
            "quizzes/far-part830-ntsb.json",
            // AIM
            "quizzes/aim-chapter1-navigation.json",
            "quizzes/aim-chapter2-lighting-markings.json",
            "quizzes/aim-chapter4-atc.json",
            "quizzes/aim-chapter5-procedures.json",
            "quizzes/aim-chapter6-emergency.json",
            "quizzes/aim-chapter7-safety.json",
            "quizzes/aim-chapter8-medical.json",
            "quizzes/aim-chapter9-charts.json",
            "quizzes/aim-chapter10-helicopter.json",
            "quizzes/aim-chapter11-uas.json"
        )
        
        val quizzes = mutableListOf<Quiz>()
        for (file in quizFiles) {
            val quiz = loadJson<Quiz>(file)
            if (quiz != null) {
                quizzes.add(quiz)
            }
        }
        
        _quizzes = quizzes
        return _quizzes!!
    }
    
    // Flashcard Decks
    fun getFlashcardDecks(): List<FlashcardDeck> {
        return loadFlashcardDecks().getOrElse { emptyList() }
    }

    fun getStudyPaths(): List<StudyPath> {
        if (_studyPaths != null) return _studyPaths!!

        val data = loadJson<StudyPathsData>("study-paths.json")
        _studyPaths = data?.paths.orEmpty().filter { it.references.isNotEmpty() }
        return _studyPaths!!
    }

    fun getAdvisoryCirculars(): List<AdvisoryCircular> {
        return loadAdvisoryCirculars().getOrElse { emptyList() }
    }

    fun getAdvisoryCircularContent(advisoryCircular: AdvisoryCircular): AdvisoryCircularContent? {
        return loadAdvisoryCircularContent(advisoryCircular).getOrNull()
    }

    fun getSourceStatus(): SourceStatusData? {
        if (_sourceStatus != null) return _sourceStatus

        _sourceStatus = loadJson<SourceStatusData>("source-status.json")
        return _sourceStatus
    }
    
    // PCG Terms
    fun getPCGTerms(): List<PCGTerm> {
        return loadPCGTerms().getOrElse { emptyList() }
    }
    
    // Search PCG
    fun searchPCG(query: String): List<PCGTerm> {
        val normalizedQuery = query.trim().lowercase()
        if (normalizedQuery.isEmpty()) return getPCGTerms()

        fun rank(term: PCGTerm): Int {
            val label = term.term.lowercase()
            return when {
                label == normalizedQuery -> 0
                label.startsWith(normalizedQuery) -> 1
                label.contains(normalizedQuery) -> 2
                else -> 3
            }
        }

        return getPCGTerms()
            .filter {
                it.term.lowercase().contains(normalizedQuery) ||
                    it.definition.lowercase().contains(normalizedQuery)
            }
            .sortedWith(compareBy(::rank).thenBy { it.term })
    }
    
    // Category helpers
    fun getQuizzesByCategory(): Pair<List<Quiz>, List<Quiz>> {
        val quizzes = getQuizzes()
        val aim = quizzes.filter { it.category == "AIM" }.sortedBy { it.chapter ?: 0 }
        val far = quizzes.filter { it.category == "FAR" }.sortedBy { it.title }
        return Pair(aim, far)
    }
    
    fun getFlashcardDecksByCategory(): Pair<List<FlashcardDeck>, List<FlashcardDeck>> {
        val decks = getFlashcardDecks()
        val aim = decks.filter { it.category == "AIM" }.sortedBy { it.chapter ?: 0 }
        val far = decks.filter { it.category == "FAR" }.sortedBy { it.title }
        return Pair(aim, far)
    }
    
    // Global search with TF-IDF relevance scoring
    fun search(query: String): List<SearchResult> {
        if (query.length < 2) return emptyList()
        val lowercased = query.lowercase()
        val tokens = tokenize(lowercased)
        if (tokens.isEmpty()) return emptyList()

        val farParts = loadFARParts().getOrThrow()
        val aimChapters = loadAIMChapters().getOrThrow()
        val pcgTerms = loadPCGTerms().getOrThrow()
        val flashcardDecks = loadFlashcardDecks().getOrThrow()
        val advisoryCirculars = loadAdvisoryCirculars().getOrThrow()
        val acSearchIndex = loadACSearchIndex()
        
        data class ScoredResult(val result: SearchResult, val score: Double)
        val scoredResults = mutableListOf<ScoredResult>()
        
        // Collect all searchable documents for IDF calculation
        val allDocs = mutableListOf<Pair<String, String>>() // title, content
        
        for (part in farParts) {
            part.sections?.forEach { section ->
                allDocs.add(section.title to section.searchableText)
            }
            part.subparts?.forEach { subpart ->
                subpart.sections.forEach { section ->
                    allDocs.add(section.title to section.searchableText)
                }
            }
            part.appendices?.forEach { appendix ->
                allDocs.add(appendix.title to appendix.searchableText)
            }
        }
        for (chapter in aimChapters) {
            for (section in chapter.sections) {
                allDocs.add(section.title to section.searchableText)
            }
        }
        for (term in pcgTerms) {
            allDocs.add(term.term to term.definition)
        }
        for (deck in flashcardDecks) {
            for (card in deck.cards) {
                allDocs.add(card.front to "${card.back} ${card.reference} ${deck.title}")
            }
        }
        for (ac in advisoryCirculars) {
            allDocs.add("AC ${ac.number} ${ac.title}" to advisoryCircularSearchText(ac))
        }
        
        val totalDocs = allDocs.size.toDouble()
        
        // Calculate document frequency for each token
        val docFrequency = tokens.associateWith { token ->
            allDocs.count { (title, content) ->
                title.lowercase().contains(token) || content.lowercase().contains(token)
            }
        }
        
        // Search FAR with scoring
        for (part in farParts) {
            part.sections?.forEach { section ->
                val score = calculateTfIdfScore(section.title, section.searchableText, tokens, docFrequency, totalDocs)
                if (score > 0) {
                    scoredResults.add(ScoredResult(
                        SearchResult(
                            type = "far",
                            title = "§ ${section.section} ${section.title}",
                            content = generateContextualSnippet(section.searchableText, lowercased),
                            reference = part.cfr,
                            link = "far/${part.part}#${section.section}"
                        ),
                        score
                    ))
                }
            }
            
            part.subparts?.forEach { subpart ->
                subpart.sections.forEach { section ->
                    val score = calculateTfIdfScore(section.title, section.searchableText, tokens, docFrequency, totalDocs)
                    if (score > 0) {
                        scoredResults.add(ScoredResult(
                            SearchResult(
                                type = "far",
                                title = "§ ${section.section} ${section.title}",
                                content = generateContextualSnippet(section.searchableText, lowercased),
                                reference = part.cfr,
                                link = "far/${part.part}#${section.section}"
                            ),
                            score
                        ))
                    }
                }
            }
            part.appendices?.forEach { appendix ->
                val score = calculateTfIdfScore(appendix.title, appendix.searchableText, tokens, docFrequency, totalDocs)
                if (score > 0) {
                    scoredResults.add(ScoredResult(
                        SearchResult(
                            type = "far",
                            title = appendix.title,
                            content = generateContextualSnippet(appendix.searchableText, lowercased),
                            reference = part.cfr,
                            link = "far/${part.part}#${appendix.appendix}"
                        ),
                        score
                    ))
                }
            }
        }
        
        // Search AIM with scoring
        for (chapter in aimChapters) {
            for (section in chapter.sections) {
                val content = section.searchableText
                val score = calculateTfIdfScore(section.title, content, tokens, docFrequency, totalDocs)
                if (score > 0) {
                    scoredResults.add(ScoredResult(
                        SearchResult(
                            type = "aim",
                            title = "${section.section} ${section.title}",
                            content = generateContextualSnippet(content, lowercased),
                            reference = "AIM ${formatAIMChapterLabel(chapter.chapter)}",
                            link = "aim/${chapter.chapter}#${section.section}"
                        ),
                        score
                    ))
                }
            }
        }
        
        // Search PCG with scoring
        for (term in pcgTerms) {
            val score = calculateTfIdfScore(term.term, term.definition, tokens, docFrequency, totalDocs)
            if (score > 0) {
                scoredResults.add(ScoredResult(
                    SearchResult(
                        type = "pcg",
                        title = term.term,
                        content = generateContextualSnippet(term.definition, lowercased),
                        reference = "Pilot/Controller Glossary",
                        link = "glossary#${term.term}"
                    ),
                    score
                ))
            }
        }

        for (deck in flashcardDecks) {
            for (card in deck.cards) {
                val content = "${card.back} ${card.reference} ${deck.title}"
                val score = calculateTfIdfScore(card.front, content, tokens, docFrequency, totalDocs)
                if (score > 0) {
                    scoredResults.add(ScoredResult(
                        SearchResult(
                            type = "flashcard",
                            title = card.front,
                            content = generateContextualSnippet(card.back, lowercased),
                            reference = card.reference,
                            link = "flashcard_deck/${deck.id}"
                        ),
                        score
                    ))
                }
            }
        }

        // Search AC full text through compact postings, then rank with bundled metadata.
        for (candidate in rankAdvisoryCircularCandidates(tokens, acSearchIndex, advisoryCirculars)) {
            val ac = advisoryCirculars[candidate.documentId]
            scoredResults.add(ScoredResult(
                SearchResult(
                    type = "ac",
                    title = "AC ${ac.number} ${ac.title}",
                    content = if (candidate.matchedFullText) {
                        "Full-text match. ${ac.summary}"
                    } else {
                        ac.summary
                    },
                    reference = "FAA Advisory Circular",
                    link = "advisory_circulars#${ac.id}"
                ),
                candidate.score
            ))
        }
        
        // Sort by score descending and return top 50
        return scoredResults
            .sortedWith(
                compareByDescending<ScoredResult> { it.score }
                    .thenBy { it.result.type }
                    .thenBy { it.result.reference }
                    .thenBy { it.result.title }
            )
            .take(50)
            .map { it.result }
    }
    
    /**
     * Tokenize search query into individual terms
     */
    private fun tokenize(text: String): List<String> {
        val stopWords = setOf("a", "an", "and", "are", "as", "at", "be", "by", "for", "from", 
            "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", 
            "were", "will", "with", "or", "this", "which", "not", "but", "can", "all", "any")
        return text.replace(Regex("[^\\w\\s]"), "")
            .split(Regex("\\s+"))
            .filter { it.length > 2 && it !in stopWords }
    }
    
    /**
     * Calculate TF-IDF score for a document
     */
    private fun calculateTfIdfScore(
        title: String, 
        content: String, 
        tokens: List<String>, 
        docFrequency: Map<String, Int>, 
        totalDocs: Double
    ): Double {
        val text = "$title $content".lowercase()
        var score = 0.0
        
        for (token in tokens) {
            // Check if document contains this token
            if (!text.contains(token)) return 0.0 // Must contain all tokens
            
            // Term frequency
            val tf = countOccurrences(text, token)
            val tfNormalized = if (tf > 0) 1 + kotlin.math.ln(tf.toDouble()) else 0.0
            
            // Inverse document frequency
            val df = docFrequency[token] ?: 1
            val idf = kotlin.math.ln(totalDocs / df)
            
            score += tfNormalized * idf
            
            // Boost for title matches (2x weight)
            if (title.lowercase().contains(token)) {
                score += idf * 2
            }
        }
        
        return score
    }
    
    /**
     * Count occurrences of a term in text
     */
    private fun countOccurrences(text: String, term: String): Int {
        var count = 0
        var pos = 0
        while (true) {
            pos = text.indexOf(term, pos)
            if (pos < 0) break
            count++
            pos += term.length
        }
        return count
    }

    private fun advisoryCircularSearchText(ac: AdvisoryCircular): String {
        return listOf(
            ac.summary,
            ac.category,
            ac.status,
            ac.office,
            ac.replaces.orEmpty(),
            ac.relatedCfr.joinToString(" "),
            ac.tags.joinToString(" ")
        ).joinToString(" ")
    }
    
    /**
     * Generate a contextual snippet that shows the search term in context.
     * Finds the first occurrence of the search term and extracts surrounding text.
     */
    private fun generateContextualSnippet(content: String, searchTerm: String, maxLength: Int = 200): String {
        if (content.isEmpty()) return ""
        
        val lowerContent = content.lowercase()
        val matchIndex = lowerContent.indexOf(searchTerm)
        
        // If no match found, return the beginning of the content
        if (matchIndex == -1) {
            return if (content.length > maxLength) {
                content.take(maxLength) + "..."
            } else {
                content
            }
        }
        
        // Calculate snippet bounds - center around the match
        val halfLength = maxLength / 2
        var start = maxOf(0, matchIndex - halfLength)
        var end = minOf(content.length, matchIndex + searchTerm.length + halfLength)
        
        // Adjust to not cut words - find word boundaries
        if (start > 0) {
            val spaceIndex = content.lastIndexOf(' ', start)
            if (spaceIndex > start - 30) {
                start = spaceIndex + 1
            }
        }
        
        if (end < content.length) {
            val spaceIndex = content.indexOf(' ', end)
            if (spaceIndex != -1 && spaceIndex < end + 30) {
                end = spaceIndex
            }
        }
        
        var snippet = content.substring(start, end)
        
        // Add ellipsis if truncated
        if (start > 0) {
            snippet = "...$snippet"
        }
        if (end < content.length) {
            snippet = "$snippet..."
        }
        
        return snippet
    }
}
