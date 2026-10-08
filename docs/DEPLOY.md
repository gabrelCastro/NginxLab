# Deploy e operação

A stack de produção fica em `deploy/`: nginx servindo o front-end e fazendo proxy para a API na mesma origem, a API Java, o PostgreSQL e um contêiner de backup. Só o nginx é publicado; banco, API e métricas ficam na rede interna do Compose.

```text
navegador ──HTTPS──▶ (seu TLS) ──▶ web:8080 (nginx) ──/api/──▶ api:8080 ──▶ db:5432
                                        └─ arquivos de dist/      api:8081 (métricas, interna)
                                                                  backup ──pg_dump──▶ ./backups
```

## Subir

Requisitos: Docker com Compose v2.

```bash
cd deploy
cp .env.example .env            # troque POSTGRES_PASSWORD por um valor longo e aleatório
docker compose --env-file .env up -d --build --wait
```

O site responde em `http://127.0.0.1:8088` (ajuste `WEB_BIND`/`WEB_PORT`). Por padrão a porta só escuta em `127.0.0.1`: coloque na frente um balanceador ou proxy com TLS. Para terminar TLS no próprio nginx, adicione `listen 443 ssl` com seus certificados em `deploy/web/default.conf` e só então ative HSTS (`add_header Strict-Transport-Security "max-age=31536000" always;` em `security-headers.conf`). A API usa o perfil `prod`: confia em `X-Forwarded-*` apenas de redes privadas, ou seja, do nginx do Compose.

Para verificar a stack inteira com um navegador real (sincronização, verificação de missão no Java, conta em outro navegador, CSP e `/actuator` fechado):

```bash
NGINXLEARN_STACK_URL=http://127.0.0.1:8088 npm run e2e:stack
```

A CI faz o mesmo no job `stack`, e também ensaia backup e restauração.

## Segurança na borda

- `deploy/web/security-headers.conf` define a CSP e os demais cabeçalhos. Scripts só do próprio site; estilos inline e imagens/fontes `data:` são permitidos porque a loja simulada é um iframe `srcdoc` e o Vite embute fontes pequenas. O mesmo arquivo é aplicado por `scripts/serve-dist.mjs`, então qualquer violação quebra os E2E.
- `/actuator/` responde 404 no nginx. Saúde e métricas ficam em `api:8081`, alcançável só dentro da rede do Compose.
- O nginx limita `/api/` a 20 req/s por IP (rajada de 40). A API tem limites próprios por janela, em memória e por instância:

  | Regra | Padrão | Chave |
  | --- | --- | --- |
  | `guests` (criar visitante) | 10 a cada 10 min | IP |
  | `sessions` (login) | 10 a cada 5 min | IP |
  | `accounts` (criar conta) | 5 a cada 10 min | token |
  | `attempts` (verificar missão) | 30 por minuto | token |
  | `writes` (demais escritas) | 240 por minuto | token |

  Ajuste pelo ambiente, por exemplo `NGINXLEARN_RATELIMIT_SESSIONS_REQUESTS=5` e `NGINXLEARN_RATELIMIT_SESSIONS_WINDOW=10m`. Com várias réplicas da API, os limites valem por réplica.

## Observabilidade

- Logs da API em JSON (ECS) na saída padrão, com `requestId`. O nginx registra `rid=` no log de acesso com o mesmo valor que envia à API em `X-Request-Id`; para seguir uma requisição: `docker compose logs web api | grep <rid>`.
- Prometheus em `http://api:8081/actuator/prometheus` (rede interna). Métricas próprias:
  - `nginxlearn_checkpoint_writes_total{scope,outcome=created|updated|conflict}`: uma taxa alta de `conflict` indica uso simultâneo ou um problema de sincronização.
  - `nginxlearn_mission_attempts_total{mission,status=VERIFIED|REJECTED}`: `REJECTED` após validação local positiva aponta divergência entre os simuladores ou cliente adulterado.
  - `nginxlearn_account_sign_ins_total{outcome}` e `nginxlearn_rate_limit_rejections_total{bucket}`: picos de falhas indicam tentativa de força bruta.
- Saúde: `api:8081/actuator/health/readiness` (usada no healthcheck do contêiner).

## Backups

O serviço `backup` roda `deploy/backup/backup.sh` ao subir e depois a cada `BACKUP_INTERVAL_SECONDS` (padrão: diário). Cada execução gera `nginxlearn-<UTC>.dump` (formato custom do `pg_dump`) em `BACKUP_PATH`, só dá o nome final depois de `pg_restore --list` ler o arquivo, e apaga cópias com mais de `BACKUP_RETENTION_DAYS` dias. Copie a pasta para fora do host (armazenamento de objetos, outro servidor). Um backup que fica só na mesma máquina não protege contra perda do disco.

Backup sob demanda:

```bash
docker compose exec backup /backup/backup.sh
```

Ensaio de restauração, sem tocar no banco em uso (faça periodicamente):

```bash
dump=$(docker compose exec -T backup sh -c 'ls -1t /backups/*.dump | head -1')
docker compose exec -T backup sh -c "createdb restore_check && PGDATABASE=restore_check /backup/restore.sh $dump && psql -d restore_check -tAc 'select count(*) from learners'; dropdb restore_check"
```

Restauração real: pare a API (`docker compose stop api`), rode `/backup/restore.sh <arquivo>` no contêiner `backup` (usa `PGDATABASE=nginxlearn`, com `--clean`) e suba a API de novo. O Flyway confere o esquema na partida.

## Atualizar

`docker compose --env-file .env up -d --build --wait`. As migrações Flyway rodam na partida da API e são aditivas. Faça um backup sob demanda antes de atualizar. A API encerra com `shutdown: graceful` (até 20 s para requisições em andamento).

## Dados pessoais

Visitantes são anônimos. Contas guardam e-mail e hash BCrypt (custo 12); tokens são guardados só como SHA-256. Sessões de conta expiram em 180 dias; “Sair neste navegador” revoga o token daquele navegador. Para atender a um pedido de exclusão, apague a linha em `learners`: checkpoints, tentativas, tokens e a conta são removidos em cascata.
