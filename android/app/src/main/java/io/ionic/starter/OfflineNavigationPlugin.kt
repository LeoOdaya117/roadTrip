package io.ionic.starter

import android.speech.tts.TextToSpeech
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.valhalla.valhalla.Valhalla
import com.valhalla.valhalla.config.ValhallaConfigFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@CapacitorPlugin(name = "OfflineNavigation")
class OfflineNavigationPlugin : Plugin() {
    private val routingExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    @Volatile private var valhalla: Valhalla? = null
    @Volatile private var engineError: String? = null

    private var textToSpeech: TextToSpeech? = null
    private var speechReady = false
    private var pendingSpeech: String? = null

    override fun load() {
        activity.runOnUiThread {
            textToSpeech = TextToSpeech(context) { status ->
                speechReady = status == TextToSpeech.SUCCESS
                if (speechReady) {
                    textToSpeech?.language = Locale.US
                    textToSpeech?.setSpeechRate(1.0f)
                    pendingSpeech?.let(::speakOnMainThread)
                    pendingSpeech = null
                }
            }
        }
    }

    @PluginMethod
    fun availability(call: PluginCall) {
        routingExecutor.execute {
            try {
                val tilesInstalled = tileFile().isFile && tileFile().length() > 0L
                if (tilesInstalled) {
                    getValhalla()
                }
                call.resolve(JSObject().put("available", true).put("offlineAvailable", tilesInstalled))
            } catch (error: Exception) {
                call.resolve(
                    JSObject()
                        .put("available", true)
                        .put("offlineAvailable", false)
                        .put("message", error.message ?: "Offline map data could not be opened."),
                )
            }
        }
    }

    @PluginMethod
    fun downloadTiles(call: PluginCall) {
        val url = call.getString("url")?.trim()
        val expectedSha256 = call.getString("sha256")?.trim()?.lowercase(Locale.US)
        if (url.isNullOrEmpty() || expectedSha256.isNullOrEmpty()) {
            call.reject("A tile download URL and SHA-256 checksum are required.")
            return
        }
        val parsedUrl = try { URL(url) } catch (_: Exception) { null }
        if (parsedUrl?.protocol != "https" || !expectedSha256.matches(Regex("^[a-f0-9]{64}$"))) {
            call.reject("The tile download configuration is invalid.")
            return
        }

        routingExecutor.execute {
            var temporaryFile: File? = null
            try {
                val destination = tileFile()
                val temporary = File(destination.parentFile, "${destination.name}.download")
                temporaryFile = temporary
                temporary.delete()
                val connection = (parsedUrl.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000
                    readTimeout = 60_000
                    instanceFollowRedirects = true
                    requestMethod = "GET"
                }
                try {
                    val status = connection.responseCode
                    if (status !in 200..299) throw IllegalStateException("Tile download failed (HTTP $status).")
                    if (connection.url.protocol != "https") throw IllegalStateException("Tile downloads must use HTTPS.")
                    val total = connection.contentLengthLong
                    var downloaded = 0L
                    connection.inputStream.use { input ->
                        temporary.outputStream().buffered().use { output ->
                            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                            var count = input.read(buffer)
                            while (count >= 0) {
                                if (count > 0) {
                                    output.write(buffer, 0, count)
                                    downloaded += count
                                    if (total > 0L) {
                                        notifyListeners("tileDownloadProgress", JSObject()
                                            .put("downloadedBytes", downloaded)
                                            .put("totalBytes", total)
                                            .put("progress", (downloaded * 100 / total).toInt()))
                                    }
                                }
                                count = input.read(buffer)
                            }
                        }
                    }
                } finally {
                    connection.disconnect()
                }

                if (temporary.length() == 0L || sha256(temporary) != expectedSha256) {
                    temporary.delete()
                    throw IllegalStateException("Downloaded routing data failed its integrity check. Please retry.")
                }
                if (destination.exists() && !destination.delete()) {
                    temporary.delete()
                    throw IllegalStateException("Could not replace the stored routing data.")
                }
                if (!temporary.renameTo(destination)) {
                    temporary.delete()
                    throw IllegalStateException("Could not save the routing data on this device.")
                }
                engineError = null
                valhalla?.close()
                valhalla = null
                call.resolve(JSObject().put("available", true).put("sizeBytes", destination.length()))
            } catch (error: Exception) {
                temporaryFile?.delete()
                call.reject(error.message ?: "Routing data could not be downloaded. Check your connection and retry.", "TILE_DOWNLOAD_FAILED")
            }
        }
    }

    @PluginMethod
    fun route(call: PluginCall) {
        val origin = call.getObject("origin")
        val destination = call.getObject("destination")
        val routingUrl = call.getString("routingUrl")?.trim()
        val originLat = origin?.optDouble("lat", Double.NaN) ?: Double.NaN
        val originLng = origin?.optDouble("lng", Double.NaN) ?: Double.NaN
        val destinationLat = destination?.optDouble("lat", Double.NaN) ?: Double.NaN
        val destinationLng = destination?.optDouble("lng", Double.NaN) ?: Double.NaN

        if (!isCoordinate(originLat, originLng) || !isCoordinate(destinationLat, destinationLng)) {
            call.reject("Origin and destination must contain valid latitude and longitude values.")
            return
        }

        routingExecutor.execute {
            try {
                val request = JSONObject()
                    .put(
                        "locations",
                        JSONArray()
                            .put(JSONObject().put("lat", originLat).put("lon", originLng))
                            .put(JSONObject().put("lat", destinationLat).put("lon", destinationLng)),
                    )
                    .put("costing", "motorcycle")
                    .put("units", "kilometers")
                val response = if (tileFile().isFile && tileFile().length() > 0L) {
                    try {
                        getValhalla().routeRaw(request.toString())
                    } catch (_: Exception) {
                        routeOnline(request.toString(), routingUrl)
                    }
                } else routeOnline(request.toString(), routingUrl)
                call.resolve(JSObject().put("responseJson", response))
            } catch (error: Exception) {
                call.reject(error.message ?: "Routing failed. Check your connection or install offline map data.", "ROUTING_FAILED")
            }
        }
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text")?.trim()
        if (text.isNullOrEmpty()) {
            call.reject("Speech text cannot be empty.")
            return
        }

        activity.runOnUiThread {
            if (speechReady) {
                speakOnMainThread(text)
            } else {
                pendingSpeech = text
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun stopSpeech(call: PluginCall) {
        activity.runOnUiThread {
            pendingSpeech = null
            textToSpeech?.stop()
            call.resolve()
        }
    }

    private fun speakOnMainThread(text: String) {
        textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "roadtrip-navigation")
    }

    private fun getValhalla(): Valhalla {
        val current = valhalla
        if (current != null) return current
        engineError?.let { throw IllegalStateException(it) }

        synchronized(this) {
            val existing = valhalla
            if (existing != null) return existing
            engineError?.let { throw IllegalStateException(it) }

            try {
                val tilesFile = tileFile()
                if (!tilesFile.isFile || tilesFile.length() == 0L) throw IllegalStateException(MISSING_TILES_MESSAGE)

                val config = ValhallaConfigFactory.usingTileExtract(tilesFile.absolutePath)
                return Valhalla(context, config).also { valhalla = it }
            } catch (error: Exception) {
                val message = error.message ?: "The optional offline routing data could not be opened."
                engineError = message
                throw IllegalStateException(message, error)
            }
        }
    }

    private fun tileFile() = File(context.filesDir, "valhalla_tiles.tar")

    private fun routeOnline(requestJson: String, routingUrl: String?): String {
        val endpoint = try { URL(routingUrl) } catch (_: Exception) { null }
        if (endpoint?.protocol != "https") {
            throw IllegalStateException("Online routing is not configured. Check your internet connection or install offline map data.")
        }
        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 25_000
            instanceFollowRedirects = true
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("X-Client-Id", "github.com/LeoOdaya117/roadTrip")
        }
        try {
            connection.outputStream.use { it.write(requestJson.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val responseStream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = responseStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                throw IllegalStateException("Online routing returned HTTP $status. Reconnect or try offline map data.")
            }
            if (response.isBlank()) throw IllegalStateException("Online routing returned an empty response. Try again.")
            return response
        } finally {
            connection.disconnect()
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var count = input.read(buffer)
            while (count >= 0) {
                if (count > 0) digest.update(buffer, 0, count)
                count = input.read(buffer)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun isCoordinate(latitude: Double, longitude: Double): Boolean =
        latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        activity.runOnUiThread {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
            textToSpeech = null
            speechReady = false
            pendingSpeech = null
        }
        routingExecutor.execute {
            synchronized(this) {
                valhalla?.close()
                valhalla = null
            }
        }
        routingExecutor.shutdown()
    }

    private companion object {
        const val MISSING_TILES_MESSAGE =
            "Offline routing data is not installed on this device. Connect to the internet or download the optional regional map."
    }
}
