import type { CheckpointScope, ProgressApi, RemoteCheckpoint } from './api'
import { attemptScenarioVersion, type AttemptStore } from './attempts'
import { fingerprint } from './stableJson'

export interface LocalCheckpoint {
  scope: CheckpointScope
  scopeId: string
  schemaVersion: number
  scenarioVersion: string
  payload: object
}

// Ponte entre o motor e o estado do laboratório. O motor nunca interpreta o payload;
// a ponte valida o que vem do servidor antes de aplicar.
export interface LocalBridge {
  list(): LocalCheckpoint[]
  accepts(remote: RemoteCheckpoint): boolean
  apply(remote: RemoteCheckpoint): boolean
  // Checkpoint sem nenhum progresso (só aberto). Ao entrar numa conta, cede ao servidor sem conflito.
  isTrivial?(local: LocalCheckpoint): boolean
}

export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): boolean
}

export interface SyncDeps {
  api: ProgressApi
  bridge: LocalBridge
  store: KeyValueStore
  isOnline: () => boolean
  now: () => Date
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  // Exclusão mútua entre abas (Web Locks). Sem ela, cada aba sincroniza sozinha.
  lock?: (task: () => Promise<boolean>) => Promise<boolean>
  attempts?: AttemptStore
}

export type SyncStatus = 'disabled' | 'connecting' | 'importing' | 'syncing' | 'pending' | 'offline' | 'synced' | 'conflict' | 'error'

export interface ConflictView {
  key: string
  scope: CheckpointScope
  scopeId: string
  server: RemoteCheckpoint
  local: LocalCheckpoint | undefined
  serverUsable: boolean
  detectedAt: string
}

export interface SyncSnapshot {
  status: SyncStatus
  pending: number
  attemptsPending: number
  rejected: number
  conflicts: ConflictView[]
  backups: number
  restored: number
  importedAt: string | undefined
  lastSyncedAt: string | undefined
  email: string | undefined
  nextRetryAt: number | undefined
  message: string | undefined
}

interface SyncRecord {
  revision: number
  syncedHash: string | null
  rejectedHash?: string
  rejectedStatus?: number
}

interface StoredConflict {
  key: string
  server: RemoteCheckpoint
  detectedAt: string
}

export interface PreservedCopy {
  id: string
  key: string
  origin: 'local' | 'server'
  savedAt: string
  revision: number | null
  payload: unknown
}

interface SyncMeta {
  version: 1
  token?: string
  learnerId?: string
  email?: string
  importedAt?: string
  lastSyncedAt?: string
  records: Record<string, SyncRecord>
  conflicts: Record<string, StoredConflict>
}

export const syncMetaKey = 'nginxlearn:sync-v1'
export const preservedCopiesKey = 'nginxlearn:sync-preserved-v1'
const maxPreservedCopies = 20
const flushDelayMs = 800
const maxRetryMs = 60_000

export function checkpointKey(scope: CheckpointScope, scopeId: string) {
  return `${scope}/${scopeId}`
}

function readJson<T>(store: KeyValueStore, key: string, valid: (value: unknown) => value is T): T | undefined {
  try {
    const raw = store.get(key)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return valid(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isMeta(value: unknown): value is SyncMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<SyncMeta>
  return meta.version === 1 && !!meta.records && typeof meta.records === 'object' && !!meta.conflicts && typeof meta.conflicts === 'object' && (meta.token === undefined || typeof meta.token === 'string')
}

function isCopies(value: unknown): value is PreservedCopy[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object' && typeof item.key === 'string' && typeof item.id === 'string')
}

export class SyncEngine {
  private meta: SyncMeta
  private copies: PreservedCopy[]
  private readonly hashes = new WeakMap<object, string>()
  private readonly listeners = new Set<(snapshot: SyncSnapshot) => void>()
  private snapshot: SyncSnapshot
  private running = false
  private current: Promise<void> = Promise.resolve()
  private again = false
  private pulled = false
  private confirmed = false
  private activity: 'connecting' | 'importing' | 'syncing' | undefined
  private offlineReason: string | undefined
  private failures = 0
  private retryTimer: unknown
  private flushTimer: unknown
  private nextRetryAt: number | undefined
  private restored = 0
  private disposed = false
  private storeWritable = true

  constructor(private readonly deps: SyncDeps) {
    this.meta = readJson(deps.store, syncMetaKey, isMeta) ?? { version: 1, records: {}, conflicts: {} }
    this.copies = readJson(deps.store, preservedCopiesKey, isCopies) ?? []
    this.snapshot = this.compute()
  }

  getSnapshot = () => this.snapshot

  subscribe(listener: (snapshot: SyncSnapshot) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start() {
    return this.run()
  }

  // Resolve quando o ciclo em andamento terminar (usado pelos testes).
  idle() {
    return this.current
  }

  dispose() {
    this.disposed = true
    this.deps.clearTimer(this.retryTimer)
    this.deps.clearTimer(this.flushTimer)
    this.listeners.clear()
  }

  // Chamado a cada mudança relevante do laboratório. Atualiza o estado na hora
  // (para nunca exibir "sincronizado" com mudança pendente) e agenda o envio.
  markChanged() {
    if (this.disposed) return
    this.emit()
    if (this.flushTimer !== undefined || this.retryTimer !== undefined) return
    this.flushTimer = this.deps.setTimer(() => {
      this.flushTimer = undefined
      void this.run()
    }, flushDelayMs)
  }

  // Ao voltar a conexão ou a aba ficar visível: busca novidades e reenvia a fila.
  refresh() {
    if (this.disposed) return Promise.resolve()
    this.pulled = false
    this.deps.clearTimer(this.retryTimer)
    this.retryTimer = undefined
    this.nextRetryAt = undefined
    return this.run()
  }

  // Outra aba alterou o estado de sincronização compartilhado.
  reloadShared() {
    if (!this.storeWritable) return
    this.meta = readJson(this.deps.store, syncMetaKey, isMeta) ?? this.meta
    this.copies = readJson(this.deps.store, preservedCopiesKey, isCopies) ?? this.copies
    this.emit()
  }

  wentOffline() {
    this.offlineReason = 'O navegador está sem conexão.'
    this.emit()
  }

  conflictCopies(key: string) {
    const conflict = this.meta.conflicts[key]
    if (!conflict) return undefined
    const local = this.deps.bridge.list().find((item) => checkpointKey(item.scope, item.scopeId) === key)
    return { exportedAt: this.deps.now().toISOString(), checkpoint: key, local: local?.payload ?? null, server: { revision: conflict.server.revision, updatedAt: conflict.server.updatedAt, payload: conflict.server.payload } }
  }

  preservedCopies() {
    return [...this.copies]
  }

  resolveConflict(key: string, choice: 'local' | 'server') {
    const conflict = this.meta.conflicts[key]
    if (!conflict) return false
    const local = this.deps.bridge.list().find((item) => checkpointKey(item.scope, item.scopeId) === key)
    const serverHash = this.hashOf(conflict.server.payload)
    if (choice === 'server') {
      if (!this.deps.bridge.accepts(conflict.server)) return false
      if (local) this.preserve(key, 'local', null, local.payload)
      if (!this.deps.bridge.apply(conflict.server)) return false
    } else {
      // A versão do servidor fica guardada antes de ser substituída pela deste navegador.
      this.preserve(key, 'server', conflict.server.revision, conflict.server.payload)
    }
    this.meta.records[key] = { revision: conflict.server.revision, syncedHash: serverHash }
    delete this.meta.conflicts[key]
    this.persist()
    this.markChanged()
    return true
  }

  resolveAll(choice: 'local' | 'server') {
    for (const key of Object.keys(this.meta.conflicts)) this.resolveConflict(key, choice)
  }

  // Protege o visitante atual com e-mail e senha; o ID do aprendiz não muda.
  async createAccount(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    await this.run()
    const token = this.meta.token
    if (!token) return { ok: false, message: 'Sem conexão com o servidor de progresso. Tente de novo quando estiver online.' }
    const result = await this.deps.api.createAccount(token, email.trim(), password)
    if (result.kind === 'ok') {
      this.meta.email = result.value.email
      this.persist()
      this.emit()
      return { ok: true }
    }
    return { ok: false, message: this.accountError(result) }
  }

  // Entra numa conta neste navegador. O progresso local não é apagado: o que só existe aqui
  // é enviado, o que é igual é adotado e versões diferentes viram conflitos para escolher.
  async signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const result = await this.deps.api.signIn(email.trim(), password)
    if (result.kind !== 'ok') return { ok: false, message: this.accountError(result) }
    await this.current
    for (const conflict of Object.values(this.meta.conflicts)) this.preserve(conflict.key, 'server', conflict.server.revision, conflict.server.payload)
    this.meta = { version: 1, token: result.value.token, learnerId: result.value.learnerId, email: result.value.email, importedAt: this.meta.importedAt ?? this.deps.now().toISOString(), records: {}, conflicts: {} }
    this.persist()
    await this.refresh()
    return { ok: true }
  }

  // Sai neste navegador. O token é revogado no servidor quando possível; localmente o
  // progresso continua, ligado a um novo visitante (quem quiser apagar faz isso na interface).
  async signOut() {
    await this.current
    const token = this.meta.token
    if (token) await this.deps.api.signOut(token)
    this.forgetIdentity()
    this.emit()
  }

  private accountError(result: { kind: string; message?: string; reason?: string; code?: string }) {
    if (result.kind === 'unavailable') return result.reason ?? 'Servidor indisponível.'
    if (result.kind === 'unauthorized') return 'A sessão expirou. Recarregue a página e tente de novo.'
    return result.message ?? 'O servidor recusou o pedido.'
  }

  private run(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.running) { this.again = true; return this.current }
    this.current = this.loop()
    return this.current
  }

  private async loop() {
    this.running = true
    try {
      let rounds = 0
      do {
        this.again = false
        const done = this.deps.lock ? await this.deps.lock(() => { this.reloadShared(); return this.cycle() }) : await this.cycle()
        if (!done) break
      } while (this.again && ++rounds < 5)
    } finally {
      this.running = false
      this.activity = undefined
      this.emit()
    }
  }

  private async cycle(): Promise<boolean> {
    if (!this.deps.isOnline()) { this.wentOffline(); return false }
    if (!this.meta.token) {
      this.setActivity('connecting')
      const registered = await this.deps.api.register()
      if (registered.kind !== 'ok') return this.fail(registered.kind === 'unavailable' ? registered.reason : 'Não foi possível criar a identidade de visitante.')
      this.meta = { version: 1, token: registered.value.token, learnerId: registered.value.learnerId, records: {}, conflicts: this.meta.conflicts }
      this.pulled = true // Visitante novo: não há nada para restaurar.
      this.persist()
    }
    const token = this.meta.token!
    if (!this.pulled) {
      this.setActivity('connecting')
      const listed = await this.deps.api.list(token)
      if (listed.kind === 'unauthorized') { this.forgetIdentity(); this.again = true; return true }
      if (listed.kind !== 'ok') return this.fail(listed.kind === 'unavailable' ? listed.reason : 'O servidor recusou a leitura do progresso.')
      this.reconcile(listed.value)
      if (this.deps.attempts) {
        const attempts = await this.deps.api.listAttempts(token)
        if (attempts.kind === 'unauthorized') { this.forgetIdentity(); this.again = true; return true }
        if (attempts.kind === 'unavailable') return this.fail(attempts.reason)
        if (attempts.kind === 'ok') this.deps.attempts.mergeRemote(attempts.value)
      }
      this.pulled = true
      this.succeeded()
    }
    for (const local of this.deps.bridge.list()) {
      const key = checkpointKey(local.scope, local.scopeId)
      if (this.meta.conflicts[key]) continue
      const hash = this.hashOf(local.payload)
      const record = this.meta.records[key] ?? { revision: 0, syncedHash: null }
      if (record.syncedHash === hash || record.rejectedHash === hash) continue
      this.setActivity(this.meta.importedAt ? 'syncing' : 'importing')
      const result = await this.deps.api.put(token, local.scope, local.scopeId, { schemaVersion: local.schemaVersion, scenarioVersion: local.scenarioVersion, expectedRevision: record.revision, payload: local.payload })
      if (result.kind === 'ok') {
        this.meta.records[key] = { revision: result.value.revision, syncedHash: hash }
        this.succeeded()
      } else if (result.kind === 'conflict') {
        this.succeeded()
        if (!result.current) {
          // O registro esperado não existe mais no servidor: recria a partir da cópia local.
          this.meta.records[key] = { revision: 0, syncedHash: null }
          this.again = true
        } else if (this.hashOf(result.current.payload) === hash) {
          // Mesmo conteúdo (por exemplo, a resposta anterior se perdeu na rede).
          this.meta.records[key] = { revision: result.current.revision, syncedHash: hash }
        } else {
          this.meta.conflicts[key] = { key, server: result.current, detectedAt: this.deps.now().toISOString() }
        }
      } else if (result.kind === 'unauthorized') {
        this.forgetIdentity()
        this.again = true
        return true
      } else if (result.kind === 'unavailable') {
        return this.fail(result.reason)
      } else {
        this.succeeded()
        this.meta.records[key] = { ...record, rejectedHash: hash, rejectedStatus: result.status }
      }
      this.persist()
      this.emit()
    }
    // Soluções de missão: o veredito é sempre do servidor, que reexecuta a configuração.
    for (const attempt of this.deps.attempts?.pending() ?? []) {
      this.setActivity(this.meta.importedAt ? 'syncing' : 'importing')
      const result = await this.deps.api.submitAttempt(token, attempt.missionId, { attemptId: attempt.attemptId, scenarioVersion: attemptScenarioVersion, config: attempt.config, clientReport: attempt.clientReport })
      if (result.kind === 'ok') {
        this.deps.attempts!.settle(attempt.attemptId, result.value.status === 'VERIFIED' ? 'verified' : 'rejected', result.value.result.message)
        this.succeeded()
      } else if (result.kind === 'unauthorized') {
        this.forgetIdentity()
        this.again = true
        return true
      } else if (result.kind === 'unavailable') {
        return this.fail(result.reason)
      } else {
        this.deps.attempts!.settle(attempt.attemptId, 'error', 'O servidor não conseguiu verificar esta tentativa nesta versão do app.')
        this.succeeded()
      }
      this.emit()
    }
    if (!this.meta.importedAt) this.meta.importedAt = this.deps.now().toISOString()
    this.meta.lastSyncedAt = this.deps.now().toISOString()
    this.confirmed = true
    this.persist()
    return true
  }

  private reconcile(remote: RemoteCheckpoint[]) {
    const locals = new Map(this.deps.bridge.list().map((item) => [checkpointKey(item.scope, item.scopeId), item]))
    const seen = new Set<string>()
    for (const server of remote) {
      const key = checkpointKey(server.scope, server.scopeId)
      seen.add(key)
      const record = this.meta.records[key] ?? { revision: 0, syncedHash: null }
      const existing = this.meta.conflicts[key]
      if (existing) {
        if (server.revision > existing.server.revision) this.meta.conflicts[key] = { ...existing, server }
        continue
      }
      if (server.revision === record.revision) continue
      const local = locals.get(key)
      const serverHash = this.hashOf(server.payload)
      const localHash = local ? this.hashOf(local.payload) : null
      if (localHash === serverHash) {
        this.meta.records[key] = { revision: server.revision, syncedHash: serverHash }
      } else if ((!local || localHash === record.syncedHash || this.deps.bridge.isTrivial?.(local)) && this.deps.bridge.accepts(server) && this.deps.bridge.apply(server)) {
        // Sem mudança local desde a última confirmação: a versão do servidor é a mais nova.
        this.meta.records[key] = { revision: server.revision, syncedHash: serverHash }
        this.restored++
      } else if (local) {
        this.meta.conflicts[key] = { key, server, detectedAt: this.deps.now().toISOString() }
      }
    }
    for (const [key, record] of Object.entries(this.meta.records)) {
      if (!seen.has(key) && record.revision > 0) this.meta.records[key] = { revision: 0, syncedHash: null }
    }
    this.persist()
  }

  // Token rejeitado (por exemplo, banco recriado). O progresso local continua sendo a
  // fonte; um novo visitante é criado e tudo é importado de novo. Versões de servidor
  // em conflito pertenciam à identidade antiga e são preservadas como cópia.
  private forgetIdentity() {
    for (const conflict of Object.values(this.meta.conflicts)) this.preserve(conflict.key, 'server', conflict.server.revision, conflict.server.payload)
    this.meta = { version: 1, records: {}, conflicts: {} }
    this.pulled = false
    this.persist()
  }

  private fail(reason: string) {
    this.offlineReason = reason
    this.failures++
    const delay = Math.min(maxRetryMs, 2_000 * 2 ** (this.failures - 1))
    this.deps.clearTimer(this.retryTimer)
    this.nextRetryAt = this.deps.now().getTime() + delay
    this.retryTimer = this.deps.setTimer(() => {
      this.retryTimer = undefined
      this.nextRetryAt = undefined
      void this.run()
    }, delay)
    return false
  }

  private succeeded() {
    this.offlineReason = undefined
    this.failures = 0
    this.nextRetryAt = undefined
  }

  private setActivity(activity: 'connecting' | 'importing' | 'syncing') {
    if (this.activity === activity) return
    this.activity = activity
    this.emit()
  }

  private preserve(key: string, origin: PreservedCopy['origin'], revision: number | null, payload: unknown) {
    const savedAt = this.deps.now().toISOString()
    this.copies = [{ id: `${key}@${savedAt}#${origin}`, key, origin, savedAt, revision, payload }, ...this.copies].slice(0, maxPreservedCopies)
    this.storeWritable = this.deps.store.set(preservedCopiesKey, JSON.stringify(this.copies)) && this.storeWritable
  }

  private hashOf(payload: unknown) {
    if (!payload || typeof payload !== 'object') return fingerprint(payload)
    const cached = this.hashes.get(payload)
    if (cached) return cached
    const hash = fingerprint(payload)
    this.hashes.set(payload, hash)
    return hash
  }

  private persist() {
    this.storeWritable = this.deps.store.set(syncMetaKey, JSON.stringify(this.meta))
  }

  private compute(): SyncSnapshot {
    const locals = this.deps.bridge.list()
    let pending = 0
    let rejected = 0
    for (const local of locals) {
      const key = checkpointKey(local.scope, local.scopeId)
      if (this.meta.conflicts[key]) continue
      const record = this.meta.records[key]
      const hash = this.hashOf(local.payload)
      if (record?.syncedHash === hash) continue
      if (record?.rejectedHash === hash) rejected++
      else pending++
    }
    const conflicts = Object.values(this.meta.conflicts).map((conflict): ConflictView => {
      const [scope, scopeId] = conflict.key.split('/') as [CheckpointScope, string]
      return { key: conflict.key, scope, scopeId, server: conflict.server, local: locals.find((item) => checkpointKey(item.scope, item.scopeId) === conflict.key), serverUsable: this.deps.bridge.accepts(conflict.server), detectedAt: conflict.detectedAt }
    })
    const attemptsPending = this.deps.attempts?.pending().length ?? 0
    const status: SyncStatus = this.activity ?? (conflicts.length ? 'conflict' : this.offlineReason ? 'offline' : rejected ? 'error' : pending || attemptsPending || !this.confirmed ? (this.confirmed ? 'pending' : 'connecting') : 'synced')
    return {
      status, pending, attemptsPending, rejected, conflicts, backups: this.copies.length, restored: this.restored,
      importedAt: this.meta.importedAt, lastSyncedAt: this.confirmed ? this.meta.lastSyncedAt : undefined, email: this.meta.email,
      nextRetryAt: this.nextRetryAt, message: this.offlineReason
    }
  }

  private emit() {
    this.snapshot = this.compute()
    for (const listener of this.listeners) listener(this.snapshot)
  }
}
