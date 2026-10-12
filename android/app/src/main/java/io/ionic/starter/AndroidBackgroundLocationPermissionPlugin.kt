package io.ionic.starter

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "AndroidBackgroundLocationPermission",
    permissions = [
        Permission(
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION],
            alias = "backgroundLocation",
        ),
    ],
)
class AndroidBackgroundLocationPermissionPlugin : Plugin() {
    @PluginMethod
    fun checkPermission(call: PluginCall) {
        call.resolve(permissionResult())
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasBackgroundPermission()) {
            call.resolve(permissionResult())
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            explainAndOpenSettings(call)
            return
        }

        requestPermissionForAlias(
            "backgroundLocation",
            call,
            "backgroundLocationPermissionResult",
        )
    }

    @PermissionCallback
    private fun backgroundLocationPermissionResult(call: PluginCall) {
        call.resolve(permissionResult())
    }

    @ActivityCallback
    private fun backgroundLocationSettingsResult(call: PluginCall?, result: ActivityResult) {
        call?.resolve(permissionResult())
    }

    private fun explainAndOpenSettings(call: PluginCall) {
        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle("Allow background location")
                .setMessage(
                    "To keep recording your ride while the screen is locked, allow RoadTrip to access location all the time. In Android settings, choose Location, then Allow all the time. You can skip this and keep tracking while RoadTrip is open.",
                )
                .setNegativeButton("Not now") { _, _ -> call.resolve(permissionResult()) }
                .setPositiveButton("Open settings") { _, _ ->
                    val settingsIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.fromParts("package", context.packageName, null)
                    }
                    try {
                        startActivityForResult(
                            call,
                            settingsIntent,
                            "backgroundLocationSettingsResult",
                        )
                    } catch (error: Exception) {
                        call.reject(
                            "Android location settings could not be opened. You can enable background location in the app settings.",
                            error,
                        )
                    }
                }
                .setOnCancelListener { call.resolve(permissionResult()) }
                .show()
        }
    }

    private fun hasBackgroundPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

    private fun permissionResult(): JSObject = JSObject().put("granted", hasBackgroundPermission())
}
