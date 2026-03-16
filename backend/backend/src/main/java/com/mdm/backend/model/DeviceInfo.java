package com.mdm.backend.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "device_info")
public class DeviceInfo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String deviceId;
    private String model;
    private String manufacturer;
    private String osVersion;
    private String sdkVersion;
    private String serialNumber;
    private String uuid;
    private String imei;
    private Double latitude;
    private Double longitude;
}