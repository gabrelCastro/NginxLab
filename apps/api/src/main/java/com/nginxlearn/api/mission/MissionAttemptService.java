package com.nginxlearn.api.mission;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class MissionAttemptService {

    static final int MAX_CONFIG_BYTES = 64 * 1024;
    static final int MAX_CLIENT_REPORT_BYTES = 4 * 1024;

    public record AttemptView(UUID attemptId, String missionId, String scenarioVersion, String status, JsonNode result,
                              OffsetDateTime createdAt) {
    }

    public record SubmitResult(boolean created, AttemptView attempt) {
    }

    private final JdbcClient jdbcClient;
    private final JsonMapper jsonMapper;
    private final MissionVerifier verifier;

    public MissionAttemptService(JdbcClient jdbcClient, JsonMapper jsonMapper, MissionVerifier verifier) {
        this.jdbcClient = jdbcClient;
        this.jsonMapper = jsonMapper;
        this.verifier = verifier;
    }

    @Transactional
    public SubmitResult submit(UUID learnerId, String missionId, UUID attemptId, String scenarioVersion, String config, JsonNode clientReport) {
        if (verifier.scenario(missionId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Missão desconhecida");
        }
        if (!MissionVerifier.SCENARIO_VERSION.equals(scenarioVersion)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Versão de cenário não suportada");
        }
        if (config.getBytes(StandardCharsets.UTF_8).length > MAX_CONFIG_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Configuração excede 64 KiB");
        }
        String report = clientReport == null || clientReport.isNull() ? "null" : jsonMapper.writeValueAsString(clientReport);
        if (clientReport != null && !clientReport.isNull() && !clientReport.isObject() || report.length() > MAX_CLIENT_REPORT_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Relato do cliente inválido");
        }
        var existing = find(learnerId, attemptId);
        if (existing != null) {
            return new SubmitResult(false, existing);
        }

        // O veredito vem só da reexecução no servidor; o relato do cliente é guardado como contexto.
        MissionVerifier.Result result = verifier.verify(missionId, config);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("config", config);
        payload.put("clientReport", clientReport == null || clientReport.isNull() ? null : clientReport);
        payload.put("checkOutput", result.checkOutput());
        payload.put("evidence", result.evidence());
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("ok", result.ok());
        summary.put("configValid", result.configValid());
        summary.put("home", result.home());
        summary.put("image", result.image());
        summary.put("route", result.route());
        summary.put("fallback", result.fallback());
        summary.put("message", result.message());
        int inserted = jdbcClient.sql("""
                INSERT INTO mission_attempts (id, learner_id, client_attempt_id, mission_id, scenario_version, verification_status, payload, result)
                VALUES (:id, :learnerId, :attemptId, :missionId, :scenarioVersion, :status, CAST(:payload AS jsonb), CAST(:result AS jsonb))
                ON CONFLICT (learner_id, client_attempt_id) DO NOTHING
                """)
                .param("id", UUID.randomUUID())
                .param("learnerId", learnerId)
                .param("attemptId", attemptId)
                .param("missionId", missionId)
                .param("scenarioVersion", scenarioVersion)
                .param("status", result.ok() ? "VERIFIED" : "REJECTED")
                .param("payload", jsonMapper.writeValueAsString(payload))
                .param("result", jsonMapper.writeValueAsString(summary))
                .update();
        return new SubmitResult(inserted == 1, find(learnerId, attemptId));
    }

    @Transactional(readOnly = true)
    public List<AttemptView> list(UUID learnerId) {
        return jdbcClient.sql("""
                SELECT client_attempt_id, mission_id, scenario_version, verification_status, result, created_at
                FROM mission_attempts WHERE learner_id = :learnerId AND result IS NOT NULL
                ORDER BY created_at DESC LIMIT 200
                """)
                .param("learnerId", learnerId)
                .query(this::map)
                .list();
    }

    private AttemptView find(UUID learnerId, UUID attemptId) {
        return jdbcClient.sql("""
                SELECT client_attempt_id, mission_id, scenario_version, verification_status, result, created_at
                FROM mission_attempts WHERE learner_id = :learnerId AND client_attempt_id = :attemptId
                """)
                .param("learnerId", learnerId)
                .param("attemptId", attemptId)
                .query(this::map)
                .optional()
                .orElse(null);
    }

    private AttemptView map(ResultSet rs, int rowNum) throws SQLException {
        String result = rs.getString("result");
        return new AttemptView(rs.getObject("client_attempt_id", UUID.class), rs.getString("mission_id"), rs.getString("scenario_version"),
                rs.getString("verification_status"), result == null ? null : jsonMapper.readTree(result), rs.getObject("created_at", OffsetDateTime.class));
    }
}
