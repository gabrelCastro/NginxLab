import { useState } from 'react'
import { AlertTriangle, Download, Laptop, Server } from 'lucide-react'
import { checkpointTitle, describeCheckpoint } from '../sync/describe'
import { useSync } from '../sync/progressSync'
import { downloadJson } from './SyncStatus'

function when(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SyncConflicts() {
  const conflicts = useSync((state) => state.snapshot.conflicts)
  const resolve = useSync((state) => state.resolve)
  const copiesFor = useSync((state) => state.copiesFor)
  const resolveAll = useSync((state) => state.resolveAll)
  const [open, setOpen] = useState(false)
  if (!conflicts.length) return null
  const names = conflicts.map((conflict) => `“${checkpointTitle(conflict.scope, conflict.scopeId)}”`).join(', ')

  return <section className="sync-conflicts" aria-labelledby="sync-conflicts-title">
    <div className="sync-conflicts-bar" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      <p id="sync-conflicts-title"><strong>Há duas versões de {names}.</strong> Este navegador e o servidor mudaram de forma diferente. Nada foi descartado e esse checkpoint não é enviado até você escolher.</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Fechar comparação' : 'Comparar e escolher'}</button>
    </div>
    {open && conflicts.length > 1 && <div className="sync-bulk">
      <span>{conflicts.length} checkpoints em conflito.</span>
      <button type="button" onClick={() => resolveAll('local')}>Manter todos deste navegador</button>
      <button type="button" disabled={!conflicts.every((conflict) => conflict.serverUsable)} onClick={() => resolveAll('server')}>Usar todos do servidor</button>
    </div>}
    {open && conflicts.map((conflict) => {
      const title = checkpointTitle(conflict.scope, conflict.scopeId)
      return <article key={conflict.key} className="sync-conflict" aria-label={`Conflito em ${title}`}>
        <h3>{title}</h3>
        <div className="sync-versions">
          <div className="sync-version">
            <h4><Laptop size={14} aria-hidden="true" /> Neste navegador</h4>
            <ul>{(conflict.local ? describeCheckpoint(conflict.scope, conflict.scopeId, conflict.local.payload) : ['Sem versão local']).map((line) => <li key={line}>{line}</li>)}</ul>
            <button type="button" className="mission-primary" disabled={!conflict.local} onClick={() => resolve(conflict.key, 'local')}>Manter a versão deste navegador</button>
            <small>A versão do servidor fica guardada como cópia preservada.</small>
          </div>
          <div className="sync-version">
            <h4><Server size={14} aria-hidden="true" /> No servidor · {when(conflict.server.updatedAt)}</h4>
            <ul>{describeCheckpoint(conflict.scope, conflict.scopeId, conflict.server.payload).map((line) => <li key={line}>{line}</li>)}</ul>
            <button type="button" className="mission-secondary" disabled={!conflict.serverUsable} onClick={() => resolve(conflict.key, 'server')}>Usar a versão do servidor</button>
            <small>{conflict.serverUsable ? 'A versão deste navegador fica guardada como cópia preservada.' : 'Esta versão foi criada por outra versão do app e não pode ser aberta aqui.'}</small>
          </div>
        </div>
        <button type="button" className="mission-link" onClick={() => downloadJson(`nginxlearn-conflito-${conflict.scopeId}.json`, copiesFor(conflict.key))}><Download size={13} /> Baixar as duas versões (JSON)</button>
      </article>
    })}
  </section>
}
