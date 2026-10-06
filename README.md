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
- O palco anima o trace produzido pelo simulador, com pausar, avançar e revelar tudo.
- Objetivos são predicados sobre requisições e estado, não busca de texto na configuração.
- A trilha tem dez lições, de arquivos estáticos a proxy, upstream, cache e limites.

Atalhos globais: `/` foca o terminal, `Espaço` pausa/continua, `.` avança um passo e `r` reinicia a lição.

## Arquitetura

```text
src/sim/          parser, validação, modelo e execução determinística
src/components/   editor, terminal, palco e painel pedagógico
src/lessons/      lições declarativas e seus objetivos
fidelity/         casos executados no nginx real e respostas gravadas
```

Toda a interface deriva do estado e do trace emitidos pelo simulador. Alterações no editor só entram em vigor depois de `nginx -s reload`.

### Subconjunto simulado

O núcleo cobre `events`, `http`, `server`, `listen`, `server_name`, `location` (`=`, `^~`, `~`, `~*`), `root`, `alias`, `index`, `try_files`, `return`, `rewrite`, `proxy_pass`, `proxy_set_header`, `upstream`, round-robin com peso, falha/timeout de backend, cache básico e `limit_req`. Diretivas reais reconhecidas mas ainda não implementadas, como `include`, `sendfile` e `keepalive`, são recusadas com uma mensagem explícita em português.
