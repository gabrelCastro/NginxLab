package com.nginxlearn.api.identity;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestIdentityService {

    private static final Pattern TOKEN_FORMAT = Pattern.compile("ngl_[A-Za-z0-9_-]{43}");

    private final JdbcClient jdbcClient;
    private final SecureRandom secureRandom = new SecureRandom();

    public GuestIdentityService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Transactional
    public GuestRegistration register() {
        UUID id = UUID.randomUUID();
        jdbcClient.sql("INSERT INTO learners (id, kind) VALUES (:id, 'GUEST')")
                .param("id", id)
                .update();
        return new GuestRegistration(learner(id), issueToken(id, null));
    }

    /** Novo token opaco para o aprendiz; o banco guarda apenas o hash. */
    @Transactional
    public String issueToken(UUID learnerId, OffsetDateTime expiresAt) {
        byte[] secret = new byte[32];
        secureRandom.nextBytes(secret);
        String token = "ngl_" + Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        jdbcClient.sql("INSERT INTO access_tokens (token_hash, learner_id, expires_at) VALUES (:hash, :id, :expiresAt)")
                .param("hash", hash(token))
                .param("id", learnerId)
                .param("expiresAt", expiresAt)
                .update();
        return token;
    }

    @Transactional
    public void revoke(String token) {
        if (token != null && TOKEN_FORMAT.matcher(token).matches()) {
            jdbcClient.sql("DELETE FROM access_tokens WHERE token_hash = :hash").param("hash", hash(token)).update();
        }
    }

    @Transactional(readOnly = true)
    public Learner learner(UUID id) {
        return jdbcClient.sql("SELECT id, kind, created_at FROM learners WHERE id = :id")
                .param("id", id)
                .query((rs, rowNum) -> new Learner(
                        rs.getObject("id", UUID.class),
                        rs.getString("kind"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .single();
    }

    @Transactional(readOnly = true)
    public Optional<Learner> findByToken(String token) {
        if (token == null || !TOKEN_FORMAT.matcher(token).matches()) {
            return Optional.empty();
        }

        return jdbcClient.sql("""
                SELECT l.id, l.kind, l.created_at
                FROM learners l
                JOIN access_tokens c ON c.learner_id = l.id
                WHERE c.token_hash = :hash AND (c.expires_at IS NULL OR c.expires_at > now())
                """)
                .param("hash", hash(token))
                .query((rs, rowNum) -> new Learner(
                        rs.getObject("id", UUID.class),
                        rs.getString("kind"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 não está disponível", e);
        }
    }

    public record GuestRegistration(Learner learner, String token) {
    }
}
