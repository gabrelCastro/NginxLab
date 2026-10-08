package com.nginxlearn.api.identity;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Learner(UUID id, String kind, OffsetDateTime createdAt) {
}
