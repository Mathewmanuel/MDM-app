package com.mdm.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AppInventoryRequest {

    @NotBlank
    private String deviceId;

    @NotBlank
    private String appName;

    @NotBlank
    private String packageName;

    private String versionName;
    private int versionCode;
    private String installSource;
    private boolean isSystemApp;
}