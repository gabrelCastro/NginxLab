package com.nginxlearn.api.mission;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import com.nginxlearn.api.simulator.ConfigChecker;
import com.nginxlearn.api.simulator.RequestSimulator;
import com.nginxlearn.api.simulator.VirtualFileSystem;

/**
 * Valida uma solução de missão executando, no servidor, as mesmas requisições do
 * {@code validateMission} do navegador. O resultado depende apenas da configuração enviada
 * e do cenário versionado, então qualquer pessoa pode reproduzi-lo.
 */
@Component
public class MissionVerifier {

    public static final String SCENARIO_VERSION = "mission-v1";

    public record Scenario(String title, Map<String, VirtualFileSystem.VirtualFile> files, String host, String homeFile,
                           String imageUri, String expectedFile, String extraUri, String expectedExtraFile,
                           String fallbackHost, String expectedFallbackServer, Integer expectedFallbackStatus) {
    }

    public record Catalog(String scenarioVersion, Map<String, Scenario> missions) {
    }

    public record Evidence(String request, int status, String filePath, String serverId, String location) {
    }

    public record Result(boolean ok, boolean configValid, boolean home, boolean image, boolean route, boolean fallback,
                         String message, List<String> checkOutput, List<Evidence> evidence) {
    }

    private final Catalog catalog;

    public MissionVerifier(JsonMapper jsonMapper) {
        try (InputStream input = MissionVerifier.class.getResourceAsStream("/missions/" + SCENARIO_VERSION + ".json")) {
            if (input == null) {
                throw new IllegalStateException("Cenários " + SCENARIO_VERSION + " ausentes");
            }
            this.catalog = jsonMapper.readValue(input, Catalog.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (!SCENARIO_VERSION.equals(catalog.scenarioVersion())) {
            throw new IllegalStateException("Versão de cenário inesperada: " + catalog.scenarioVersion());
        }
    }

    public Optional<Scenario> scenario(String missionId) {
        return Optional.ofNullable(catalog.missions().get(missionId));
    }

    public Result verify(String missionId, String config) {
        Scenario scenario = scenario(missionId).orElseThrow(() -> new IllegalArgumentException("Missão desconhecida: " + missionId));
        ConfigChecker.CheckResult checked = ConfigChecker.check(config);
        if (!checked.ok()) {
            return new Result(false, false, false, false, false, false,
                    "A configuração não passa em nginx -t. Corrija-a antes de validar.", checked.output(), List.of());
        }
        VirtualFileSystem fs = new VirtualFileSystem(scenario.files());
        Map<String, RequestSimulator.Request> requests = new LinkedHashMap<>();
        requests.put("home", RequestSimulator.Request.get(scenario.host(), "/"));
        requests.put("image", RequestSimulator.Request.get(scenario.host(), scenario.imageUri()));
        if (scenario.extraUri() != null) {
            requests.put("route", RequestSimulator.Request.get(scenario.host(), scenario.extraUri()));
        }
        if (scenario.fallbackHost() != null) {
            requests.put("fallback", RequestSimulator.Request.get(scenario.fallbackHost(), "/"));
        }
        Map<String, RequestSimulator.Response> responses = new LinkedHashMap<>();
        List<Evidence> evidence = new ArrayList<>();
        requests.forEach((name, request) -> {
            RequestSimulator.Response response = RequestSimulator.simulate(checked.config(), request, fs);
            responses.put(name, response);
            evidence.add(new Evidence("GET " + request.path() + " Host: " + request.host(), response.status(), response.filePath(), response.serverId(), response.location()));
        });

        RequestSimulator.Response home = responses.get("home");
        RequestSimulator.Response image = responses.get("image");
        RequestSimulator.Response route = responses.get("route");
        RequestSimulator.Response fallback = responses.get("fallback");
        boolean homeOk = home.status() == 200 && scenario.homeFile().equals(home.filePath())
                && home.body().equals(content(scenario, scenario.homeFile()));
        boolean imageOk = image.status() == 200 && scenario.expectedFile().equals(image.filePath())
                && image.body().equals(content(scenario, scenario.expectedFile()));
        boolean routeOk = scenario.extraUri() == null || (route.status() == 200
                && scenario.expectedExtraFile().equals(route.filePath()) && route.body().equals(home.body()));
        boolean fallbackOk = scenario.fallbackHost() == null || (fallback.status() == scenario.expectedFallbackStatus()
                && scenario.expectedFallbackServer().equals(fallback.serverId()));
        String message = !homeOk ? "A página inicial precisa continuar vindo de " + scenario.homeFile() + "."
                : !imageOk ? "A imagem ainda não vem de " + scenario.expectedFile() + ". Consulte o caminho no trace."
                : !routeOk ? "A rota " + scenario.extraUri() + " precisa entregar index.html sem quebrar os recursos reais."
                : !fallbackOk ? "Um Host desconhecido deve continuar chegando ao servidor padrão."
                : "Página, imagem, rota da aplicação e site padrão respondem corretamente.";
        return new Result(homeOk && imageOk && routeOk && fallbackOk, true, homeOk, imageOk, routeOk, fallbackOk, message, checked.output(), evidence);
    }

    private static String content(Scenario scenario, String path) {
        VirtualFileSystem.VirtualFile file = new VirtualFileSystem(scenario.files()).read(path);
        return file == null ? null : file.content();
    }
}
