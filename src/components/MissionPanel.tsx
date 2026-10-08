import { BookOpen, CheckCircle2, Eye, Lightbulb, RotateCcw, Search } from 'lucide-react'
import { missionScenarios } from '../missions/catalog'
import { useLab } from '../store/useLab'
import { MissionVerification } from './MissionVerification'
import { Panel } from './Panel'

export function MissionPanel() {
  const variant = useLab((state) => state.missionVariant)
  const stage = useLab((state) => state.missionStage)
  const prediction = useLab((state) => state.missionPrediction)
  const predictionExplored = useLab((state) => state.missionPredictionExplored)
  const hintCount = useLab((state) => state.missionHintCount)
  const primaryHintCount = useLab((state) => state.missionPrimaryHintCount)
  const attempts = useLab((state) => state.missionAttempts)
  const catalogSource = useLab((state) => state.missionCatalogSource)
  const validation = useLab((state) => state.missionValidation)
  const storageAvailable = useLab((state) => state.storageAvailable)
  const reloadCount = useLab((state) => state.missionReloadCount)
  const draft = useLab((state) => state.session.draftSource)
  const active = useLab((state) => state.session.activeSource)
  const openShop = useLab((state) => state.browseShop)
  const choose = useLab((state) => state.setMissionPrediction)
  const inspect = useLab((state) => state.inspectMission)
  const hint = useLab((state) => state.revealMissionHint)
  const check = useLab((state) => state.checkMission)
  const transfer = useLab((state) => state.startTransfer)
  const startIntegration = useLab((state) => state.startIntegration)
  const integrationCompletions = useLab((state) => state.missionIntegrationCompletions)
  const run = useLab((state) => state.runCommand)
  const restart = useLab((state) => state.restartMission)
  const scenario = missionScenarios[variant]
  const showHints = stage === 'repair' || stage === 'transfer' || stage === 'integration'

  return <Panel title={scenario.title} eyebrow="Missão • Verde & Co." className="mission-panel">
    <div className="mission-content">
      <div className="mission-story"><span className="mission-story-label">Chamado da loja</span><p>{variant === 'catalog' ? 'A página do catálogo abre, mas a foto da caneca desapareceu. Descubra onde o nginx procura o arquivo e restaure a imagem sem quebrar a página inicial.' : variant === 'transfer' ? 'Chegou um novo produto. A foto do vaso não aparece. Investigue e resolva usando o que você aprendeu.' : 'A loja responde, mas a imagem do produto e a rota /dashboard falham. Corrija os dois problemas e preserve a resposta do site padrão.'}</p></div>
      {variant === 'integration' ? <div className="mission-progress" aria-label="Etapas da revisão"><span className="done">Investigar</span><span className={stage === 'integration' ? 'current' : 'done'}>Corrigir</span><span className={stage === 'campaign-complete' ? 'done' : ''}>Comprovar</span></div> : <div className="mission-progress" aria-label="Etapas da missão"><span className={stage === 'observe' || stage === 'predict' ? 'current' : 'done'}>Observar</span><span className={stage === 'investigate' ? 'current' : ['repair', 'transfer-intro', 'transfer', 'complete'].includes(stage) ? 'done' : ''}>Investigar</span><span className={stage === 'repair' ? 'current' : ['transfer-intro', 'transfer', 'complete'].includes(stage) ? 'done' : ''}>Corrigir</span><span className={stage === 'transfer' ? 'current' : stage === 'complete' ? 'done' : ''}>Aplicar</span></div>}
      {!storageAvailable && <p className="mission-warning" role="status">O navegador não permitiu salvar. A missão continua nesta sessão.</p>}

      {stage === 'observe' && <div className="mission-step"><h3>1. Observe o problema</h3><p>Abra a loja. A página e a imagem farão duas requisições ao simulador. Veja o que funciona e o que falha.</p><button type="button" className="mission-primary" onClick={openShop}><Eye size={15} /> Abrir a loja</button></div>}

      {stage === 'predict' && <div className="mission-step"><h3>2. Faça uma previsão</h3><p>Com a configuração atual, qual caminho o nginx tentará abrir para <code>{scenario.imageUri}</code>?</p><div className="mission-choices">{scenario.prediction.map((choice, index) => <button type="button" key={choice} onClick={() => choose(index)}><code>{choice}</code></button>)}</div><button type="button" className="mission-link" onClick={() => choose(null)}>Explorar sem responder</button>{predictionExplored && <p className="mission-note">Você já explorou o ambiente. A resposta agora ajuda a refletir, mas não conta como previsão inicial.</p>}</div>}

      {stage === 'investigate' && <div className="mission-step"><h3>3. Compare com a evidência</h3>{prediction !== null ? <p className={prediction === scenario.correctPrediction ? 'mission-good' : 'mission-note'}>{scenario.explanations[prediction]}</p> : <p>Sem problema: use as evidências para descobrir o caminho.</p>}<p>Abra o mapa da requisição e procure a etapa do disco. Se quiser, use <code>tail /var/log/nginx/error.log</code> e <code>ls /data/catalogo</code> no terminal.</p><button type="button" className="mission-primary" onClick={inspect}><Search size={15} /> Entendi a evidência</button></div>}

      {(stage === 'repair' || stage === 'transfer' || stage === 'integration') && <div className="mission-step"><h3>{stage === 'repair' ? '4. Corrija e comprove' : stage === 'transfer' ? 'Desafio: resolva sozinho' : 'Revisão: duas falhas, uma loja'}</h3><p>{stage === 'repair' ? 'Edite a configuração, teste, recarregue e abra a loja de novo. A imagem precisa vir do arquivo correto e a página inicial deve continuar funcionando.' : stage === 'transfer' ? 'O arquivo existe em /opt/produtos, mas o endereço público começa com /midia/. Descubra o caminho tentado e faça a foto aparecer. Não há comando pronto.' : 'Abra a loja e compare quatro respostas: /, a imagem, /dashboard e um Host desconhecido. Repare os dois caminhos quebrados. Depois do reload, confirme todos novamente.'}</p><button type="button" className="mission-secondary" onClick={openShop}><Eye size={14} /> Abrir ou atualizar a loja</button><div className="mission-command-actions"><button type="button" onClick={() => run('nginx -t')}>Testar nginx -t</button><button type="button" onClick={() => run('nginx -s reload')}>Recarregar nginx</button></div><p className="mission-config-status">{draft !== active ? 'Configuração editada; falta recarregar.' : reloadCount ? 'Configuração ativa recarregada.' : 'Configuração inicial ativa.'}</p><button type="button" className="mission-primary" onClick={check}><CheckCircle2 size={15} /> Validar solução</button>{validation && <p role="status" className={validation.ok ? 'mission-good' : 'mission-note'}>{validation.message}</p>}</div>}

      {stage === 'transfer-intro' && <div className="mission-step"><h3>Você restaurou a imagem</h3><p>A página e a foto vieram dos arquivos esperados. Agora, aplique a mesma ideia a outro caminho sem seguir uma receita.</p><MissionVerification variant="catalog" /><button type="button" className="mission-primary" onClick={transfer}><BookOpen size={15} /> Começar desafio final</button></div>}

      {stage === 'complete' && <div className="mission-step mission-finish"><CheckCircle2 size={25} /><h3>Missão concluída</h3><p>Você diagnosticou o 404, corrigiu o mapeamento e resolveu um segundo caso. Com <code>root</code>, a URI inteira é anexada à pasta; com <code>alias</code>, o prefixo da location é substituído.</p><p>Conclusões: {attempts.length} · Dicas nesta tentativa: {primaryHintCount + hintCount}.</p><MissionVerification variant="transfer" /><button type="button" className="mission-primary" onClick={startIntegration}>Próximo incidente: duas rotas falham</button><button type="button" className="mission-secondary" onClick={restart}><RotateCcw size={14} /> Refazer a missão</button></div>}

      {stage === 'campaign-complete' && <div className="mission-step mission-finish"><CheckCircle2 size={25} /><h3>Incidente resolvido</h3><p>A imagem chega do arquivo certo, /dashboard recebe o ponto de entrada da aplicação e o Host desconhecido continua no servidor padrão. Você combinou seleção de server, alias, location e try_files.</p><p>Revisões concluídas: {integrationCompletions}.</p><MissionVerification variant="integration" /><button type="button" className="mission-secondary" onClick={startIntegration}><RotateCcw size={14} /> Refazer incidente</button></div>}

      {showHints && <div className="mission-hints"><button type="button" className="mission-link" onClick={hint} disabled={hintCount >= scenario.hints.length}><Lightbulb size={14} /> {hintCount ? 'Próxima dica' : 'Preciso de uma dica'}</button>{scenario.hints.slice(0, hintCount).map((item, index) => <p key={item}><strong>Dica {index + 1}.</strong> {item}</p>)}{stage === 'transfer' && hintCount >= 3 && catalogSource && <details className="mission-previous"><summary>Rever a configuração da caneca</summary><pre>{catalogSource}</pre></details>}</div>}
    </div>
  </Panel>
}
