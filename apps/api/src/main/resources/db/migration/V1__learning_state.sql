CREATE TABLE learners (
    id UUID PRIMARY KEY,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('GUEST', 'ACCOUNT')),
    external_subject VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkpoints (
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    scope VARCHAR(16) NOT NULL CHECK (scope IN ('CHAPTER', 'MISSION')),
    scope_id VARCHAR(100) NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    scenario_version VARCHAR(64) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (learner_id, scope, scope_id)
);

CREATE TABLE mission_attempts (
    id UUID PRIMARY KEY,
    learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    mission_id VARCHAR(100) NOT NULL,
    scenario_version VARCHAR(64) NOT NULL,
    verification_status VARCHAR(16) NOT NULL CHECK (verification_status IN ('CLIENT_REPORTED', 'VERIFIED', 'REJECTED')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mission_attempts_learner_created_idx ON mission_attempts (learner_id, created_at DESC);
