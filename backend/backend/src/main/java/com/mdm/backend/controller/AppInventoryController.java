package com.mdm.backend.controller;

import com.mdm.backend.dto.AppInventoryRequest;
import com.mdm.backend.model.AppInventory;
import com.mdm.backend.repository.AppInventoryRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AppInventoryController {

    private final AppInventoryRepository appInventoryRepository;

    @PostMapping("/app-inventory")
    public ResponseEntity<String> saveAppInventory(
            @Valid @RequestBody List<AppInventoryRequest> apps,
            @RequestParam(value = "fresh", defaultValue = "false") boolean fresh) {
        if (!apps.isEmpty() && fresh) {
            String deviceId = apps.get(0).getDeviceId();
            appInventoryRepository.deleteByDeviceId(deviceId);
        }
        for (AppInventoryRequest request : apps) {
            AppInventory app = new AppInventory();
            app.setDeviceId(request.getDeviceId());
            app.setAppName(request.getAppName());
            app.setPackageName(request.getPackageName());
            app.setVersionName(request.getVersionName());
            app.setVersionCode(request.getVersionCode());
            app.setInstallSource(request.getInstallSource());
            app.setSystemApp(request.isSystemApp());
            app.setCollectedAt(LocalDateTime.now());
            appInventoryRepository.save(app);
        }
        return ResponseEntity.ok("App inventory saved successfully");
    }

    @GetMapping("/app-inventory/{deviceId}")
    public ResponseEntity<List<AppInventory>> getAppInventory(@PathVariable String deviceId) {
        return ResponseEntity.ok(appInventoryRepository.findByDeviceId(deviceId));
    }
}