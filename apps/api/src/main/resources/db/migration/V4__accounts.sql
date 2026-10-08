-- Fase 6: um visitante pode virar conta e entrar em outros navegadores. Cada navegador
-- recebe seu próprio token; tokens de conta expiram, o do visitante não (é a única chave).
ALTER TABLE guest_credentials RENAME TO access_tokens;
ALTER TABLE access_tokens DROP CONSTRAINT guest_credentials_learner_id_key;
ALTER TABLE access_tokens ADD COLUMN expires_at TIMESTAMPTZ;
CREATE INDEX access_tokens_learner_idx ON access_tokens (learner_id);

CREATE TABLE accounts (
    learner_id UUID PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
