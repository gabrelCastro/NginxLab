package com.nginxlearn.api.checkpoint;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CheckpointService {

    private static final int MAX_PAYLOAD_BYTES = 1024 * 1024;

    private final JdbcClient jdbcClient;
    private final JsonMapper jsonMapper;
    private final RowMapper<Checkpoint> checkpointMapper = this::mapCheckpoint;

    public CheckpointService(JdbcClient jdbcClient, JsonMapper jsonMapper) {
        this.jdbcClient = jdbcClient;
        this.jsonMapper = jsonMapper;
    }

    @Transactional(readOnly = true)
    public List<Checkpoint> list(UUID learnerId) {
        return jdbcClient.sql("""
                SELECT scope, scope_id, schema_version, scenario_version, revision, payload, updated_at
                FROM checkpoints WHERE learner_id = :learnerId ORDER BY scope, scope_id
                """)
                .param("learnerId", learnerId)
                .query(checkpointMapper)
                .list();
    }

    @Transactional(readOnly = true)
    public Optional<Checkpoint> find(UUID learnerId, CheckpointScope scope, String scopeId) {
        return jdbcClient.sql("""
                SELECT scope, scope_id, schema_version, scenario_version, revision, payload, updated_at
                FROM checkpoints
                WHERE learner_id = :learnerId AND scope = :scope AND scope_id = :scopeId
                """)
                .param("learnerId", learnerId)
                .param("scope", scope.name())
                .param("scopeId", scopeId)
                .query(checkpointMapper)
                .optional();
    }

    @Transactional
    public SaveResult save(UUID learnerId, CheckpointScope scope, String scopeId,
                           int schemaVersion, String scenarioVersion, long expectedRevision, JsonNode payload) {
        validatePayload(scope, scopeId, schemaVersion, payload);
        String payloadJson = jsonMapper.writeValueAsString(payload);
        if (payloadJson.getBytes(StandardCharsets.UTF_8).length > MAX_PAYLOAD_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Checkpoint excede 1 MiB");
        }

        if (expectedRevision == 0) {
            int inserted = jdbcClient.sql("""
                    INSERT INTO checkpoints
                        (learner_id, scope, scope_id, schema_version, scenario_version, payload)
                    VALUES (:learnerId, :scope, :scopeId, :schemaVersion, :scenarioVersion, CAST(:payload AS jsonb))
                    ON CONFLICT DO NOTHING
                    """)
                    .param("learnerId", learnerId)
                    .param("scope", scope.name())
                    .param("scopeId", scopeId)
                    .param("schemaVersion", schemaVersion)
                    .param("scenarioVersion", scenarioVersion)
                    .param("payload", payloadJson)
                    .update();
            return new SaveResult(inserted == 1, true, find(learnerId, scope, scopeId).orElseThrow());
        }

        int updated = jdbcClient.sql("""
                UPDATE checkpoints
                SET schema_version = :schemaVersion,
                    scenario_version = :scenarioVersion,
                    payload = CAST(:payload AS jsonb),
                    revision = revision + 1,
                    updated_at = now()
                WHERE learner_id = :learnerId AND scope = :scope AND scope_id = :scopeId
                  AND revision = :expectedRevision
                """)
                .param("learnerId", learnerId)
                .param("scope", scope.name())
                .param("scopeId", scopeId)
                .param("schemaVersion", schemaVersion)
                .param("scenarioVersion", scenarioVersion)
                .param("payload", payloadJson)
                .param("expectedRevision", expectedRevision)
                .update();
        return new SaveResult(updated == 1, false, find(learnerId, scope, scopeId).orElse(null));
    }

    private void validatePayload(CheckpointScope scope, String scopeId, int schemaVersion, JsonNode payload) {
        if (payload == null || !payload.isObject() || payload.path("version").asInt(-1) != schemaVersion) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload ou versão de esquema inválidos");
        }
        if (scope == CheckpointScope.CHAPTER && !scopeId.equals(payload.path("id").asString(null))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID do capítulo diverge do payload");
        }
        if (scope == CheckpointScope.MISSION && !scopeId.equals("campaign")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID da missão inválido");
        }
    }

    private Checkpoint mapCheckpoint(ResultSet rs, int rowNum) throws SQLException {
        return new Checkpoint(
                CheckpointScope.valueOf(rs.getString("scope")),
                rs.getString("scope_id"),
                rs.getInt("schema_version"),
                rs.getString("scenario_version"),
                rs.getLong("revision"),
                jsonMapper.readTree(rs.getString("payload")),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    public record SaveResult(boolean saved, boolean created, Checkpoint checkpoint) {
    }
}
