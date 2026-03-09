package com.mdm.backend.controller;

import java.util.List;
import com.mdm.backend.dto.DeviceInfoRequest;
import com.mdm.backend.model.DeviceInfo;
import com.mdm.backend.repository.DeviceInfoRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class DeviceInfoController {

    private final DeviceInfoRepository deviceInfoRepository;

    @PostMapping("/device-info")
    public ResponseEntity<String> saveDeviceInfo(@Valid @RequestBody DeviceInfoRequest request) {
        DeviceInfo deviceInfo = new DeviceInfo();
        deviceInfo.setDeviceId(request.getDeviceId());
        deviceInfo.setModel(request.getModel());
        deviceInfo.setManufacturer(request.getManufacturer());
        deviceInfo.setOsVersion(request.getOsVersion());
        deviceInfo.setSdkVersion(request.getSdkVersion());
        deviceInfo.setSerialNumber(request.getSerialNumber());
        deviceInfo.setUuid(request.getUuid());
        deviceInfo.setImei(request.getImei());
        deviceInfoRepository.save(deviceInfo);
        return ResponseEntity.ok("Device info saved successfully");
    }

    @GetMapping("/device-info/{deviceId}")
    public ResponseEntity<List<DeviceInfo>> getDeviceInfo(@PathVariable String deviceId) {
        return ResponseEntity.ok(deviceInfoRepository.findByDeviceId(deviceId));
    }
}