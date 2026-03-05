package com.mdm.agent.model

data class EnrollRequest(
    val deviceId: String,
    val enrollmentToken: String
)

data class DeviceInfoRequest(
    val deviceId: String,
    val model: String,
    val manufacturer: String,
    val osVersion: String,
    val sdkVersion: String,
    val serialNumber: String,
    val uuid: String,
    val imei: String
)

data class AppInventoryRequest(
    val deviceId: String,
    val appName: String,
    val packageName: String,
    val versionName: String,
    val versionCode: Int,
    val installSource: String,
    val isSystemApp: Boolean
)