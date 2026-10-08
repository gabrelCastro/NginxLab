package com.nginxlearn.api.web;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OpenApiController {

    private final String document;

    public OpenApiController() throws IOException {
        try (InputStream input = OpenApiController.class.getResourceAsStream("/openapi/openapi.yaml")) {
            if (input == null) throw new IllegalStateException("openapi.yaml ausente");
            this.document = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @GetMapping(value = "/api/v1/openapi.yaml", produces = "application/yaml")
    public ResponseEntity<String> openApi() {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).contentType(MediaType.parseMediaType("application/yaml; charset=utf-8")).body(document);
    }
}
