package com.mdm.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "app_restriction")
public class AppRestriction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String deviceId;
    private String packageName;
    private String appName;
    private String reason;
    private LocalDateTime createdAt;
}