package com.mdm.agent

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import android.widget.LinearLayout
import androidx.lifecycle.lifecycleScope
import com.mdm.agent.model.AppInventoryRequest
import com.mdm.agent.model.DeviceInfoRequest
import com.mdm.agent.model.EnrollRequest
import com.mdm.agent.network.RetrofitClient
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var enrollButton: Button
    private lateinit var generateQrButton: Button
    private lateinit var tokenInput: EditText
    private lateinit var deviceInfoCard: LinearLayout
    private lateinit var deviceInfoText: TextView
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        enrollButton = findViewById(R.id.enrollButton)
        generateQrButton = findViewById(R.id.generateQrButton)
        tokenInput = findViewById(R.id.tokenInput)
        deviceInfoCard = findViewById(R.id.deviceInfoCard)
        deviceInfoText = findViewById(R.id.deviceInfoText)

        // Request permissions
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(android.Manifest.permission.READ_PHONE_STATE),
                1001
            )
        }

        val savedDeviceId = getSavedDeviceId()
        if (savedDeviceId != null) {
            statusText.text = "✅ Already enrolled\nDevice ID: $savedDeviceId"
            showDeviceInfo(savedDeviceId)
        }

        enrollButton.setOnClickListener {
            val token = tokenInput.text.toString().trim()
            if (token.isEmpty()) {
                statusText.text = "❌ Please enter an enrollment token"
                return@setOnClickListener
            }
            enrollDevice(token)
        }

        generateQrButton.setOnClickListener {
            val intent = Intent(this, QrGeneratorActivity::class.java)
            startActivity(intent)
        }
    }

    private fun enrollDevice(token: String) {
        val deviceId = getSavedDeviceId() ?: UUID.randomUUID().toString().also { saveDeviceId(it) }

        lifecycleScope.launch {
            try {
                statusText.text = "⏳ Enrolling device..."

                val enrollResponse = RetrofitClient.instance.enrollDevice(
                    EnrollRequest(deviceId, token)
                )

                if (enrollResponse.isSuccessful) {
                    statusText.text = "⏳ Sending device info..."

                    val deviceInfoResponse = RetrofitClient.instance.sendDeviceInfo(
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

                    if (deviceInfoResponse.isSuccessful) {
                        statusText.text = "⏳ Sending app inventory..."

                        val apps = getInstalledApps(deviceId)
                        val appResponse = RetrofitClient.instance.sendAppInventory(apps)

                        if (appResponse.isSuccessful) {
                            statusText.text = "✅ Device enrolled successfully!\nDevice ID: $deviceId"
                            showDeviceInfo(deviceId)
                        }
                    }
                } else {
                    statusText.text = "❌ Enrollment failed. Check your token."
                }
            } catch (e: Exception) {
                statusText.text = "❌ Network error: ${e.message}"
            }
        }
    }

    private fun getSerialNumber(): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    Build.getSerial()
                } else "PERMISSION_DENIED"
            } else {
                @Suppress("DEPRECATION")
                Build.SERIAL
            }
        } catch (e: Exception) {
            "UNAVAILABLE"
        }
    }

    private fun getImei(): String {
        return try {
            val telephonyManager = getSystemService(TELEPHONY_SERVICE) as android.telephony.TelephonyManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    telephonyManager.imei ?: "UNAVAILABLE"
                } else "PERMISSION_DENIED"
            } else {
                @Suppress("DEPRECATION")
                telephonyManager.deviceId ?: "UNAVAILABLE"
            }
        } catch (e: Exception) {
            "UNAVAILABLE"
        }
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
                if (screenLayout >= android.content.res.Configuration.SCREENLAYOUT_SIZE_LARGE) {
                    "TABLET"
                } else {
                    "PHONE"
                }
            }
        }
    }


    private fun showDeviceInfo(deviceId: String) {
        deviceInfoCard.visibility = View.VISIBLE
        deviceInfoText.text = """
        Model: ${Build.MODEL}
        Manufacturer: ${Build.MANUFACTURER}
        Android: ${Build.VERSION.RELEASE}
        SDK: ${Build.VERSION.SDK_INT}
        Serial: ${getSerialNumber()}
        IMEI: ${getImei()}
        Type: ${getDeviceType()}
        Device ID: $deviceId
    """.trimIndent()
    }

    private fun getInstalledApps(deviceId: String): List<AppInventoryRequest> {
        val pm = packageManager
        val packages = pm.getInstalledPackages(0)
        return packages.map { pkg ->
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

    private fun getSavedDeviceId(): String? {
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        return prefs.getString("device_id", null)
    }

    private fun saveDeviceId(deviceId: String) {
        val prefs = getSharedPreferences("mdm_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("device_id", deviceId).apply()
    }
}