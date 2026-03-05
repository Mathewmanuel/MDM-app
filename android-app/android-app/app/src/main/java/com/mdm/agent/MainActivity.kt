package com.mdm.agent

import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        enrollButton = findViewById(R.id.enrollButton)

        enrollButton.setOnClickListener {
            enrollDevice()
        }
    }

    private fun enrollDevice() {
        val deviceId = UUID.randomUUID().toString()

        lifecycleScope.launch {
            try {
                statusText.text = "Enrolling device..."

                // Step 1: Enroll
                val enrollResponse = RetrofitClient.instance.enrollDevice(
                    EnrollRequest(deviceId, "mdm-token-2024")
                )

                if (enrollResponse.isSuccessful) {
                    statusText.text = "Enrolled! Sending device info..."

                    // Step 2: Send device info
                    val deviceInfoResponse = RetrofitClient.instance.sendDeviceInfo(
                        DeviceInfoRequest(
                            deviceId = deviceId,
                            model = Build.MODEL,
                            manufacturer = Build.MANUFACTURER,
                            osVersion = Build.VERSION.RELEASE,
                            sdkVersion = Build.VERSION.SDK_INT.toString(),
                            serialNumber = Build.SERIAL,
                            uuid = deviceId,
                            imei = "N/A"
                        )
                    )

                    if (deviceInfoResponse.isSuccessful) {
                        statusText.text = "Device info sent! Sending app inventory..."

                        // Step 3: Send app inventory
                        val apps = getInstalledApps(deviceId)
                        val appResponse = RetrofitClient.instance.sendAppInventory(apps)

                        if (appResponse.isSuccessful) {
                            statusText.text = "✅ All done! Device fully enrolled."
                        }
                    }
                }
            } catch (e: Exception) {
                statusText.text = "❌ Error: ${e.message}"
            }
        }
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
                versionCode = pkg.longVersionCode.toInt(),
                installSource = "unknown",
                isSystemApp = false
            )
        }
    }
}