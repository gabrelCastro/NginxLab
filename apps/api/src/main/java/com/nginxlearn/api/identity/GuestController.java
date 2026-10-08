package com.nginxlearn.api.identity;

import java.net.URI;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class GuestController {

    private final GuestIdentityService identityService;

    public GuestController(GuestIdentityService identityService) {
        this.identityService = identityService;
    }

    @PostMapping("/guests")
    public ResponseEntity<GuestIdentityService.GuestRegistration> register() {
        GuestIdentityService.GuestRegistration registration = identityService.register();
        return ResponseEntity.created(URI.create("/api/v1/me"))
                .cacheControl(CacheControl.noStore())
                .body(registration);
    }

    @GetMapping("/me")
    public ResponseEntity<Learner> me(@AuthenticationPrincipal Learner learner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(learner);
    }
}
