package com.nginxlearn.api;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.env.Environment;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.yaml.snakeyaml.Yaml;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "nginxlearn.rate-limit.guests.requests=2",
        "management.server.port=0"
})
@Testcontainers
class OperationsIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @LocalServerPort
    int port;

    @Autowired
    Environment environment;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mappings;

    private final HttpClient client = HttpClient.newHttpClient();

    @Test
    void limitsGuestCreationAndExposesMetricsOnlyOnTheManagementPort() throws Exception {
        assertThat(send(port, "POST", "/api/v1/guests", Map.of()).statusCode()).isEqualTo(201);
        assertThat(send(port, "POST", "/api/v1/guests", Map.of()).statusCode()).isEqualTo(201);
        HttpResponse<String> limited = send(port, "POST", "/api/v1/guests", Map.of());
        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(limited.headers().firstValue("Retry-After")).isPresent();
        assertThat(limited.body()).contains("RATE_LIMITED");

        assertThat(send(port, "GET", "/actuator/prometheus", Map.of()).statusCode()).isEqualTo(401);
        int management = environment.getRequiredProperty("local.management.port", Integer.class);
        HttpResponse<String> metrics = send(management, "GET", "/actuator/prometheus", Map.of());
        assertThat(metrics.statusCode()).isEqualTo(200);
        assertThat(metrics.body()).contains("nginxlearn_rate_limit_rejections_total{application=\"nginxlearn-api\",bucket=\"guests\"}");
    }

    @Test
    void propagatesSafeRequestIds() throws Exception {
        HttpResponse<String> kept = send(port, "GET", "/actuator/health", Map.of("X-Request-Id", "proxy-1234abcd"));
        assertThat(kept.headers().firstValue("X-Request-Id")).hasValue("proxy-1234abcd");
        HttpResponse<String> replaced = send(port, "GET", "/actuator/health", Map.of("X-Request-Id", "x<script>alert(1)</script>"));
        assertThat(replaced.headers().firstValue("X-Request-Id").orElseThrow()).matches("[0-9a-f-]{36}");
    }

    @Test
    @SuppressWarnings("unchecked")
    void documentsEveryApiEndpoint() throws Exception {
        HttpResponse<String> document = send(port, "GET", "/api/v1/openapi.yaml", Map.of());
        assertThat(document.statusCode()).isEqualTo(200);
        Map<String, Object> openApi = new Yaml().load(document.body());
        Map<String, Map<String, Object>> paths = (Map<String, Map<String, Object>>) openApi.get("paths");
        Set<String> documented = new TreeSet<>();
        paths.forEach((path, operations) -> operations.keySet().stream().filter(key -> !key.equals("parameters"))
                .forEach(method -> documented.add(method.toUpperCase() + " /api/v1" + path)));
        Set<String> implemented = new TreeSet<>();
        mappings.getHandlerMethods().keySet().forEach(info -> info.getPatternValues().stream().filter(path -> path.startsWith("/api/"))
                .forEach(path -> info.getMethodsCondition().getMethods().forEach(method -> implemented.add(method.name() + " " + path))));
        assertThat(documented).isEqualTo(implemented);
    }

    private HttpResponse<String> send(int target, String method, String path, Map<String, String> headers) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + target + path));
        headers.forEach(builder::header);
        return client.send(builder.method(method, HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }
}
