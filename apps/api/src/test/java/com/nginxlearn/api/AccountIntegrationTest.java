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
class AccountIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @LocalServerPort
    int port;

    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper mapper = new JsonMapper();

    @Test
    void guestBecomesAccountAndSignsInFromAnotherBrowser() throws Exception {
        String guestToken = json(send("POST", "/api/v1/guests", null, null)).path("token").asString();
        assertThat(send("PUT", "/api/v1/checkpoints/MISSION/campaign", guestToken, """
                {"schemaVersion":1,"scenarioVersion":"mission-v1","expectedRevision":0,"payload":{"version":1,"stage":"observe"}}
                """).statusCode()).isEqualTo(201);

        assertThat(send("POST", "/api/v1/account", guestToken, credentials("Aluna@Exemplo.test", "curta")).statusCode()).isEqualTo(400);
        HttpResponse<String> created = send("POST", "/api/v1/account", guestToken, credentials("Aluna@Exemplo.test", "senha-bem-longa"));
        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(json(created).path("learner").path("kind").asString()).isEqualTo("ACCOUNT");
        JsonNode me = json(send("GET", "/api/v1/me", guestToken, null));
        assertThat(me.path("email").asString()).isEqualTo("aluna@exemplo.test");
        assertThat(json(send("POST", "/api/v1/account", guestToken, credentials("outra@exemplo.test", "senha-bem-longa"))).path("code").asString())
                .isEqualTo("ALREADY_ACCOUNT");

        String otherGuest = json(send("POST", "/api/v1/guests", null, null)).path("token").asString();
        HttpResponse<String> taken = send("POST", "/api/v1/account", otherGuest, credentials("aluna@exemplo.test", "senha-bem-longa"));
        assertThat(taken.statusCode()).isEqualTo(409);
        assertThat(json(taken).path("code").asString()).isEqualTo("EMAIL_TAKEN");

        HttpResponse<String> wrong = send("POST", "/api/v1/sessions", null, credentials("aluna@exemplo.test", "senha-errada-123"));
        HttpResponse<String> unknown = send("POST", "/api/v1/sessions", null, credentials("ninguem@exemplo.test", "senha-errada-123"));
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(unknown.statusCode()).isEqualTo(401);
        assertThat(wrong.body()).isEqualTo(unknown.body());

        HttpResponse<String> signedIn = send("POST", "/api/v1/sessions", null, credentials("ALUNA@exemplo.test", "senha-bem-longa"));
        assertThat(signedIn.statusCode()).isEqualTo(201);
        String secondBrowser = json(signedIn).path("token").asString();
        assertThat(secondBrowser).isNotEqualTo(guestToken);
        JsonNode checkpoints = json(send("GET", "/api/v1/checkpoints", secondBrowser, null));
        assertThat(checkpoints.size()).isEqualTo(1);
        assertThat(checkpoints.get(0).path("scopeId").asString()).isEqualTo("campaign");

        assertThat(send("DELETE", "/api/v1/sessions/current", secondBrowser, null).statusCode()).isEqualTo(204);
        assertThat(send("GET", "/api/v1/me", secondBrowser, null).statusCode()).isEqualTo(401);
        assertThat(send("GET", "/api/v1/me", guestToken, null).statusCode()).isEqualTo(200);
    }

    private JsonNode json(HttpResponse<String> response) {
        return mapper.readTree(response.body());
    }

    private static String credentials(String email, String password) {
        return """
                {"email":"%s","password":"%s"}
                """.formatted(email, password);
    }

    private HttpResponse<String> send(String method, String path, String token, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        return client.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
