package com.mdm.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class EnrollRequest {

    @NotBlank
    private String deviceId;

    @NotBlank
    private String enrollmentToken;
}