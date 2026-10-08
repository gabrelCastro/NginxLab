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
    private final AccountService accounts;

    public GuestController(GuestIdentityService identityService, AccountService accounts) {
        this.identityService = identityService;
        this.accounts = accounts;
    }

    @PostMapping("/guests")
    public ResponseEntity<GuestIdentityService.GuestRegistration> register() {
        GuestIdentityService.GuestRegistration registration = identityService.register();
        return ResponseEntity.created(URI.create("/api/v1/me"))
                .cacheControl(CacheControl.noStore())
                .body(registration);
    }

    @GetMapping("/me")
    public ResponseEntity<Me> me(@AuthenticationPrincipal Learner learner) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new Me(learner.id(), learner.kind(), learner.createdAt(), accounts.email(learner.id()).orElse(null)));
    }

    public record Me(java.util.UUID id, String kind, java.time.OffsetDateTime createdAt, String email) {
    }
}
