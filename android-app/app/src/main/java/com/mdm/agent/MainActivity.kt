package com.mdm.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.work.*
import com.mdm.agent.model.AppInventoryRequest
import com.mdm.agent.model.DeviceInfoRequest
import com.mdm.agent.model.EnrollRequest
import com.mdm.agent.network.RetrofitClient
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var statusDot: View
    private lateinit var enrollButton: Button
    private lateinit var syncNowButton: Button
    private lateinit var tokenInput: EditText
    private lateinit var deviceInfoCard: LinearLayout
    private lateinit var deviceInfoText: TextView
    private lateinit var deviceOwnerText: TextView
    private lateinit var lastSyncedText: TextView
    private lateinit var appCountText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        statusDot = findViewById(R.id.statusDot)
        enrollButton = findViewById(R.id.enrollButton)
        syncNowButton = findViewById(R.id.syncNowButton)
        tokenInput = findViewById(R.id.tokenInput)
        deviceInfoCard = findViewById(R.id.deviceInfoCard)
        deviceInfoText = findViewById(R.id.deviceInfoText)
        deviceOwnerText = findViewById(R.id.deviceOwnerText)
        lastSyncedText = findViewById(R.id.lastSyncedText)
        appCountText = findViewById(R.id.appCountText)

        // Request permissions
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(android.Manifest.permission.READ_PHONE_STATE), 1001
            )
        }

        updateDeviceOwnerStatus()
        updateAppCount()
        updateLastSynced()

        val savedDeviceId = getSavedDeviceId()
        if (savedDeviceId != null) {
            statusText.text = "Enrolled — $savedDeviceId"
            statusDot.setBackgroundColor(Color.parseColor("#00CC66"))
            showDeviceInfo(savedDeviceId)
        }

        val isQrProvisioned = intent.getBooleanExtra("qr_provisioned", false)
        if (isQrProvisioned && savedDeviceId == null) {
            autoEnrollAfterQr()
        }

        enrollButton.setOnClickListener {
            val token = tokenInput.text.toString().trim()
            if (token.isEmpty()) {
                statusText.text = "Please enter an enrollment token"
                return@setOnClickListener
            }
            enrollDevice(token)
        }

        syncNowButton.setOnClickListener {
            val deviceId = getSavedDeviceId()
            if (deviceId == null) {
                statusText.text = "Device not enrolled yet"
                return@setOnClickListener
            }
            syncNow(deviceId)
        }

        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            ).build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "mdm_sync", ExistingPeriodicWorkPolicy.KEEP, syncRequest
        )
    }

    private fun updateDeviceOwnerStatus() {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val componentName = ComponentName(this, DeviceAdminReceiver::class.java)
        val isDeviceOwner = dpm.isDeviceOwnerApp(packageName)
        val isAdmin = dpm.isAdminActive(componentName)
        when {
            isDeviceOwner -> {
                deviceOwnerText.text = "YES"
                deviceOwnerText.setTextColor(Color.parseColor("#00CC66"))
            }
            isAdmin -> {
                deviceOwnerText.text = "ADMIN"
                deviceOwnerText.setTextColor(Color.parseColor("#FF9900"))
            }
            else -> {
                deviceOwnerText.text = "NO"
                deviceOwnerText.setTextColor(Color.parseColor("#FF3D57"))
            }
        }
    }

    private fun updateAppCount() {
        val count = packageManager.getInstalledPackages(0).size
        appCountText.text = "$count apps detected"
    }

    private fun updateLastSynced() {
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        val lastSync = prefs.getLong("last_synced", 0L)
        lastSyncedText.text = if (lastSync == 0L) {
            "Never"
        } else {
            SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault()).format(Date(lastSync))
        }
    }

    private fun saveLastSynced() {
        getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            .edit().putLong("last_synced", System.currentTimeMillis()).apply()
    }

    private fun syncNow(deviceId: String) {
        lifecycleScope.launch {
            try {
                statusText.text = "Syncing..."
                syncNowButton.isEnabled = false

                RetrofitClient.instance.sendDeviceInfo(
                    DeviceInfoRequest(
                        deviceId = deviceId,
                        model = Build.MODEL,
                        manufacturer = Build.MANUFACTURER,
                        osVersion = Build.VERSION.RELEASE,
                        sdkVersion = Build.VERSION.SDK_INT.toString(),
                        serialNumber = getSerialNumber(),
                        uuid = deviceId,
                        imei = getImei()
                    )
                )

                val apps = getInstalledApps(deviceId)
                RetrofitClient.instance.sendAppInventory(apps)

                saveLastSynced()
                updateLastSynced()
                statusText.text = "Sync complete!"
                statusDot.setBackgroundColor(Color.parseColor("#00CC66"))
                syncNowButton.isEnabled = true
            } catch (e: Exception) {
                statusText.text = "Sync failed: ${e.message}"
                syncNowButton.isEnabled = true
            }
        }
    }

    private fun autoEnrollAfterQr() {
        val deviceId = UUID.randomUUID().toString().also { saveDeviceId(it) }
        lifecycleScope.launch {
            try {
                statusText.text = "Auto-enrolling via QR..."
                // Register device via QR enrollment endpoint
                RetrofitClient.instance.enrollViaQr(mapOf("deviceId" to deviceId))
                RetrofitClient.instance.sendDeviceInfo(
                    DeviceInfoRequest(
                        deviceId = deviceId,
                        model = Build.MODEL,
                        manufacturer = Build.MANUFACTURER,
                        osVersion = Build.VERSION.RELEASE,
                        sdkVersion = Build.VERSION.SDK_INT.toString(),
                        serialNumber = getSerialNumber(),
                        uuid = deviceId,
                        imei = getImei()
                    )
                )

                val apps = getInstalledApps(deviceId)
                RetrofitClient.instance.sendAppInventory(apps)

                saveLastSynced()
                updateLastSynced()
                statusText.text = "Enrolled via QR — $deviceId"
                statusDot.setBackgroundColor(Color.parseColor("#00CC66"))
                showDeviceInfo(deviceId)
            } catch (e: Exception) {
                statusText.text = "Auto-enroll failed: ${e.message}"
            }
        }
    }

    private fun enrollDevice(token: String) {
        val deviceId = getSavedDeviceId() ?: UUID.randomUUID().toString().also { saveDeviceId(it) }
        lifecycleScope.launch {
            try {
                statusText.text = "Enrolling device..."
                statusDot.setBackgroundColor(Color.parseColor("#FF9900"))

                val enrollResponse = RetrofitClient.instance.enrollDevice(
                    EnrollRequest(deviceId, token)
                )

                if (enrollResponse.isSuccessful) {
                    RetrofitClient.instance.sendDeviceInfo(
                        DeviceInfoRequest(
                            deviceId = deviceId,
                            model = Build.MODEL,
                            manufacturer = Build.MANUFACTURER,
                            osVersion = Build.VERSION.RELEASE,
                            sdkVersion = Build.VERSION.SDK_INT.toString(),
                            serialNumber = getSerialNumber(),
                            uuid = deviceId,
                            imei = getImei()
                        )
                    )

                    val apps = getInstalledApps(deviceId)
                    RetrofitClient.instance.sendAppInventory(apps)

                    saveLastSynced()
                    updateLastSynced()
                    statusText.text = "Enrolled — $deviceId"
                    statusDot.setBackgroundColor(Color.parseColor("#00CC66"))
                    showDeviceInfo(deviceId)
                } else {
                    statusText.text = "Enrollment failed. Invalid token."
                    statusDot.setBackgroundColor(Color.parseColor("#FF3D57"))
                }
            } catch (e: Exception) {
                statusText.text = "Network error: ${e.message}"
                statusDot.setBackgroundColor(Color.parseColor("#FF3D57"))
            }
        }
    }

    private fun getSerialNumber(): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED
                ) Build.getSerial() else "PERMISSION_DENIED"
            } else {
                @Suppress("DEPRECATION") Build.SERIAL
            }
        } catch (e: Exception) { "UNAVAILABLE" }
    }

    private fun getImei(): String {
        return try {
            val tm = getSystemService(TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED
                ) tm.imei ?: "UNAVAILABLE" else "PERMISSION_DENIED"
            } else {
                @Suppress("DEPRECATION") tm.deviceId ?: "UNAVAILABLE"
            }
        } catch (e: Exception) { "UNAVAILABLE" }
    }

    private fun getDeviceType(): String {
        val uiModeManager = getSystemService(UI_MODE_SERVICE) as android.app.UiModeManager
        return when (uiModeManager.currentModeType) {
            android.content.res.Configuration.UI_MODE_TYPE_TELEVISION -> "TV"
            android.content.res.Configuration.UI_MODE_TYPE_WATCH -> "WATCH"
            android.content.res.Configuration.UI_MODE_TYPE_CAR -> "CAR"
            else -> {
                val screenLayout = resources.configuration.screenLayout and
                        android.content.res.Configuration.SCREENLAYOUT_SIZE_MASK
                if (screenLayout >= android.content.res.Configuration.SCREENLAYOUT_SIZE_LARGE) "TABLET" else "PHONE"
            }
        }
    }

    private fun showDeviceInfo(deviceId: String) {
        deviceInfoCard.visibility = View.VISIBLE
        deviceInfoText.text = """
Model       ${Build.MODEL}
Maker       ${Build.MANUFACTURER}
Android     ${Build.VERSION.RELEASE}
SDK         ${Build.VERSION.SDK_INT}
Serial      ${getSerialNumber()}
IMEI        ${getImei()}
Type        ${getDeviceType()}
ID          $deviceId
        """.trimIndent()
    }

    private fun getInstalledApps(deviceId: String): List<AppInventoryRequest> {
        val pm = packageManager
        return pm.getInstalledPackages(0).map { pkg ->
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
    }

    private fun getSavedDeviceId(): String? =
        getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE).getString("device_id", null)

    private fun saveDeviceId(deviceId: String) =
        getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
            .edit().putString("device_id", deviceId).apply()
}