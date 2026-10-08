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
                getValhalla()
                call.resolve(JSObject().put("available", true))
            } catch (error: Exception) {
                call.resolve(
                    JSObject()
                        .put("available", false)
                        .put("message", error.message ?: MISSING_TILES_MESSAGE),
                )
            }
        }
    }

    @PluginMethod
    fun route(call: PluginCall) {
        val origin = call.getObject("origin")
        val destination = call.getObject("destination")
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
                val response = getValhalla().routeRaw(request.toString())
                call.resolve(JSObject().put("responseJson", response))
            } catch (error: Exception) {
                call.reject(error.message ?: "Offline route calculation failed. Try again.", "ROUTING_FAILED")
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
                val assetName = "valhalla_tiles.tar"
                val assetExists = try {
                    context.assets.open(assetName).use { true }
                } catch (_: Exception) {
                    false
                }
                if (!assetExists) throw IllegalStateException(MISSING_TILES_MESSAGE)

                val tilesFile = File(context.filesDir, assetName)
                if (!tilesFile.isFile || tilesFile.length() == 0L) {
                    context.assets.open(assetName).use { input ->
                        tilesFile.outputStream().use { output -> input.copyTo(output) }
                    }
                }

                val config = ValhallaConfigFactory.usingTileExtract(tilesFile.absolutePath)
                return Valhalla(context, config).also { valhalla = it }
            } catch (error: Exception) {
                val message = error.message ?: "The bundled offline routing tiles could not be opened."
                engineError = message
                throw IllegalStateException(message, error)
            }
        }
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
            "Offline routing is unavailable because this app does not include the Valhalla map tiles."
    }
}
