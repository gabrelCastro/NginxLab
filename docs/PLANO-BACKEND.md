# Backend Java 21 — execução por fases

O navegador continua executando o simulador. O backend começa como serviço de identidade e persistência do progresso; a validação autoritativa das missões entra depois, com uma implementação Java própria.

| Fase | Estado | Entrega e critério de aceite |
| --- | --- | --- |
| 1. Fundação | Concluída | Spring Boot, PostgreSQL, Flyway, health check e teste com banco real. |
| 2. Visitante | Concluída | Identidade sem cadastro, token opaco armazenado como hash, acesso autenticado e teste de autorização. |
| 3. Checkpoints | Concluída | Leitura e gravação isoladas por visitante, versões de esquema/cenário e conflito de revisão sem sobrescrita. |
| 4. Integração | Concluída | Importar `localStorage` uma vez, sincronizar capítulos/missão, manter modo offline e tratar `409` sem perda silenciosa. |
| 5. Missões | Concluída | Validar tentativas no Java a partir de evidências reproduzíveis, registrar resultado no servidor e nunca confiar em `validation.ok` do cliente. |
| 6. Produção | Concluída | Limites de requisição, observabilidade, documentação da API, CI, deploy, backups e opção de vincular visitante a uma conta. |

Na fase 4, a UI só deve mostrar “sincronizado” após confirmação do servidor. Dados locais existentes têm prioridade na primeira importação; conflitos posteriores exigem escolha explícita ou cópia preservada, nunca descarte automático.

### Fase 4 — como ficou

- `src/sync/engine.ts` guarda, por checkpoint, a última revisão e o hash canônico confirmados (`nginxlearn:sync-v1`). A fila é derivada: tudo cujo hash local difere do confirmado. Por isso ela sobrevive a recarregamentos e não duplica dados.
- A importação é o primeiro envio com `expectedRevision: 0`. Se a confirmação se perder e o reenvio receber `409` com o mesmo conteúdo, a revisão é adotada sem conflito.
- Na abertura, `GET /checkpoints` restaura versões mais novas somente se o checkpoint local não mudou desde a última confirmação; caso contrário, vira conflito. Payloads do servidor são validados pelas mesmas regras do `localStorage` antes de serem aplicados.
- Conflitos ficam persistidos, pausam o envio só daquele checkpoint e exigem escolha. A versão descartada vai para `nginxlearn:sync-preserved-v1` (últimas 20) e pode ser baixada.
- Token recusado (`401`): o visitante é recriado e o progresso local é importado de novo; versões de servidor em conflito são preservadas como cópia.
- Recusas definitivas (`400`, `413`) não entram em repetição infinita: o checkpoint fica marcado e volta a ser enviado quando mudar.

- Várias abas: cada aba grava só o próprio capítulo (lendo o que as outras salvaram), recebe as mudanças das demais pelo evento `storage` e avisa quando o capítulo aberto mudou em outra aba. A sincronização roda sob uma trava Web Locks e relê o estado compartilhado antes de cada ciclo: um só visitante é criado e nenhuma aba envia com revisão desatualizada.

### Fase 5 — missões verificadas no servidor

- `apps/api/.../simulator` é uma implementação Java do subconjunto do simulador usado nas missões (parser, `nginx -t`, seleção de `server`/`location`, `root`, `alias`, `index`, `try_files`, `return`, `rewrite`; `proxy_pass` responde 502 porque os cenários não têm backends). Regex de `location`/`rewrite` rodam com orçamento de passos contra ReDoS.
- O TypeScript é a referência. `fidelity/serverContract.test.ts` gera `missions/mission-v1.json` (cenários usados pelo servidor) e `simulator-parity.json` (respostas e vereditos esperados, incluindo os casos gravados do nginx real). O teste falha se o simulador ou o catálogo mudarem sem `npm run contract:update`, e `SimulatorParityTest`/`MissionVerifierParityTest` exigem que o Java reproduza tudo.
- Quando a validação local passa, o navegador registra uma tentativa com ID próprio (fila offline em `nginxlearn:mission-attempts-v1`) e envia a configuração ativa para `POST /missions/{id}/attempts`. O servidor reexecuta `nginx -t` e as requisições da missão e grava `VERIFIED` ou `REJECTED` com as evidências. O relato do cliente é guardado só como contexto. Reenvios com o mesmo ID não duplicam.
- A interface mostra “Verificado pelo servidor”, “Aguardando verificação” ou “O servidor não confirmou esta solução”. A progressão local continua imediata (o laboratório funciona offline); o selo de verificação é o que vale como conquista.

### Fase 6 — produção

- Contas opcionais: `POST /account` protege o visitante atual (mesmo ID), `POST /sessions` entra em outro navegador com um token próprio (180 dias), `DELETE /sessions/current` sai. BCrypt custo 12, mensagem idêntica para e-mail inexistente e senha errada, comparação com hash fictício para não revelar contas pelo tempo de resposta.
- Ao entrar numa conta, o progresso do navegador é combinado: o que só existe ali é enviado, o que é igual é adotado, capítulos apenas abertos cedem à conta, e versões diferentes viram conflitos (com opção de resolver todos de uma vez). Ao sair, a pessoa escolhe manter ou apagar o progresso daquele navegador.
- Limites por janela na API e no nginx, `X-Request-Id` ponta a ponta, logs JSON, métricas Prometheus na porta de gestão, OpenAPI em `/api/v1/openapi.yaml` (um teste garante que todo endpoint está documentado), CI com backend, stack completa, E2E real e ensaio de restauração, Dockerfiles, Compose de produção, CSP e backups com retenção. Veja [DEPLOY.md](DEPLOY.md).

Limites conhecidos: os limites de requisição da API valem por réplica (para várias réplicas, use um armazenamento compartilhado ou confie no limite do proxy); não há recuperação de senha por e-mail (exige um serviço de envio; hoje, sem a senha, o progresso continua nos navegadores já conectados); conclusões de capítulos continuam informadas pelo navegador, pois capítulos não têm um critério verificável único como as missões.
