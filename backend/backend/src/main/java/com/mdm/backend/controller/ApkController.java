package com.mdm.backend.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApkController {

    @GetMapping("/mdm.apk")
    public ResponseEntity<Resource> downloadApk() throws Exception {
        Resource resource = new ClassPathResource("static/mdm.apk");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.android.package-archive"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"mdm.apk\"")
                .body(resource);
    }
}