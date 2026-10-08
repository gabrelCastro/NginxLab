package com.nginxlearn.api.web;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> handle(ApiException exception) {
        return ResponseEntity.status(exception.status())
                .cacheControl(CacheControl.noStore())
                .body(Map.of("code", exception.code(), "message", exception.getMessage()));
    }
}
