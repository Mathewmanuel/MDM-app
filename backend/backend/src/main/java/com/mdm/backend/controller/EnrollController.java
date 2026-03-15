package com.mdm.backend.controller;

import java.util.UUID;
import java.util.Map;
import java.util.List;
import java.time.LocalDateTime;
import com.mdm.backend.dto.EnrollRequest;
import com.mdm.backend.model.EnrolledDevice;
import com.mdm.backend.model.EnrollmentToken;
import com.mdm.backend.repository.EnrolledDeviceRepository;
import com.mdm.backend.repository.EnrollmentTokenRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EnrollController {

    private final EnrolledDeviceRepository enrolledDeviceRepository;
    private final EnrollmentTokenRepository enrollmentTokenRepository;

    @PostMapping("/enroll")
    public ResponseEntity<String> enrollDevice(@Valid @RequestBody EnrollRequest request) {
        // Validate token exists and has not been used
        EnrollmentToken token = enrollmentTokenRepository
                .findByTokenAndUsedFalse(request.getEnrollmentToken())
                .orElse(null);

        if (token == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid or already used enrollment token");
        }

        // Mark token as used
        token.setUsed(true);
        enrollmentTokenRepository.save(token);

        // Enroll the device
        EnrolledDevice device = new EnrolledDevice();
        device.setDeviceId(request.getDeviceId());
        device.setEnrollmentToken(request.getEnrollmentToken());
        device.setEnrolledAt(LocalDateTime.now());
        enrolledDeviceRepository.save(device);

        return ResponseEntity.ok("Device enrolled successfully");
    }

    @PostMapping("/enroll-qr")
    public ResponseEntity<String> enrollViaQr(@RequestBody Map<String, String> body) {
        String deviceId = body.get("deviceId");
        if (deviceId == null || deviceId.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Device ID required");
        }

        // Check if already enrolled
        if (enrolledDeviceRepository.findByDeviceId(deviceId).isPresent()) {
            return ResponseEntity.ok("Already enrolled");
        }

        // Enroll the device with QR tag
        EnrolledDevice device = new EnrolledDevice();
        device.setDeviceId(deviceId);
        device.setEnrollmentToken("QR_PROVISIONED");
        device.setEnrolledAt(LocalDateTime.now());
        enrolledDeviceRepository.save(device);

        return ResponseEntity.ok("Device enrolled via QR successfully");
    }

    @GetMapping("/devices")
    public ResponseEntity<List<EnrolledDevice>> getAllDevices() {
        return ResponseEntity.ok(enrolledDeviceRepository.findAll());
    }

    @PostMapping("/generate-token")
    public ResponseEntity<Map<String, String>> generateToken() {
        EnrollmentToken token = new EnrollmentToken();
        token.setToken(UUID.randomUUID().toString());
        token.setUsed(false);
        token.setCreatedAt(LocalDateTime.now());
        enrollmentTokenRepository.save(token);

        return ResponseEntity.ok(Map.of("token", token.getToken()));
    }
}