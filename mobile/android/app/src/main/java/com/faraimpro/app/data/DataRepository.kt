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

    fun removeSearch(context: Context, query: String): List<String> {
        val history = getSearchHistory(context).filterNot { it.equals(query, ignoreCase = true) }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
            if (history.isEmpty()) remove(SEARCH_HISTORY_KEY)
            else putString(SEARCH_HISTORY_KEY, gson.toJson(history))
        }
        return history
    }

    fun clearSearchHistory(context: Context): List<String> {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
            remove(SEARCH_HISTORY_KEY)
        }
        return emptyList()
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

private val READER_ROUTE_REGEX = Regex(
    "^(?:far_part|aim_chapter)/\\d+(?:\\?(?:(?:query|section)=[A-Za-z0-9._~%+-]*)(?:&(?:query|section)=[A-Za-z0-9._~%+-]*)*)?$"
)
private val AC_ROUTE_REGEX = Regex("^advisory_circulars/[A-Za-z0-9._~%+-]+$")
private val VALID_STUDY_MARK_TYPES = setOf("far", "aim", "ac")
private val REFERENCE_PUNCTUATION_REGEX = Regex("[^\\w\\s]")
private val WHITESPACE_SPLIT_REGEX = Regex("\\s+")
private val AIRSPACE_CLASS_REGEX = Regex("\\bclass\\s+([a-g])\\b", RegexOption.IGNORE_CASE)
private val TWO_DIGIT_REGEX = Regex("^\\d{2}$")
private val SEARCH_STOP_WORDS = setOf(
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
    "were", "will", "with", "or", "this", "which", "not", "but", "can", "all", "any"
)
private val AVIATION_TWO_CHAR_TOKENS = setOf(
    "ac", "ad", "af", "at", "cg", "cl", "da", "dg", "dh", "dp", "el", "ga", "gs",
    "hf", "hz", "ia", "if", "im", "ir", "lf", "mm", "no", "om", "pt", "rc", "rv",
    "sn", "t1", "tf", "vr", "wa", "ws", "wx"
)

private fun normalizedStoredRoute(type: String, route: String): String? {
    return when (type) {
        "far" -> route.takeIf { it.startsWith("far_part/") && it.matches(READER_ROUTE_REGEX) }
        "aim" -> route.takeIf { it.startsWith("aim_chapter/") && it.matches(READER_ROUTE_REGEX) }
        "ac" -> when {
            route == "ac" || route == "advisory_circulars" -> "advisory_circulars"
            route.matches(AC_ROUTE_REGEX) -> route
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

    @Volatile
    private var cachedJson: String? = null
    @Volatile
    private var cachedMarks: List<StudyMark> = emptyList()
    @Volatile
    private var cachedByKey: Map<String, StudyMark> = emptyMap()

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun ensureCache(context: Context): Pair<List<StudyMark>, Map<String, StudyMark>> {
        val json = getPrefs(context).getString(STUDY_MARKS_KEY, null)
        if (json == null) {
            synchronized(this) {
                cachedJson = null
                cachedMarks = emptyList()
                cachedByKey = emptyMap()
            }
            return emptyList<StudyMark>() to emptyMap()
        }
        synchronized(this) {
            if (json == cachedJson) {
                return cachedMarks to cachedByKey
            }
            val parsed = try {
                gson.fromJson<List<StoredStudyMark>>(json, markListType).orEmpty()
                    .mapNotNull { stored ->
                        val type = stored.type?.takeIf { it in VALID_STUDY_MARK_TYPES }
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
            val byKey = parsed.associateBy { it.key }
            cachedJson = json
            cachedMarks = parsed
            cachedByKey = byKey
            return parsed to byKey
        }
    }

    fun getStudyMarks(context: Context): List<StudyMark> {
        return ensureCache(context).first
    }

    fun getStudyMark(context: Context, input: StudyMarkInput): StudyMark? {
        return ensureCache(context).second[input.key()]
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

    fun toggleReviewed(context: Context, input: StudyMarkInput): List<StudyMark> {
        return upsert(context, input) { mark ->
            mark.copy(reviewedAt = if (mark.reviewedAt != null) null else System.currentTimeMillis())
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
        val serialized = gson.toJson(marks)
        cachedJson = serialized
        cachedMarks = marks
        cachedByKey = marks.associateBy { it.key }
        getPrefs(context).edit { putString(STUDY_MARKS_KEY, serialized) }
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
    
    // Thread-safe cached data
    @Volatile private var _farIndex: FARIndex? = null
    @Volatile private var _farParts: List<FARPart>? = null
    private val _farPartsByNumber = java.util.concurrent.ConcurrentHashMap<Int, FARPart>()
    @Volatile private var _aimIndex: AIMIndex? = null
    @Volatile private var _aimChapters: List<AIMChapter>? = null
    private val _aimChaptersByNumber = java.util.concurrent.ConcurrentHashMap<Int, AIMChapter>()
    @Volatile private var _quizzes: List<Quiz>? = null
    @Volatile private var _flashcardDecks: List<FlashcardDeck>? = null
    @Volatile private var _pcgTerms: List<PCGTerm>? = null
    @Volatile private var _studyPaths: List<StudyPath>? = null
    @Volatile private var _advisoryCirculars: List<AdvisoryCircular>? = null
    @Volatile private var _acSearchIndex: ACInvertedIndex? = null
    @Volatile private var _sourceStatus: SourceStatusData? = null
    
    // Stream JSON directly into Gson without intermediate full-file String allocation.
    private inline fun <reified T> loadJson(fileName: String): T? {
        return try {
            context.assets.open(fileName).bufferedReader().use { reader ->
                gson.fromJson(reader, T::class.java)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private inline fun <reified T> requireJson(fileName: String): T {
        return context.assets.open(fileName).bufferedReader().use { reader ->
            requireNotNull(gson.fromJson(reader, T::class.java)) {
                "Bundled data is empty: $fileName"
            }
        }
    }

    private fun loadACSearchIndex(): ACInvertedIndex {
        _acSearchIndex?.let { return it }
        synchronized(this) {
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
    }

    fun loadFARPart(partNumber: Int, forceRefresh: Boolean = false): Result<FARPart?> = runCatching {
        if (!forceRefresh) {
            _farPartsByNumber[partNumber]?.let { return@runCatching it }
            _farParts?.firstOrNull { it.part == partNumber }?.let {
                _farPartsByNumber[partNumber] = it
                return@runCatching it
            }
        }

        val index = if (forceRefresh) {
            requireJson<FARIndex>("far/index.json").also { _farIndex = it }
        } else {
            _farIndex ?: requireJson<FARIndex>("far/index.json").also { _farIndex = it }
        }
        if (index.parts.none { it.part == partNumber }) {
            return@runCatching null
        }

        val part = requireJson<FARPart>("far/part$partNumber.json")
        _farPartsByNumber[partNumber] = part
        part
    }

    fun loadFARParts(forceRefresh: Boolean = false): Result<List<FARPart>> = runCatching {
        if (!forceRefresh) {
            _farParts?.let { return@runCatching it }
        }
        synchronized(this) {
            if (!forceRefresh) {
                _farParts?.let { return@runCatching it }
            }
            val index = requireJson<FARIndex>("far/index.json")
            _farIndex = index
            val parts = index.parts
                .map { it.part }
                .distinct()
                .sorted()
                .map { partNum ->
                    if (!forceRefresh) {
                        _farPartsByNumber[partNum]?.let { return@map it }
                    }
                    requireJson<FARPart>("far/part$partNum.json").also {
                        _farPartsByNumber[partNum] = it
                    }
                }
                .sortedBy { it.part }
            _farParts = parts
            if (forceRefresh) _searchCorpus = null
            parts
        }
    }

    fun loadAIMChapter(chapterNumber: Int, forceRefresh: Boolean = false): Result<AIMChapter?> = runCatching {
        if (!forceRefresh) {
            _aimChaptersByNumber[chapterNumber]?.let { return@runCatching it }
            _aimChapters?.firstOrNull { it.chapter == chapterNumber }?.let {
                _aimChaptersByNumber[chapterNumber] = it
                return@runCatching it
            }
        }

        val index = if (forceRefresh) {
            requireJson<AIMIndex>("aim/index.json").also { _aimIndex = it }
        } else {
            _aimIndex ?: requireJson<AIMIndex>("aim/index.json").also { _aimIndex = it }
        }
        if (index.chapters.none { it.chapter == chapterNumber }) {
            return@runCatching null
        }

        val chapter = requireJson<AIMChapter>("aim/chapter$chapterNumber.json")
        _aimChaptersByNumber[chapterNumber] = chapter
        chapter
    }

    fun loadAIMChapters(forceRefresh: Boolean = false): Result<List<AIMChapter>> = runCatching {
        if (!forceRefresh) {
            _aimChapters?.let { return@runCatching it }
        }
        synchronized(this) {
            if (!forceRefresh) {
                _aimChapters?.let { return@runCatching it }
            }
            val index = requireJson<AIMIndex>("aim/index.json")
            _aimIndex = index
            val chapters = index.chapters
                .map { it.chapter }
                .distinct()
                .sorted()
                .map { chapterNum ->
                    if (!forceRefresh) {
                        _aimChaptersByNumber[chapterNum]?.let { return@map it }
                    }
                    requireJson<AIMChapter>("aim/chapter$chapterNum.json").also {
                        _aimChaptersByNumber[chapterNum] = it
                    }
                }
                .sortedBy { it.chapter }
            _aimChapters = chapters
            if (forceRefresh) _searchCorpus = null
            chapters
        }
    }

    fun loadFlashcardDecks(forceRefresh: Boolean = false): Result<List<FlashcardDeck>> = runCatching {
        if (!forceRefresh) {
            _flashcardDecks?.let { return@runCatching it }
        }
        synchronized(this) {
            if (!forceRefresh) {
                _flashcardDecks?.let { return@runCatching it }
            }
            val deckFiles = context.assets.list("flashcards")
                ?.filter { it.endsWith(".json") }
                ?.sorted()
                .orEmpty()
            val decks = deckFiles.map { requireJson<FlashcardDeck>("flashcards/$it") }
            _flashcardDecks = decks
            if (forceRefresh) _searchCorpus = null
            decks
        }
    }

    fun loadAdvisoryCirculars(forceRefresh: Boolean = false): Result<List<AdvisoryCircular>> = runCatching {
        if (!forceRefresh) {
            _advisoryCirculars?.let { return@runCatching it }
        }
        synchronized(this) {
            if (!forceRefresh) {
                _advisoryCirculars?.let { return@runCatching it }
            }
            val circulars = requireJson<AdvisoryCircularsData>("advisory-circulars/index.json").items
            _advisoryCirculars = circulars
            if (forceRefresh) _searchCorpus = null
            circulars
        }
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
        synchronized(this) {
            if (!forceRefresh) {
                _pcgTerms?.let { return@runCatching it }
            }
            val terms = requireJson<PCGData>("aim/pcg.json").terms
            _pcgTerms = terms
            if (forceRefresh) _searchCorpus = null
            terms
        }
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
        _quizzes?.let { return it }
        synchronized(this) {
            _quizzes?.let { return it }

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
            return quizzes
        }
    }
    
    // Flashcard Decks
    fun getFlashcardDecks(): List<FlashcardDeck> {
        return loadFlashcardDecks().getOrElse { emptyList() }
    }

    fun getStudyPaths(): List<StudyPath> {
        _studyPaths?.let { return it }
        synchronized(this) {
            _studyPaths?.let { return it }
            val data = loadJson<StudyPathsData>("study-paths.json")
            val paths = data?.paths.orEmpty().filter { it.references.isNotEmpty() }
            _studyPaths = paths
            return paths
        }
    }

    fun getAdvisoryCirculars(): List<AdvisoryCircular> {
        return loadAdvisoryCirculars().getOrElse { emptyList() }
    }

    fun getAdvisoryCircularContent(advisoryCircular: AdvisoryCircular): AdvisoryCircularContent? {
        return loadAdvisoryCircularContent(advisoryCircular).getOrNull()
    }

    fun getSourceStatus(): SourceStatusData? {
        _sourceStatus?.let { return it }
        synchronized(this) {
            _sourceStatus?.let { return it }
            val status = loadJson<SourceStatusData>("source-status.json")
            _sourceStatus = status
            return status
        }
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
    
    private data class IndexedSearchDoc(
        val type: String,
        val displayTitle: String,
        val reference: String,
        val link: String,
        val snippetSource: String,
        val lowerTitle: String,
        val lowerDocument: String
    )

    @Volatile
    private var _searchCorpus: List<IndexedSearchDoc>? = null

    private fun getOrBuildSearchCorpus(
        farParts: List<FARPart>,
        aimChapters: List<AIMChapter>,
        pcgTerms: List<PCGTerm>,
        flashcardDecks: List<FlashcardDeck>,
        advisoryCirculars: List<AdvisoryCircular>
    ): List<IndexedSearchDoc> {
        _searchCorpus?.let { return it }
        synchronized(this) {
            _searchCorpus?.let { return it }
            val docs = ArrayList<IndexedSearchDoc>(9000)

            fun normalizeForSearch(raw: String): String {
                val lower = raw.lowercase()
                val withAirspace = AIRSPACE_CLASS_REGEX.replace(lower) { m ->
                    "${m.value} class_${m.groupValues[1].lowercase()}"
                }
                val dehyphenated = withAirspace.replace('-', ' ')
                return "$withAirspace $dehyphenated"
            }

            fun addDoc(
                type: String,
                displayTitle: String,
                searchTitle: String,
                searchContent: String,
                snippetSource: String,
                reference: String,
                link: String
            ) {
                val lowerTitle = searchTitle.lowercase()
                val normalizedDoc = normalizeForSearch("$searchTitle $reference $searchContent")
                docs.add(
                    IndexedSearchDoc(
                        type = type,
                        displayTitle = displayTitle,
                        reference = reference,
                        link = link,
                        snippetSource = snippetSource,
                        lowerTitle = lowerTitle,
                        lowerDocument = normalizedDoc
                    )
                )
            }

            fun farSectionSearchTitle(section: FARSection): String {
                val normalizedReference = section.section.replace(REFERENCE_PUNCTUATION_REGEX, "")
                return "${section.title} ${section.section} $normalizedReference far"
            }

            fun aimSectionSearchTitle(section: AIMSection): String {
                val normalizedReference = section.section.replace(REFERENCE_PUNCTUATION_REGEX, "")
                return "${section.section} $normalizedReference ${section.title} aim"
            }

            for (part in farParts) {
                part.sections?.forEach { section ->
                    val text = section.searchableText
                    addDoc("far", "§ ${section.section} ${section.title}", farSectionSearchTitle(section), text, text, part.cfr, "far/${part.part}#${section.section}")
                }
                part.subparts?.forEach { subpart ->
                    subpart.sections.forEach { section ->
                        val text = section.searchableText
                        addDoc("far", "§ ${section.section} ${section.title}", farSectionSearchTitle(section), text, text, part.cfr, "far/${part.part}#${section.section}")
                    }
                }
                part.appendices?.forEach { appendix ->
                    val text = appendix.searchableText
                    addDoc("far", appendix.title, "${appendix.appendix} ${appendix.title} far", text, text, part.cfr, "far/${part.part}#${appendix.appendix}")
                }
            }
            for (chapter in aimChapters) {
                val ref = "AIM ${formatAIMChapterLabel(chapter.chapter)}"
                for (section in chapter.sections) {
                    val text = section.searchableText
                    addDoc("aim", "${section.section} ${section.title}", aimSectionSearchTitle(section), text, text, ref, "aim/${chapter.chapter}#${section.section}")
                }
            }
            for (term in pcgTerms) {
                addDoc("pcg", term.term, term.term, term.definition, term.definition, "Pilot/Controller Glossary", "glossary#${term.term}")
            }
            for (deck in flashcardDecks) {
                for (card in deck.cards) {
                    val searchContent = "${card.back} ${card.reference} ${deck.title}"
                    addDoc("flashcard", card.front, card.front, searchContent, card.back, card.reference, "flashcard_deck/${deck.id}")
                }
            }
            for (ac in advisoryCirculars) {
                val meta = advisoryCircularSearchText(ac)
                addDoc("ac-idf", "AC ${ac.number} ${ac.title}", "AC ${ac.number} ${ac.title}", meta, ac.summary, "FAA Advisory Circular", "advisory_circulars#${ac.id}")
            }
            _searchCorpus = docs
            return docs
        }
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

        val corpus = getOrBuildSearchCorpus(farParts, aimChapters, pcgTerms, flashcardDecks, advisoryCirculars)
        val totalDocs = corpus.size.toDouble()

        val docFrequency = tokens.associateWith { token ->
            var count = 0
            for (doc in corpus) {
                if (doc.lowerDocument.contains(token)) count++
            }
            count.coerceAtLeast(1)
        }

        data class ScoredCandidate(
            val type: String,
            val title: String,
            val reference: String,
            val link: String,
            val snippetSource: String?,
            val staticContent: String?,
            val score: Double
        )

        val scoredCandidates = mutableListOf<ScoredCandidate>()

        for (doc in corpus) {
            if (doc.type == "ac-idf") continue
            val score = calculateTfIdfScore(doc.lowerTitle, doc.lowerDocument, tokens, docFrequency, totalDocs)
            if (score > 0) {
                scoredCandidates.add(
                    ScoredCandidate(
                        type = doc.type,
                        title = doc.displayTitle,
                        reference = doc.reference,
                        link = doc.link,
                        snippetSource = doc.snippetSource,
                        staticContent = null,
                        score = score
                    )
                )
            }
        }

        // Search AC full text through compact postings, then rank with bundled metadata.
        for (candidate in rankAdvisoryCircularCandidates(tokens, acSearchIndex, advisoryCirculars)) {
            val ac = advisoryCirculars[candidate.documentId]
            scoredCandidates.add(
                ScoredCandidate(
                    type = "ac",
                    title = "AC ${ac.number} ${ac.title}",
                    reference = "FAA Advisory Circular",
                    link = "advisory_circulars#${ac.id}",
                    snippetSource = null,
                    staticContent = if (candidate.matchedFullText) {
                        "Full-text match. ${ac.summary}"
                    } else {
                        ac.summary
                    },
                    score = candidate.score
                )
            )
        }

        // Sort by score descending, retain up to 50 per category so category filter chips never vanish
        // when one catalog dominates, then generate contextual snippets only for displayed hits.
        val sorted = scoredCandidates.sortedWith(
            compareByDescending<ScoredCandidate> { it.score }
                .thenBy { it.type }
                .thenBy { it.reference }
                .thenBy { it.title }
        )
        val perTypeCounts = mutableMapOf<String, Int>()
        val selected = mutableListOf<ScoredCandidate>()
        for (candidate in sorted) {
            val count = perTypeCounts[candidate.type] ?: 0
            if (count < 50) {
                perTypeCounts[candidate.type] = count + 1
                selected.add(candidate)
            }
        }

        return selected.map { candidate ->
            SearchResult(
                type = candidate.type,
                title = candidate.title,
                content = candidate.staticContent
                    ?: generateContextualSnippet(candidate.snippetSource.orEmpty(), lowercased, tokens),
                reference = candidate.reference,
                link = candidate.link
            )
        }
    }

    /**
     * Tokenize search query into individual terms, preserving aviation 2-char codes,
     * part numbers, airspace classes, and split hyphenated words.
     */
    private fun tokenize(text: String): List<String> {
        val tokens = LinkedHashSet<String>()
        val remaining = AIRSPACE_CLASS_REGEX.replace(text) { match ->
            tokens.add("class_${match.groupValues[1].lowercase()}")
            " "
        }
        for (raw in remaining.split(WHITESPACE_SPLIT_REGEX)) {
            if (raw.isBlank()) continue
            val lower = raw.lowercase()
            if (lower.contains('-') && lower.any { it.isLetter() }) {
                for (part in lower.split('-')) {
                    val cleanPart = part.replace(REFERENCE_PUNCTUATION_REGEX, "")
                    if ((cleanPart.length > 2 && cleanPart !in SEARCH_STOP_WORDS) ||
                        TWO_DIGIT_REGEX.matches(cleanPart) ||
                        cleanPart in AVIATION_TWO_CHAR_TOKENS
                    ) {
                        tokens.add(cleanPart)
                    }
                }
            } else {
                val cleaned = lower.replace(REFERENCE_PUNCTUATION_REGEX, "")
                if ((cleaned.length > 2 && cleaned !in SEARCH_STOP_WORDS) ||
                    TWO_DIGIT_REGEX.matches(cleaned) ||
                    cleaned in AVIATION_TWO_CHAR_TOKENS
                ) {
                    tokens.add(cleaned)
                }
            }
        }
        return tokens.toList()
    }

    /**
     * Calculate TF-IDF score for a pre-lowercased document
     */
    private fun calculateTfIdfScore(
        lowerTitle: String,
        lowerDocument: String,
        tokens: List<String>,
        docFrequency: Map<String, Int>,
        totalDocs: Double
    ): Double {
        var score = 0.0

        for (token in tokens) {
            if (!lowerDocument.contains(token)) return 0.0

            val tf = countOccurrences(lowerDocument, token)
            val tfNormalized = if (tf > 0) 1 + kotlin.math.ln(tf.toDouble()) else 0.0

            val df = docFrequency[token] ?: 1
            val idf = kotlin.math.ln(totalDocs / df) + 1.0

            score += tfNormalized * idf

            if (lowerTitle.contains(token)) {
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
    private fun generateContextualSnippet(
        content: String,
        searchTerm: String,
        tokens: List<String> = emptyList(),
        maxLength: Int = 200
    ): String {
        if (content.isEmpty()) return ""
        
        val lowerContent = content.lowercase()
        var matchIndex = lowerContent.indexOf(searchTerm)
        var matchLength = searchTerm.length

        if (matchIndex == -1 && tokens.isNotEmpty()) {
            for (token in tokens) {
                val needle = token.replace('_', ' ')
                val idx = lowerContent.indexOf(needle)
                if (idx >= 0) {
                    matchIndex = idx
                    matchLength = needle.length
                    break
                }
            }
        }
        
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
        var end = minOf(content.length, matchIndex + matchLength + halfLength)
        
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
