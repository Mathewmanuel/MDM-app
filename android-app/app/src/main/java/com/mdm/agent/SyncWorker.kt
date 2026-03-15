package com.mdm.agent

import android.content.Context
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mdm.agent.model.AppInventoryRequest
import com.mdm.agent.model.DeviceInfoRequest
import com.mdm.agent.network.RetrofitClient

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        return try {
            val context = applicationContext
            val prefs = context.getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            val deviceId = prefs.getString("device_id", null) ?: return Result.failure()

            // Sync device info
            RetrofitClient.instance.sendDeviceInfo(
                DeviceInfoRequest(
                    deviceId = deviceId,
                    model = Build.MODEL,
                    manufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE,
                    sdkVersion = Build.VERSION.SDK_INT.toString(),
                    serialNumber = "BACKGROUND_SYNC",
                    uuid = deviceId,
                    imei = "UNAVAILABLE"
                )
            )

            // Sync app inventory
            val pm = context.packageManager
            val apps = pm.getInstalledPackages(0).map { pkg ->
                AppInventoryRequest(
                    deviceId = deviceId,
                    appName = pkg.applicationInfo?.loadLabel(pm).toString(),
                    packageName = pkg.packageName,
                    versionName = pkg.versionName ?: "N/A",
                    versionCode = pkg.versionCode,
                    installSource = "unknown",
                    isSystemApp = false
                )
            }
            RetrofitClient.instance.sendAppInventory(apps)

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}