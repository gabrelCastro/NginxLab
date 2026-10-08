package com.nginxlearn.api.identity;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.nginxlearn.api.web.ApiException;

/**
 * Conta opcional: protege o progresso do visitante com e-mail e senha e permite entrar
 * em outros navegadores. O visitante vira conta sem mudar de ID, então checkpoints e
 * tentativas já gravados continuam dele.
 */
@Service
public class AccountService {

    static final Duration SESSION_LIFETIME = Duration.ofDays(180);
    static final int MIN_PASSWORD = 10;
    // BCrypt considera só os primeiros 72 bytes; recusar senhas maiores evita surpresa.
    static final int MAX_PASSWORD_BYTES = 72;

    public record AccountView(UUID learnerId, String email) {
    }

    public record SignIn(Learner learner, String email, String token) {
    }

    private final JdbcClient jdbcClient;
    private final GuestIdentityService identity;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
    // Comparado quando o e-mail não existe, para o tempo de resposta não revelar contas.
    private final String dummyHash = encoder.encode("nginxlearn-conta-inexistente");

    public AccountService(JdbcClient jdbcClient, GuestIdentityService identity) {
        this.jdbcClient = jdbcClient;
        this.identity = identity;
    }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    @Transactional
    public AccountView upgrade(Learner learner, String email, String password) {
        validatePassword(password);
        String normalized = normalizeEmail(email);
        if (!"GUEST".equals(learner.kind())) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_ACCOUNT", "Este progresso já está protegido por uma conta.");
        }
        try {
            jdbcClient.sql("INSERT INTO accounts (learner_id, email, password_hash) VALUES (:id, :email, :hash)")
                    .param("id", learner.id())
                    .param("email", normalized)
                    .param("hash", encoder.encode(password))
                    .update();
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_TAKEN", "Já existe uma conta com este e-mail. Entre nela para combinar o progresso.");
        }
        jdbcClient.sql("UPDATE learners SET kind = 'ACCOUNT' WHERE id = :id").param("id", learner.id()).update();
        return new AccountView(learner.id(), normalized);
    }

    @Transactional
    public SignIn signIn(String email, String password) {
        String normalized = normalizeEmail(email);
        Optional<Credentials> credentials = jdbcClient.sql("SELECT learner_id, password_hash FROM accounts WHERE email = :email")
                .param("email", normalized)
                .query((rs, rowNum) -> new Credentials(rs.getObject("learner_id", UUID.class), rs.getString("password_hash")))
                .optional();
        boolean matches = encoder.matches(password, credentials.map(Credentials::hash).orElse(dummyHash));
        if (credentials.isEmpty() || !matches) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "E-mail ou senha incorretos.");
        }
        UUID learnerId = credentials.get().learnerId();
        String token = identity.issueToken(learnerId, OffsetDateTime.now().plus(SESSION_LIFETIME));
        return new SignIn(identity.learner(learnerId), normalized, token);
    }

    @Transactional(readOnly = true)
    public Optional<String> email(UUID learnerId) {
        return jdbcClient.sql("SELECT email FROM accounts WHERE learner_id = :id").param("id", learnerId).query(String.class).optional();
    }

    private static void validatePassword(String password) {
        if (password.length() < MIN_PASSWORD || password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", "Use uma senha com 10 a 72 caracteres.");
        }
    }

    private record Credentials(UUID learnerId, String hash) {
    }
}
