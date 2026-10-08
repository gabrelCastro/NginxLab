package com.nginxlearn.api.checkpoint;

import java.time.OffsetDateTime;

import tools.jackson.databind.JsonNode;

public record Checkpoint(
        CheckpointScope scope,
        String scopeId,
        int schemaVersion,
        String scenarioVersion,
        long revision,
        JsonNode payload,
        OffsetDateTime updatedAt) {
}
