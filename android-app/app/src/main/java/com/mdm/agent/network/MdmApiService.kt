package com.mdm.agent.network

import com.mdm.agent.model.AppInventoryRequest
import com.mdm.agent.model.DeviceInfoRequest
import com.mdm.agent.model.EnrollRequest
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface MdmApiService {

    @POST("enroll")
    suspend fun enrollDevice(@Body request: EnrollRequest): Response<ResponseBody>

    @POST("enroll-qr")
    suspend fun enrollViaQr(@Body body: Map<String, String>): Response<ResponseBody>

    @POST("device-info")
    suspend fun sendDeviceInfo(@Body request: DeviceInfoRequest): Response<ResponseBody>

    @POST("app-inventory")
    suspend fun sendAppInventory(@Body apps: List<AppInventoryRequest>): Response<ResponseBody>
}