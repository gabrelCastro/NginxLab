import { useRef } from 'react'
import { AlertTriangle, Cloud, CloudOff, CloudUpload, Download, HardDrive, LoaderCircle, RefreshCw } from 'lucide-react'
import type { SyncStatus as Status } from '../sync/engine'
import { useSync } from '../sync/progressSync'
import { AccountSection } from './AccountSection'

const labels: Record<Status, string> = {
  disabled: 'Só neste navegador',
  connecting: 'Conectando…',
  importing: 'Importando progresso…',
  syncing: 'Sincronizando…',
  pending: 'Alterações não enviadas',
  offline: 'Offline',
  synced: 'Sincronizado',
  conflict: 'Conflito de versões',
  error: 'Envio recusado'
}

function time(iso: string | undefined) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function SyncStatus() {
  const details = useRef<HTMLDetailsElement>(null)
  const snapshot = useSync((state) => state.snapshot)
  const retry = useSync((state) => state.retry)
  const preserved = useSync((state) => state.preserved)
  const { status, pending, attemptsPending, rejected, lastSyncedAt, nextRetryAt, message, restored, backups } = snapshot
  const Icon = status === 'synced' ? Cloud : status === 'offline' ? CloudOff : status === 'conflict' || status === 'error' ? AlertTriangle : status === 'pending' ? CloudUpload : status === 'disabled' ? HardDrive : LoaderCircle
  const busy = status === 'connecting' || status === 'importing' || status === 'syncing'
  const changes = `${pending} ${pending === 1 ? 'checkpoint' : 'checkpoints'}`

  const description = {
    disabled: 'A sincronização está desativada nesta instalação. O progresso fica guardado somente neste navegador.',
    connecting: 'Verificando o progresso guardado no servidor. Você pode continuar estudando; nada deste navegador é descartado.',
    importing: 'Enviando o progresso que já existia neste navegador. Isso acontece uma única vez.',
    syncing: 'Enviando as últimas mudanças. Elas só contam como sincronizadas depois da confirmação do servidor.',
    pending: pending ? `${changes} com mudanças ainda não confirmadas pelo servidor. O envio é automático.` : 'Há itens aguardando confirmação do servidor. O envio é automático.',
    offline: `Sem conexão com o servidor de progresso. ${pending ? `${changes} aguardando envio. ` : ''}Tudo continua guardado neste navegador e será enviado quando a conexão voltar.`,
    synced: 'Todas as mudanças deste navegador foram confirmadas pelo servidor.',
    conflict: 'Um checkpoint mudou aqui e no servidor. Nada foi descartado: escolha qual versão continuar no aviso abaixo da barra.',
    error: `O servidor recusou ${rejected} ${rejected === 1 ? 'checkpoint' : 'checkpoints'} (por exemplo, por tamanho). Continuam guardados neste navegador; a próxima mudança tenta de novo.`
  }[status]

  return <details className={`sync-menu sync-${status}`} ref={details} onKeyDown={(event) => { if (event.key === 'Escape' && details.current) details.current.open = false }}>
    <summary aria-label={`Progresso: ${labels[status]}`}><Icon size={14} className={busy ? 'spin' : undefined} aria-hidden="true" /><span className="sync-label" role="status">{labels[status]}</span></summary>
    <div className="sync-menu-content">
      <strong>{labels[status]}</strong>
      <p>{description}</p>
      {message && status === 'offline' && <p className="sync-detail">{message}{nextRetryAt ? ` Nova tentativa às ${time(new Date(nextRetryAt).toISOString())}.` : ''}</p>}
      {lastSyncedAt && <p className="sync-detail">Última confirmação do servidor: {time(lastSyncedAt)}.</p>}
      {restored > 0 && <p className="sync-detail">{restored} {restored === 1 ? 'checkpoint restaurado' : 'checkpoints restaurados'} do servidor nesta sessão.</p>}
      {attemptsPending > 0 && <p className="sync-detail">{attemptsPending} {attemptsPending === 1 ? 'solução de missão aguarda' : 'soluções de missão aguardam'} verificação do servidor.</p>}
      <p className="sync-detail">Soluções de missões são reexecutadas e verificadas pelo servidor. Conclusões de capítulos continuam informadas pelo navegador.</p>
      <div className="sync-actions">
        {(status === 'offline' || status === 'pending' || status === 'error') && <button type="button" onClick={retry}><RefreshCw size={13} /> Tentar agora</button>}
        {backups > 0 && <button type="button" onClick={() => downloadJson('nginxlearn-copias-preservadas.json', preserved())}><Download size={13} /> Baixar cópias preservadas ({backups})</button>}
      </div>
      <AccountSection />
    </div>
  </details>
}
