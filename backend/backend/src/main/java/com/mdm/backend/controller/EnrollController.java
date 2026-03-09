package com.mdm.backend.controller;

import java.util.UUID;
import java.util.Map;
import java.util.List;
import com.mdm.backend.dto.EnrollRequest;
import com.mdm.backend.model.EnrolledDevice;
import com.mdm.backend.repository.EnrolledDeviceRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EnrollController {

    private final EnrolledDeviceRepository enrolledDeviceRepository;

    @PostMapping("/enroll")
    public ResponseEntity<String> enrollDevice(@Valid @RequestBody EnrollRequest request) {
        EnrolledDevice device = new EnrolledDevice();
        device.setDeviceId(request.getDeviceId());
        device.setEnrollmentToken(request.getEnrollmentToken());
        device.setEnrolledAt(LocalDateTime.now());
        enrolledDeviceRepository.save(device);
        return ResponseEntity.ok("Device enrolled successfully");
    }

    @GetMapping("/devices")
    public ResponseEntity<List<EnrolledDevice>> getAllDevices() {
        return ResponseEntity.ok(enrolledDeviceRepository.findAll());
    }

    @PostMapping("/generate-token")
    public ResponseEntity<Map<String, String>> generateToken() {
        String token = UUID.randomUUID().toString();
        return ResponseEntity.ok(Map.of("token", token));
    }

}