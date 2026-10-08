CREATE TABLE guest_credentials (
    token_hash CHAR(64) PRIMARY KEY,
    learner_id UUID NOT NULL UNIQUE REFERENCES learners(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
