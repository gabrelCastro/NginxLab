package com.nginxlearn.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

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
class CheckpointIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = new JsonMapper();

    @Test
    void checkpointsArePrivateAndUseOptimisticRevisions() throws Exception {
        String ownerToken = mapper.readTree(send("POST", "/api/v1/guests", null, null).body())
                .path("token").asString();
        String otherToken = mapper.readTree(send("POST", "/api/v1/guests", null, null).body())
                .path("token").asString();
        String path = "/api/v1/checkpoints/CHAPTER/servidor-de-arquivos";

        HttpResponse<String> created = send("PUT", path, ownerToken,
                chapterRequest(0, "primeiro rascunho"));
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(mapper.readTree(created.body()).path("revision").asLong()).isEqualTo(1);

        assertThat(send("GET", path, otherToken, null).statusCode()).isEqualTo(404);
        assertThat(mapper.readTree(send("GET", "/api/v1/checkpoints", otherToken, null).body()).size())
                .isZero();
        assertThat(send("GET", path, ownerToken, null).statusCode()).isEqualTo(200);

        HttpResponse<String> updated = send("PUT", path, ownerToken,
                chapterRequest(1, "segundo rascunho"));
        assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(updated.body()).path("revision").asLong()).isEqualTo(2);

        HttpResponse<String> stale = send("PUT", path, ownerToken,
                chapterRequest(1, "rascunho desatualizado"));
        assertThat(stale.statusCode()).isEqualTo(409);
        JsonNode conflict = mapper.readTree(stale.body());
        assertThat(conflict.path("code").asString()).isEqualTo("REVISION_CONFLICT");
        assertThat(conflict.path("current").path("revision").asLong()).isEqualTo(2);
        assertThat(conflict.path("current").path("payload").path("draftSource").asString())
                .isEqualTo("segundo rascunho");

        assertThat(send("PUT", path, ownerToken, """
                {"schemaVersion":2,"scenarioVersion":"chapters-v1","expectedRevision":2,
                 "payload":{"version":1,"id":"servidor-de-arquivos"}}
                """).statusCode()).isEqualTo(400);

        HttpResponse<String> mission = send("PUT", "/api/v1/checkpoints/MISSION/campaign", ownerToken, """
                {"schemaVersion":1,"scenarioVersion":"mission-v1","expectedRevision":0,
                 "payload":{"version":1,"variant":"catalog","stage":"observe"}}
                """);
        assertThat(mission.statusCode()).isEqualTo(201);
        assertThat(mapper.readTree(send("GET", "/api/v1/checkpoints", ownerToken, null).body()).size())
                .isEqualTo(2);
    }

    private String chapterRequest(long expectedRevision, String draftSource) {
        return """
                {"schemaVersion":1,"scenarioVersion":"chapters-v1","expectedRevision":%d,
                 "payload":{"version":1,"id":"servidor-de-arquivos","draftSource":"%s"}}
                """.formatted(expectedRevision, draftSource);
    }

    private HttpResponse<String> send(String method, String path, String token, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        if (body != null) {
            builder.header("Content-Type", "application/json");
        }
        HttpRequest request = builder.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
