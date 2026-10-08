# NginxLearn

Uma forma visual e interativa de aprender nginx. Não há um nginx real durante as lições: um simulador determinístico mostra como cada requisição escolhe `server`, `location`, arquivo ou backend. A interface e toda a trilha estão em português do Brasil; diretivas, comandos e saídas permanecem iguais aos do nginx.

## Como rodar

Requisitos: Node.js 22+ e, apenas para regravar os testes de fidelidade, Docker.

```bash
npm install
npm run dev
```

Abra <http://localhost:5174>.

## Verificações

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run e2e
```

Os E2E sobem `dist/`, nunca o servidor de desenvolvimento, e falham se o navegador emitir qualquer erro de console. Os testes comuns usam respostas já gravadas e não precisam de Docker. `npm run fidelity:record` executa os casos no `nginx:1.27-alpine` e atualiza as gravações; `npm run fidelity:check` verifica se a regravação não alterou o repositório.

## O laboratório

- O editor marca a linha reportada por `nginx -t`; Tab insere quatro espaços e Ctrl/⌘ Enter testa.
- A configuração editada só passa a responder depois de `nginx -s reload` com sucesso.
- O terminal entende `nginx -t`, `nginx -s reload`, `curl`, `cat`, `ls`, `tail`, `help` e `clear`, com histórico em ↑/↓ e completar com Tab.
- O palco acompanha cada requisição em um mapa animado, mostra a etapa atual e revela a resposta ao fim do percurso. É possível pausar, avançar e revelar tudo; com preferência por movimento reduzido, o trace completo aparece imediatamente.
- Objetivos são predicados sobre requisições e estado, não busca de texto na configuração.
- A trilha tem dez capítulos conectados pela história da loja Verde & Co., de arquivos estáticos a proxy, upstream, cache e limites. O mapa permite mudar de capítulo; cada bancada guarda seu próprio checkpoint (configuração ativa e editada, terminal, trace e estado do simulador). Do segundo capítulo em diante há uma pergunta curta de revisão do conceito anterior.
- A missão “As imagens da loja sumiram” apresenta uma loja simulada com um recurso quebrado: observar, prever o caminho procurado, investigar, corrigir e resolver uma variação independente. O navegador e o mapa usam as respostas do simulador. A validação exige novas requisições após o reload, e a tentativa é retomada após recarregar a página.
- Depois da missão das imagens, o incidente “A loja voltou, mas duas rotas falham” combina `server_name`, `location`, `alias` e `try_files`: a imagem e `/dashboard` falham ao mesmo tempo, enquanto o site padrão deve continuar preservado. O aluno precisa testar as quatro respostas depois do reload.

Atalhos globais: `/` foca o terminal, `Espaço` pausa/continua, `.` avança um passo e `r` reinicia a lição.

## Arquitetura

```text
src/sim/          parser, validação, modelo e execução determinística
src/components/   editor, terminal, palco e painel pedagógico
src/lessons/      lições declarativas e seus objetivos
src/missions/     cenários de investigação e validação comportamental
fidelity/         casos executados no nginx real e respostas gravadas
apps/api/         backend Spring Boot e PostgreSQL (em implementação)
```

A API Java 21 está sendo construída por fases. Já possui banco, identidade de visitante e checkpoints versionados; o simulador e o progresso do front-end ainda funcionam apenas no navegador até a integração da próxima fase. Veja [como executar e usar a API](apps/api/README.md).

Toda a interface deriva do estado e do trace emitidos pelo simulador. Alterações no editor só entram em vigor depois de `nginx -s reload`.

### Subconjunto simulado

O núcleo cobre `events`, `http`, `server`, `listen`, `server_name`, `location` (`=`, `^~`, `~`, `~*`), `root`, `alias`, `index`, `try_files`, `return`, `rewrite`, `proxy_pass`, `proxy_set_header`, `upstream`, round-robin com peso, falha/timeout de backend, cache básico e `limit_req`. Diretivas reais reconhecidas mas ainda não implementadas, como `include`, `sendfile` e `keepalive`, são recusadas com uma mensagem explícita em português.
