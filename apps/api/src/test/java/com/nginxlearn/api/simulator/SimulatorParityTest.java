package com.nginxlearn.api.simulator;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Compara o simulador Java com respostas geradas pelo simulador TypeScript
 * ({@code fidelity/serverContract.test.ts}). Os casos de fidelidade vieram do nginx real.
 */
class SimulatorParityTest {

    private static final JsonMapper MAPPER = new JsonMapper();

    static JsonNode contract() throws Exception {
        try (InputStream input = SimulatorParityTest.class.getResourceAsStream("/simulator-parity.json")) {
            assertThat(input).as("simulator-parity.json; rode npm run contract:update").isNotNull();
            return MAPPER.readTree(input);
        }
    }

    @TestFactory
    Stream<DynamicTest> configCheckMatchesTypeScript() throws Exception {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode item : contract().path("checks")) {
            tests.add(DynamicTest.dynamicTest("nginx -t " + item.path("id").asString(), () -> {
                ConfigChecker.CheckResult result = ConfigChecker.check(item.path("config").asString());
                assertThat(result.ok()).isEqualTo(item.path("ok").asBoolean());
                assertThat(result.output()).containsExactlyElementsOf(strings(item.path("output")));
                assertThat(result.errorLine()).isEqualTo(item.path("errorLine").isNull() ? null : item.path("errorLine").asInt());
            }));
        }
        return tests.stream();
    }

    @TestFactory
    Stream<DynamicTest> requestsMatchTypeScript() throws Exception {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode item : contract().path("requests")) {
            tests.add(DynamicTest.dynamicTest("requests " + item.path("id").asString(), () -> {
                ConfigChecker.CheckResult checked = ConfigChecker.check(item.path("config").asString());
                if (!checked.ok()) {
                    assertThat(item.path("responses").size()).isZero();
                    return;
                }
                VirtualFileSystem fs = new VirtualFileSystem(files(item.path("files")));
                JsonNode requests = item.path("requests");
                JsonNode expected = item.path("responses");
                assertThat(requests.size()).isEqualTo(expected.size());
                for (int index = 0; index < requests.size(); index++) {
                    JsonNode request = requests.get(index);
                    RequestSimulator.Response actual = RequestSimulator.simulate(checked.config(), new RequestSimulator.Request(
                            request.path("method").asString("GET"), request.path("host").isMissingNode() ? null : request.path("host").asString(),
                            request.path("port").isMissingNode() ? null : request.path("port").asInt(), request.path("path").asString()), fs);
                    JsonNode want = expected.get(index);
                    String label = item.path("id").asString() + " #" + index + " " + request.path("path").asString();
                    assertThat(actual.status()).as(label).isEqualTo(want.path("status").asInt());
                    assertThat(actual.body()).as(label).isEqualTo(want.path("body").asString());
                    assertThat(actual.filePath()).as(label).isEqualTo(nullable(want.path("filePath")));
                    assertThat(actual.serverId()).as(label).isEqualTo(nullable(want.path("serverId")));
                    assertThat(actual.location()).as(label).isEqualTo(nullable(want.path("location")));
                    Map<String, String> headers = new LinkedHashMap<>();
                    actual.headers().forEach((name, value) -> {
                        if (name.equals("Location") || name.startsWith("X-")) headers.put(name, value);
                    });
                    Map<String, String> wantHeaders = new LinkedHashMap<>();
                    want.path("headers").properties().forEach(entry -> wantHeaders.put(entry.getKey(), entry.getValue().asString()));
                    assertThat(headers).as(label).isEqualTo(wantHeaders);
                }
            }));
        }
        return tests.stream();
    }

    static Map<String, VirtualFileSystem.VirtualFile> files(JsonNode node) {
        Map<String, VirtualFileSystem.VirtualFile> files = new LinkedHashMap<>();
        node.properties().forEach(entry -> files.put(entry.getKey(), new VirtualFileSystem.VirtualFile(
                entry.getValue().path("content").asString(), nullable(entry.getValue().path("contentType")))));
        return files;
    }

    private static List<String> strings(JsonNode node) {
        List<String> values = new ArrayList<>();
        node.forEach(value -> values.add(value.asString()));
        return values;
    }

    private static String nullable(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? null : node.asString();
    }
}
