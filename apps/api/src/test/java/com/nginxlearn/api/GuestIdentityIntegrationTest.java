package com.nginxlearn.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class GuestIdentityIntegrationTest {

    private static final Pattern TOKEN_IN_RESPONSE = Pattern.compile("\"token\":\"(ngl_[A-Za-z0-9_-]{43})\"");

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @LocalServerPort
    int port;

    @Autowired
    JdbcClient jdbcClient;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void createsGuestAndAcceptsOnlyItsBearerToken() throws Exception {
        HttpResponse<String> unauthenticated = send("GET", "/api/v1/me", null);
        assertThat(unauthenticated.statusCode()).isEqualTo(401);

        HttpResponse<String> created = send("POST", "/api/v1/guests", null);
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body()).contains("\"kind\":\"GUEST\"");

        Matcher matcher = TOKEN_IN_RESPONSE.matcher(created.body());
        assertThat(matcher.find()).isTrue();
        String token = matcher.group(1);

        HttpResponse<String> authenticated = send("GET", "/api/v1/me", token);
        assertThat(authenticated.statusCode()).isEqualTo(200);
        assertThat(authenticated.body()).contains("\"kind\":\"GUEST\"");
        assertThat(authenticated.body()).doesNotContain(token);

        HttpResponse<String> invalid = send("GET", "/api/v1/me", "ngl_" + "a".repeat(43));
        assertThat(invalid.statusCode()).isEqualTo(401);

        Integer plainTokenCount = jdbcClient.sql("SELECT count(*) FROM access_tokens WHERE token_hash = :token")
                .param("token", token)
                .query(Integer.class)
                .single();
        assertThat(plainTokenCount).isZero();
    }

    private HttpResponse<String> send(String method, String path, String token) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        HttpRequest request = builder.method(method, HttpRequest.BodyPublishers.noBody()).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
