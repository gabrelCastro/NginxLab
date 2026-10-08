package com.nginxlearn.api.simulator;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

class RequestSimulatorTest {

    @Test
    void catastrophicRegexDoesNotHangTheServer() {
        String config = """
                events {}
                http {
                  server {
                    listen 80;
                    location ~ ^(a|aa)+(a|aa)+(a|aa)+(a|aa)+$ { return 200 "regex"; }
                    location / { return 200 "prefixo"; }
                  }
                }
                """;
        ConfigChecker.CheckResult checked = ConfigChecker.check(config);
        assertThat(checked.ok()).isTrue();
        RequestSimulator.Response response = assertTimeoutPreemptively(Duration.ofSeconds(2), () -> RequestSimulator.simulate(
                checked.config(), RequestSimulator.Request.get("localhost", "/" + "a".repeat(60) + "b"), new VirtualFileSystem(Map.of())));
        assertThat(response.body()).isEqualTo("prefixo");
    }
}
