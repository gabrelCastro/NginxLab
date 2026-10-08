package com.nginxlearn.api.simulator;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import com.nginxlearn.api.mission.MissionVerifier;

import static org.assertj.core.api.Assertions.assertThat;

/** O veredito do servidor precisa coincidir com o {@code validateMission} do navegador. */
class MissionVerifierParityTest {

    private final MissionVerifier verifier = new MissionVerifier(new JsonMapper());

    @TestFactory
    Stream<DynamicTest> verdictsMatchTypeScript() throws Exception {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode item : SimulatorParityTest.contract().path("missions")) {
            tests.add(DynamicTest.dynamicTest(item.path("id").asString(), () -> {
                MissionVerifier.Result result = verifier.verify(item.path("variant").asString(), item.path("config").asString());
                assertThat(result.configValid()).isEqualTo(item.path("checkOk").asBoolean());
                if (!result.configValid()) {
                    assertThat(result.ok()).isFalse();
                    return;
                }
                JsonNode expected = item.path("expected");
                assertThat(result.ok()).isEqualTo(expected.path("ok").asBoolean());
                assertThat(result.home()).isEqualTo(expected.path("home").asBoolean());
                assertThat(result.image()).isEqualTo(expected.path("image").asBoolean());
                assertThat(result.route()).isEqualTo(expected.path("route").asBoolean());
                assertThat(result.fallback()).isEqualTo(expected.path("fallback").asBoolean());
                assertThat(result.message()).isEqualTo(expected.path("message").asString());
            }));
        }
        return tests.stream();
    }
}
