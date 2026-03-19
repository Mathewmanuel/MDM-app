package com.mdm.backend.controller;

import com.mdm.backend.model.AppRestriction;
import com.mdm.backend.repository.AppRestrictionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
@RequestMapping("/restrictions")
public class AppRestrictionController {

    private final AppRestrictionRepository restrictionRepository;

    @GetMapping
    public ResponseEntity<List<AppRestriction>> getAll() {
        return ResponseEntity.ok(restrictionRepository.findAll());
    }

    @GetMapping("/{deviceId}")
    public ResponseEntity<List<AppRestriction>> getByDevice(@PathVariable String deviceId) {
        return ResponseEntity.ok(restrictionRepository.findByDeviceId(deviceId));
    }

    @PostMapping
    public ResponseEntity<AppRestriction> addRestriction(@RequestBody Map<String, String> body) {
        AppRestriction r = new AppRestriction();
        r.setDeviceId(body.get("deviceId"));
        r.setPackageName(body.get("packageName"));
        r.setAppName(body.get("appName"));
        r.setReason(body.get("reason"));
        r.setCreatedAt(LocalDateTime.now());
        return ResponseEntity.ok(restrictionRepository.save(r));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> removeRestriction(@PathVariable Long id) {
        restrictionRepository.deleteById(id);
        return ResponseEntity.ok("Restriction removed");
    }
}