package com.mdm.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class DeviceInfoRequest {

    @NotBlank
    private String deviceId;

    @NotBlank
    private String model;

    @NotBlank
    private String manufacturer;

    @NotBlank
    private String osVersion;

    private String sdkVersion;
    private String serialNumber;
    private String uuid;
    private String imei;
}