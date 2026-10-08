-- Tentativas de missão verificadas no servidor (fase 5). O cliente gera o ID da tentativa
-- para que o reenvio depois de uma falha de rede não crie um registro duplicado.
ALTER TABLE mission_attempts ADD COLUMN client_attempt_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE mission_attempts ALTER COLUMN client_attempt_id DROP DEFAULT;
ALTER TABLE mission_attempts ADD COLUMN result JSONB;
CREATE UNIQUE INDEX mission_attempts_learner_client_idx ON mission_attempts (learner_id, client_attempt_id);
