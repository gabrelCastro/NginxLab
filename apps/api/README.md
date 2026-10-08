# API NginxLearn

Backend em Java 21 e Spring Boot: PostgreSQL com Flyway, identidade de visitante e contas opcionais, checkpoints com revisão otimista, verificação de missões com um simulador Java próprio, limites de requisição, métricas e OpenAPI. O front-end usa esta API para importar e sincronizar o progresso (veja “Progresso e sincronização” no README principal). O front-end chama a API na mesma origem, em `/api/v1`; em desenvolvimento, o Vite faz o proxy para a porta 8080. A API não habilita CORS.

## Desenvolvimento local

Requisitos: Java 21 e Docker com Compose. Na pasta `apps/api`:

```bash
docker compose up -d
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Consulte <http://localhost:8080/actuator/health>. A configuração `local` usa o PostgreSQL do Compose em `localhost:5432`, com credenciais de desenvolvimento `nginxlearn/nginxlearn`. Fora desse perfil, defina `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME` e `SPRING_DATASOURCE_PASSWORD` no ambiente; a aplicação não contém credenciais de produção.

## Testes

```bash
./mvnw test
```

Os testes de integração usam Testcontainers e exigem Docker disponível. Eles verificam migrações, saúde, autenticação, contas, isolamento entre aprendizes, conflitos de revisão, verificação de missões, limites, métricas e a cobertura da OpenAPI. `SimulatorParityTest` e `MissionVerifierParityTest` comparam o simulador Java com respostas geradas pelo TypeScript (`npm run contract:update` na raiz regenera). O volume `postgres_data` do Compose persiste os dados locais entre reinicializações.

## Contrato HTTP

O contrato completo está em [`src/main/resources/openapi/openapi.yaml`](src/main/resources/openapi/openapi.yaml), servido em `GET /api/v1/openapi.yaml`. Resumo (prefixo `/api/v1`, `Authorization: Bearer <token>` exceto onde indicado):

| Rota | Resultado |
| --- | --- |
| `POST /guests` (público) | Cria um visitante e retorna `{ learner, token }`. O token aparece uma vez; o banco guarda só o hash. |
| `GET /me` | Aprendiz autenticado (`kind` `GUEST` ou `ACCOUNT`, `email` quando conta). |
| `POST /account` | Protege o visitante atual com e-mail e senha (`409 EMAIL_TAKEN`/`ALREADY_ACCOUNT`). |
| `POST /sessions` (público) | Entra numa conta e retorna um token novo, válido por 180 dias (`401 INVALID_CREDENTIALS`). |
| `DELETE /sessions/current` | Revoga o token usado. |
| `GET /checkpoints` | Lista os checkpoints. |
| `GET /checkpoints/{scope}/{scopeId}` | Um checkpoint ou `404`. |
| `PUT /checkpoints/{scope}/{scopeId}` | Cria (`201`), atualiza (`200`) ou informa conflito (`409` com `current`). |
| `POST /missions/{missionId}/attempts` | Reexecuta a configuração e responde `VERIFIED` ou `REJECTED`; o mesmo `attemptId` não duplica. |
| `GET /missions/attempts` | Vereditos registrados. |

`scope` é `CHAPTER` (ID da lição) ou `MISSION` (`campaign`). O corpo do `PUT` contém `schemaVersion`, `scenarioVersion`, `expectedRevision` (`0` para criar) e `payload`. O servidor nunca sobrescreve uma revisão diferente. O `payload` é um checkpoint do simulador, não uma conquista; nos capítulos, `completed` é informado pelo navegador. Conquistas de missão são as tentativas `VERIFIED`.

Limites excedidos respondem `429` com `Retry-After`. O perfil `prod` (veja `application-prod.yml`) põe as métricas na porta de gestão `8081`, gera logs JSON e confia em `X-Forwarded-*` só de redes privadas. Deploy e operação: [docs/DEPLOY.md](../../docs/DEPLOY.md). Não publique tokens nem use credenciais de desenvolvimento em produção.
