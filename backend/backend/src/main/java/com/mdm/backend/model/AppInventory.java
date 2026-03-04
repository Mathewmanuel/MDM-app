package com.mdm.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "app_inventory")
public class AppInventory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String deviceId;
    private String appName;
    private String packageName;
    private String versionName;
    private int versionCode;
    private String installSource;
    private boolean isSystemApp;
    private LocalDateTime collectedAt;
}