# Plano de evolução do NginxLearn

Status: missão piloto e expansão técnica inicial implementadas. As dez lições estão conectadas pela história da loja, com mapa, perguntas de revisão e checkpoints por capítulo; há também um incidente de integração após o piloto. A avaliação com pessoas ainda não foi realizada.

## 1. Direção do produto

Transformar o NginxLearn em uma jornada na qual o aluno constrói e opera uma aplicação, acompanha as decisões do nginx e aprende a investigar problemas de configuração.

O fio condutor é uma pequena loja virtual. Cada capítulo apresenta uma necessidade concreta, acrescenta uma capacidade à aplicação e exige demonstrar que o resultado funciona.

Público inicial: pessoas começando em nginx, com explicações de HTTP e terminal disponíveis no próprio laboratório.

Princípios:

- Continuidade: os capítulos pertencem à mesma aplicação.
- Visibilidade: decisões do simulador conectam configuração, requisição e resultado.
- Autonomia: orientação diminui conforme o aluno consegue resolver variações.
- Experimentação: errar, inspecionar e tentar novamente faz parte do exercício.
- Fidelidade: indicar os limites da simulação e preservar testes contra nginx real.

## 2. Resultado esperado

Ao terminar uma missão, o aluno deve conseguir identificar o sintoma, prever o comportamento relevante, reunir evidências, corrigir a configuração e verificar o resultado.

Conclusão de passos e quantidade de cliques não bastam para demonstrar domínio. A evidência principal é resolver uma variação do problema com menos ajuda.

## 3. Recorte inicial

Primeira entrega: missão completa “As imagens da loja sumiram”, baseada nos conceitos de caminhos e arquivos já presentes na trilha.

Inclui:

- Relato do problema e loja simulada com imagem quebrada.
- Editor, terminal, acesso aos logs e inspeção dos arquivos virtuais.
- Pergunta de previsão antes da revelação da decisão relevante.
- Mapa navegador → nginx → disco, conectado ao trace e ao editor.
- Dicas graduais e explicação específica para cada alternativa incorreta.
- Validação de funcionamento e preservação da página inicial.
- Desafio de transferência com outros caminhos.
- Salvamento e retomada do laboratório.

Nesta entrega, as dez lições existentes receberam contexto de campanha, revisões entre capítulos e checkpoints independentes. Um incidente posterior combina seleção de `server`, `alias` e `try_files`. Incidentes próprios de backend, cache e limites, bem como ajustes baseados em observação de uso, ficam para entregas posteriores. Contas, ranking, multiplayer, tutor por IA e execução de servidores reais não são necessários para validar a proposta.

As dez lições atuais continuam acessíveis durante a implantação. A missão piloto é uma entrada própria, permitindo comparar a nova experiência com a trilha existente.

## 4. Roteiro da missão piloto

Contexto: “O catálogo foi publicado. A página abre, mas a foto do produto não aparece. Restaure a imagem sem quebrar a página inicial.”

Cenário proposto:

- Página inicial em `/srv/loja/index.html`.
- Imagem em `/data/catalogo/caneca.svg`, com tipo `image/svg+xml`.
- URI pública da imagem: `/imagens/caneca.svg`.
- Configuração inicial com `location /imagens/ { root /data/catalogo; }`.
- Esse mapeamento procura `/data/catalogo/imagens/caneca.svg`, que não existe.
- Uma correção possível é usar `alias /data/catalogo/;` nessa location.

O aluno altera a configuração; os arquivos da missão permanecem fixos. A avaliação aceita soluções equivalentes dentro do subconjunto suportado, verificando o recurso servido e o comportamento, sem exigir uma string específica no editor.

| Momento | Ação do aluno | Evidência de aprendizado |
| --- | --- | --- |
| Observar | Abrir a loja e reproduzir a falha | Distinguir página disponível de recurso ausente |
| Prever | Escolher o caminho que será procurado | Relacionar `root` à URI completa |
| Investigar | Fazer a requisição, ler o trace e consultar arquivos/logs | Comparar caminho tentado com caminho existente |
| Corrigir | Editar, testar e recarregar | Distinguir configuração editada de ativa |
| Comprovar | Requisitar página e imagem | Demonstrar correção sem regressão |
| Transferir | Resolver uma variação com outros caminhos | Aplicar o conceito sem receita pronta |
| Refletir | Identificar por que a solução funciona | Consolidar a diferença entre `root` e `alias` |

Dicas: primeiro apontar uma evidência; depois explicar a transformação do caminho; por último revelar uma possível correção. Usar dicas não reduz pontuação nem bloqueia avanço. O nível de ajuda compõe o registro da tentativa.

O desafio final usa um cenário isolado, por exemplo `/midia/` e `/opt/produtos/`, e preserva a solução da missão principal. Não deve reaproveitar evidências da tentativa anterior.

## 5. Experiência de interface

Manter três áreas principais no desktop:

- Bancada: editor e terminal existentes.
- Ambiente: alternância entre navegador da loja e mapa da requisição.
- Missão: contexto, etapa atual, previsão, evidências e dicas.

O navegador deve permitir navegar/recarregar e selecionar uma requisição da página para inspeção. A imagem quebrada deve resultar de uma falha real do simulador.

O mapa destaca o componente e a decisão atuais. Selecionar uma decisão leva à linha correspondente da configuração usada naquela requisição. Quando o editor contém alterações não aplicadas, apresentar a configuração ativa em leitura para evitar destacar uma linha de outra versão.

No modo de previsão, a execução didática aguarda uma resposta ou a ação explícita “explorar sem responder”. O resumo e a animação não antecipam a resposta. Acesso livre ao terminal continua disponível; uma tentativa já explorada não conta como previsão independente.

Em telas menores, usar abas com estado preservado. Controles funcionam por teclado; significado não depende apenas de cor; respeitar preferência por movimento reduzido.

## 6. Fases de implementação

### Fase 1 — Conteúdo e modelo de missão

Entregas:

- Definir tipos de missão, etapa, previsão, dicas, evidências e desafio de transferência.
- Criar os arquivos virtuais, configuração inicial e conteúdo da loja piloto.
- Centralizar progresso da missão no estado; evitar duplicação com estado local de componentes.
- Identificar tentativa, variante e versão de configuração para associar evidências corretamente.

Aceite: cenário inicial reproduz página 200 e imagem 404; cenário corrigido entrega os recursos esperados; a missão pode ser reiniciada sem carregar evidências antigas.

### Fase 2 — Missão jogável e validação

Depende da fase 1.

Entregas:

- Implementar o fluxo observar, prever, investigar, corrigir e comprovar.
- Adicionar feedback por alternativa e dicas em três níveis.
- Implementar o desafio de transferência e o resumo da tentativa.
- Avaliar comportamento da configuração ativa, incluindo preservação da página inicial.

Aceite: apenas editar não resolve a missão; reload inválido mantém o comportamento anterior; `return 200` genérico não substitui o arquivo esperado; uma evidência antiga não aprova uma configuração posteriormente quebrada.

A verificação final deve executar casos em contexto isolado, sem alterar logs, cache, contadores ou progresso da sessão do aluno. As evidências das ações do aluno continuam separadas dessa avaliação.

### Fase 3 — Navegador e mapa conectados ao simulador

Depende da fase 2 e completa a experiência visual do piloto.

Entregas:

- Criar preview da loja que resolve documento e imagem pelo simulador.
- Apresentar status e recurso servido por requisição.
- Construir mapa em componentes React/SVG a partir do trace existente.
- Conectar decisões à configuração ativa correspondente.
- Preservar pausa, avanço e apresentação textual do trace.

Decisão técnica: o piloto usa HTML controlado e recursos SVG locais. Resolver URLs da página pelo simulador e inserir no preview somente o conteúdo retornado com sucesso. Não deixar URLs do laboratório virarem requisições ao servidor Vite ou à internet. Scripts arbitrários não são necessários no preview.

Requisições de recursos usam a mesma camada de execução e observabilidade do terminal. Identificar origem e agrupar requisições por navegação para que um carregamento de página não sobrescreva o trace selecionado nem complete etapas por acidente.

Aceite: o preview começa com a imagem ausente e passa a exibi-la após correção e reload; trace, logs e navegador concordam; clicar em uma decisão aponta a configuração certa, inclusive com alterações não aplicadas no editor.

### Fase 4 — Retomada, acessibilidade e qualidade

Depende das fases 1–3.

Entregas:

- Salvar missão, variante, etapa, previsões, dicas, configurações ativa/editada e evidências relevantes.
- Versionar o formato persistido e tratar dados inválidos sem impedir o uso.
- Reconstruir estado executável a partir de dados serializáveis; não serializar funções, instâncias ou `Map` diretamente.
- Concluir navegação por teclado, layout responsivo e movimento reduzido.
- Executar validações automatizadas e revisão visual do piloto.

Aceite: recarregar a página retoma a tentativa e mantém uma edição ainda não aplicada; trocar de missão não perde seu progresso; armazenamento indisponível permite continuar com aviso de que a sessão não será salva.

### Fase 5 — Avaliação do piloto e expansão da campanha

Depende do piloto completo e de observação de uso.

Entregas:

- Observar se iniciantes entendem o primeiro passo, encontram evidências e resolvem a variação.
- Ajustar texto, dicas e disposição dos painéis onde houver dificuldades recorrentes.
- Expandir a campanha em ordem: primeiro deploy, reload, múltiplos sites, catálogo, seleção de location, SPA, redirects, proxy, upstream, cache e limites.
- Acrescentar revisões de conceitos anteriores em novos contextos.

Continuidade proposta: checkpoints explícitos por capítulo, com cenário de entrada conhecido e tentativas anteriores preservadas. Evitar que uma configuração arbitrária de um capítulo torne o próximo impossível.

Aceite: cada novo capítulo mantém o contexto da loja, introduz um conceito delimitado e termina com uma aplicação independente. A implementação atual reaproveita os exercícios das dez lições, acrescidos de contexto e revisão; ainda é preciso observar aprendizes para verificar se a narrativa e as tarefas de fato ajudam. Novos incidentes devem ser priorizados a partir dessa avaliação.

## 7. Impacto previsto no código

| Área | Mudança prevista |
| --- | --- |
| `src/lessons/types.ts` e conteúdo | Compatibilidade com lições atuais; referências aos conceitos usados nas missões |
| `src/missions/` — novo | Definições, cenários, previsões e avaliação de missões |
| `src/store/useLab.ts` | Tentativas, progresso, seleção de requisição e versões da configuração |
| `src/store/` | Persistência versionada e reconstrução da sessão |
| `src/components/LessonPanel.tsx` | Reuso dos controles; evolução do feedback sem regressões na trilha |
| Novos componentes de missão/preview | Contexto, navegador controlado, previsões e resumo |
| `src/components/RequestStage.tsx` | Mapa sincronizado com trace e escolha de requisição |
| `src/components/ConfigEditor.tsx` | Navegação até diretiva e distinção entre versões |
| `src/sim/` | Reuso da execução; extração mínima de caminho comum para terminal e navegador |
| `e2e/` e testes existentes | Jornada, retomada e regressões relevantes |

Preferir manter o simulador independente da apresentação. Novas abstrações devem atender necessidades concretas do piloto.

## 8. Verificação e critérios de entrega

Testes relevantes:

- Falha inicial, correção válida, recurso incorreto com status 200 e regressão na home.
- Edição sem reload, reload inválido e evidência de configuração anterior.
- Resolução independente da variação sem reaproveitar conclusão anterior.
- Preview de documento e imagem alinhado às respostas simuladas.
- Retomada de configuração ativa e rascunho diferentes; dados salvos inválidos.
- Jornada completa no navegador e navegação essencial por teclado.

Na implementação, executar typecheck, testes, lint e E2E do projeto; o comando de E2E já gera o build. Se houver mudança de semântica simulada, adicionar ou atualizar os casos de fidelidade correspondentes.

Na implementação do piloto, executar typecheck, testes, lint e E2E.

## 9. Como avaliar a proposta

Registrar localmente por tentativa: previsão inicial, nível de dicas usado, resultados de validação e conclusão da variação. Nenhum serviço externo de analytics é necessário no piloto.

Observar em sessões de uso:

- A pessoa entende o objetivo e sabe por onde começar?
- Relaciona URI, diretiva e caminho no disco?
- Usa trace e logs para formular uma correção?
- Explica por que a correção funciona?
- Resolve a variação com menos orientação?

A meta inicial de 10–15 minutos é uma hipótese de duração, a validar com usuários. Testes automatizados comprovam funcionamento; a observação de uso avalia a contribuição pedagógica.

## 10. Sequência de trabalho e próximo passo

Ordem: modelo/conteúdo → missão jogável → ambiente visual → retomada/qualidade → avaliação e expansão.

Primeiro marco de implementação: cenário piloto reproduzível, modelo de tentativa e validação comportamental, antes de construir as animações.

O piloto está disponível pelo botão “Missão: imagens da loja”. As fases 1–4 foram implementadas para esse recorte. A fase 5 avançou tecnicamente: mapa da campanha, narrativa nos dez capítulos, revisões, checkpoints e incidente integrado. Falta a observação de uso com pessoas para medir clareza, autonomia e transferência do aprendizado antes de ampliar os incidentes.
