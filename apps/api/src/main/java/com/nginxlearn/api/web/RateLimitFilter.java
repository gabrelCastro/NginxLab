package com.nginxlearn.api.web;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Limites em memória, por instância. Protegem a criação de visitantes, o login (força
 * bruta), a verificação de missões (CPU) e as gravações. Com várias réplicas, cada uma
 * aplica o próprio limite; o proxy na frente também limita (deploy/web/nginx.conf).
 */
public class RateLimitFilter extends OncePerRequestFilter {

    private record Window(long start, int count) {
    }

    private static final int MAX_KEYS = 50_000;

    private final RateLimitProperties properties;
    private final MeterRegistry meters;
    private final LongSupplier clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitFilter(RateLimitProperties properties, MeterRegistry meters, LongSupplier clock) {
        this.properties = properties;
        this.meters = meters;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String bucket = bucket(request);
        RateLimitProperties.Rule rule = bucket == null ? null : rule(bucket);
        if (!properties.enabled() || rule == null) {
            chain.doFilter(request, response);
            return;
        }
        String key = bucket + "|" + client(request, bucket);
        long now = clock.getAsLong();
        long window = rule.window().toMillis();
        if (windows.size() > MAX_KEYS) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= window);
        }
        Window current = windows.compute(key, (ignored, previous) ->
                previous == null || now - previous.start() >= window ? new Window(now, 1) : new Window(previous.start(), previous.count() + 1));
        if (current.count() > rule.requests()) {
            long retryAfter = Math.max(1, (current.start() + window - now + 999) / 1000);
            meters.counter("nginxlearn.rate_limit.rejections", "bucket", bucket).increment();
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            response.setHeader("Cache-Control", "no-store");
            response.setContentType("application/json");
            response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"Muitas requisições. Tente novamente em " + retryAfter + " s.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static String bucket(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (!path.startsWith("/api/")) return null;
        if (method.equals("POST") && path.equals("/api/v1/guests")) return "guests";
        if (method.equals("POST") && path.equals("/api/v1/sessions")) return "sessions";
        if (method.equals("POST") && path.equals("/api/v1/account")) return "accounts";
        if (method.equals("POST") && path.matches("/api/v1/missions/[^/]+/attempts")) return "attempts";
        if (method.equals("PUT") || method.equals("POST") || method.equals("DELETE")) return "writes";
        return null;
    }

    private RateLimitProperties.Rule rule(String bucket) {
        return switch (bucket) {
            case "guests" -> properties.guests();
            case "sessions" -> properties.sessions();
            case "accounts" -> properties.accounts();
            case "attempts" -> properties.attempts();
            default -> properties.writes();
        };
    }

    // Rotas autenticadas contam por token (vários alunos podem compartilhar um IP de escola);
    // as públicas, por IP.
    private static String client(HttpServletRequest request, String bucket) {
        String authorization = request.getHeader("Authorization");
        if (!bucket.equals("guests") && !bucket.equals("sessions") && authorization != null && authorization.startsWith("Bearer ")) {
            return "t:" + sha256(authorization.substring(7));
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
