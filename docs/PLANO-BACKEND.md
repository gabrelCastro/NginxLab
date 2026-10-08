# Backend Java 21 — execução por fases

O navegador continua executando o simulador. O backend começa como serviço de identidade e persistência do progresso; a validação autoritativa das missões entra depois, com uma implementação Java própria.

| Fase | Estado | Entrega e critério de aceite |
| --- | --- | --- |
| 1. Fundação | Concluída | Spring Boot, PostgreSQL, Flyway, health check e teste com banco real. |
| 2. Visitante | Concluída | Identidade sem cadastro, token opaco armazenado como hash, acesso autenticado e teste de autorização. |
| 3. Checkpoints | Concluída | Leitura e gravação isoladas por visitante, versões de esquema/cenário e conflito de revisão sem sobrescrita. |
| 4. Integração | Pendente | Importar `localStorage` uma vez, sincronizar capítulos/missão, manter modo offline e tratar `409` sem perda silenciosa. |
| 5. Missões | Pendente | Validar tentativas no Java a partir de evidências reproduzíveis, registrar resultado no servidor e nunca confiar em `validation.ok` do cliente. |
| 6. Produção | Pendente | Limites de requisição, observabilidade, documentação da API, CI, deploy, backups e opção de vincular visitante a uma conta. |

Na fase 4, a UI só deve mostrar “sincronizado” após confirmação do servidor. Dados locais existentes têm prioridade na primeira importação; conflitos posteriores exigem escolha explícita ou cópia preservada, nunca descarte automático.
