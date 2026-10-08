# API NginxLearn

Backend em Java 21 e Spring Boot. As fases 1–3 incluem PostgreSQL, migrações Flyway, saúde, identidade de visitante e API de checkpoints com revisão otimista. O front-end ainda não chama esta API; a importação do progresso local e a sincronização vêm na fase 4.

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

Os testes de integração usam Testcontainers e exigem Docker disponível. Eles verificam migrações, saúde, autenticação, isolamento entre visitantes e conflitos de revisão. O volume `postgres_data` do Compose persiste os dados locais entre reinicializações.

## Contrato HTTP atual

Todas as rotas abaixo usam o prefixo `/api/v1`. `POST /guests` cria um visitante e retorna `{ "learner": { "id", "kind", "createdAt" }, "token" }`. O token é um segredo retornado uma vez; o banco guarda apenas seu hash. Envie-o nas demais chamadas como `Authorization: Bearer <token>`. `GET /me` retorna o visitante autenticado.

| Rota | Resultado |
| --- | --- |
| `GET /checkpoints` | Lista os checkpoints do visitante. |
| `GET /checkpoints/{scope}/{scopeId}` | Retorna um checkpoint ou `404`. |
| `PUT /checkpoints/{scope}/{scopeId}` | Cria (`201`), atualiza (`200`) ou informa conflito (`409`). |

`scope` é `CHAPTER` ou `MISSION`. O front-end usa o ID da lição para capítulos e `campaign` para a missão. O corpo do `PUT` contém `schemaVersion`, `scenarioVersion`, `expectedRevision` e `payload`. Para criar, envie `expectedRevision: 0`; para atualizar, envie a `revision` recebida antes. Em `409`, a resposta contém `code: "REVISION_CONFLICT"` e `current`, o estado atual no servidor. O servidor não sobrescreve uma revisão diferente.

Exemplo de corpo para o capítulo `servidor-de-arquivos`:

```json
{
  "schemaVersion": 1,
  "scenarioVersion": "chapters-v1",
  "expectedRevision": 0,
  "payload": { "version": 1, "id": "servidor-de-arquivos", "draftSource": "..." }
}
```

O `payload` é um checkpoint do simulador, não uma conquista verificada. A API valida formato básico e autoria, mas ainda não executa validação de missões no servidor. Não publique o token nem use credenciais de desenvolvimento em produção.
