package com.nginxlearn.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class MissionAttemptIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    private static final String INITIAL = "events {}\\nhttp {\\n  server {\\n    listen 80;\\n    server_name localhost;\\n    root /srv/loja;\\n    index index.html;\\n    location /imagens/ {\\n      root /data/catalogo;\\n    }\\n  }\\n}";
    private static final String SOLVED = INITIAL.replace("root /data/catalogo;", "alias /data/catalogo/;");

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = new JsonMapper();

    @Test
    void verifiesAttemptsOnTheServerIdempotentlyAndPrivately() throws Exception {
        String token = guest();
        UUID attemptId = UUID.randomUUID();

        HttpResponse<String> verified = send("POST", "/api/v1/missions/catalog/attempts", token, attempt(attemptId, SOLVED, "null"));
        assertThat(verified.statusCode()).isEqualTo(201);
        JsonNode body = mapper.readTree(verified.body());
        assertThat(body.path("status").asString()).isEqualTo("VERIFIED");
        assertThat(body.path("result").path("ok").asBoolean()).isTrue();
        assertThat(body.path("attemptId").asString()).isEqualTo(attemptId.toString());

        // Reenvio após falha de rede: mesmo resultado, nenhum registro novo.
        HttpResponse<String> again = send("POST", "/api/v1/missions/catalog/attempts", token, attempt(attemptId, INITIAL, "null"));
        assertThat(again.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(again.body()).path("status").asString()).isEqualTo("VERIFIED");

        // O cliente diz que passou, mas a configuração não resolve a missão.
        HttpResponse<String> lying = send("POST", "/api/v1/missions/catalog/attempts", token,
                attempt(UUID.randomUUID(), INITIAL, "{\"validation\":{\"ok\":true}}"));
        JsonNode lie = mapper.readTree(lying.body());
        assertThat(lying.statusCode()).isEqualTo(201);
        assertThat(lie.path("status").asString()).isEqualTo("REJECTED");
        assertThat(lie.path("result").path("message").asString()).contains("/data/catalogo/caneca.svg");

        HttpResponse<String> invalid = send("POST", "/api/v1/missions/catalog/attempts", token,
                attempt(UUID.randomUUID(), "events {}\\nhttp { server { listen 80 }", "null"));
        assertThat(mapper.readTree(invalid.body()).path("result").path("configValid").asBoolean()).isFalse();

        assertThat(send("POST", "/api/v1/missions/inexistente/attempts", token, attempt(UUID.randomUUID(), SOLVED, "null")).statusCode()).isEqualTo(404);
        assertThat(send("POST", "/api/v1/missions/catalog/attempts", token, """
                {"attemptId":"%s","scenarioVersion":"mission-v9","config":"x"}
                """.formatted(UUID.randomUUID())).statusCode()).isEqualTo(400);
        assertThat(send("POST", "/api/v1/missions/catalog/attempts", null, attempt(UUID.randomUUID(), SOLVED, "null")).statusCode()).isEqualTo(401);

        JsonNode mine = mapper.readTree(send("GET", "/api/v1/missions/attempts", token, null).body());
        assertThat(mine.size()).isEqualTo(3);
        assertThat(mapper.readTree(send("GET", "/api/v1/missions/attempts", guest(), null).body()).size()).isZero();
    }

    private String guest() throws Exception {
        return mapper.readTree(send("POST", "/api/v1/guests", null, null).body()).path("token").asString();
    }

    private static String attempt(UUID id, String config, String report) {
        return """
                {"attemptId":"%s","scenarioVersion":"mission-v1","config":"%s","clientReport":%s}
                """.formatted(id, config, report);
    }

    private HttpResponse<String> send(String method, String path, String token, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
