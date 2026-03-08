package com.mdm.agent

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject

class QrGeneratorActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_qr_generator)

        val qrImageView = findViewById<ImageView>(R.id.qrImageView)
        val instructionText = findViewById<TextView>(R.id.instructionText)

        instructionText.text = "Scan this QR code during device setup to enroll"

        val qrContent = generateProvisioningJson()
        val bitmap = generateQrCode(qrContent)
        qrImageView.setImageBitmap(bitmap)
    }

    private fun generateProvisioningJson(): String {
        val json = JSONObject()
        json.put(
            "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME",
            "com.mdm.agent/.DeviceAdminReceiver"
        )
        json.put(
            "android.app.extra.PROVISIONING_SKIP_ENCRYPTION",
            false
        )
        json.put(
            "android.app.extra.PROVISIONING_WIFI_SSID",
            "YourWifiName"
        )
        json.put(
            "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE",
            JSONObject().apply {
                put("enrollment_token", "mdm-token-2024")
                put("server_url", "http://10.0.2.2:8081")
            }
        )
        return json.toString()
    }

    private fun generateQrCode(content: String): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, 512, 512, hints)
        val bitmap = Bitmap.createBitmap(512, 512, Bitmap.Config.RGB_565)
        for (x in 0 until 512) {
            for (y in 0 until 512) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
    }
}