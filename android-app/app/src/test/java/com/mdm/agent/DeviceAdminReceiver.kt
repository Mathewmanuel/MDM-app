package com.mdm.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class DeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        Toast.makeText(context, "MDM Agent activated", Toast.LENGTH_SHORT).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Toast.makeText(context, "MDM Agent deactivated", Toast.LENGTH_SHORT).show()
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        // Device provisioning complete - launch main activity
        val launchIntent = Intent(context, MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launchIntent)
    }
}