package com.nginxlearn.api.identity;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class AccountController {

    private final AccountService accounts;
    private final GuestIdentityService identity;
    private final MeterRegistry meters;

    public AccountController(AccountService accounts, GuestIdentityService identity, MeterRegistry meters) {
        this.accounts = accounts;
        this.identity = identity;
        this.meters = meters;
    }

    /** Protege o progresso do visitante atual com e-mail e senha. */
    @PostMapping("/account")
    public ResponseEntity<Map<String, Object>> create(@AuthenticationPrincipal Learner learner, @Valid @RequestBody Credentials request) {
        AccountService.AccountView account = accounts.upgrade(learner, request.email(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(Map.of("learner", identity.learner(learner.id()), "email", account.email()));
    }

    /** Entra em uma conta neste navegador. O token é retornado uma única vez. */
    @PostMapping("/sessions")
    public ResponseEntity<Map<String, Object>> signIn(@Valid @RequestBody Credentials request) {
        AccountService.SignIn session;
        try {
            session = accounts.signIn(request.email(), request.password());
        } catch (RuntimeException e) {
            meters.counter("nginxlearn.account.sign_ins", "outcome", "failed").increment();
            throw e;
        }
        meters.counter("nginxlearn.account.sign_ins", "outcome", "succeeded").increment();
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(Map.of("learner", session.learner(), "email", session.email(), "token", session.token()));
    }

    /** Sai neste navegador: apenas o token usado nesta requisição deixa de valer. */
    @DeleteMapping("/sessions/current")
    public ResponseEntity<Void> signOut(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        identity.revoke(authorization == null ? null : authorization.replaceFirst("^Bearer ", ""));
        return ResponseEntity.noContent().build();
    }

    public record Credentials(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 200) String password) {
    }
}
