package com.mdm.backend.controller;

import com.mdm.backend.dto.EnrollRequest;
import com.mdm.backend.model.EnrolledDevice;
import com.mdm.backend.repository.EnrolledDeviceRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/enroll")
@RequiredArgsConstructor
public class EnrollController {

    private final EnrolledDeviceRepository enrolledDeviceRepository;

    @PostMapping
    public ResponseEntity<String> enrollDevice(@Valid @RequestBody EnrollRequest request) {
        EnrolledDevice device = new EnrolledDevice();
        device.setDeviceId(request.getDeviceId());
        device.setEnrollmentToken(request.getEnrollmentToken());
        device.setEnrolledAt(LocalDateTime.now());
        enrolledDeviceRepository.save(device);
        return ResponseEntity.ok("Device enrolled successfully");
    }
}