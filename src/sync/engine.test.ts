import { describe, expect, it } from 'vitest'
import type { ApiResult, CheckpointScope, CheckpointWrite, ProgressApi, RemoteAttempt, RemoteCheckpoint } from './api'
import type { AttemptStore, LocalAttempt } from './attempts'
import { SyncEngine, checkpointKey, preservedCopiesKey, syncMetaKey, type KeyValueStore, type LocalBridge, type LocalCheckpoint } from './engine'

// Reordena chaves como o JSONB do PostgreSQL faz, para provar que a comparação é canônica.
function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, jsonb(item)]))
}

class FakeServer implements ProgressApi {
  private data = new Map<string, Map<string, RemoteCheckpoint>>()
  // token → aprendiz; dados são separados por aprendiz, como no servidor real.
  tokens = new Map<string, string>()

  // Os testes observam o primeiro aprendiz criado.
  get rows() { return this.of('learner-1') }

  private of(learner: string) {
    if (!this.data.has(learner)) this.data.set(learner, new Map())
    return this.data.get(learner)!
  }
  calls: string[] = []
  down = false
  loseNextResponse = false
  rejectStatus: number | undefined
  private guests = 0
  private clock = 0

  async register(): Promise<ApiResult<{ token: string; learnerId: string }>> {
    this.calls.push('register')
    if (this.down) return { kind: 'unavailable', reason: 'sem rede' }
    const token = `ngl_${String(++this.guests).padStart(43, 'a')}`
    this.tokens.set(token, `learner-${this.guests}`)
    return { kind: 'ok', value: { token, learnerId: `learner-${this.guests}` } }
  }

  async list(token: string): Promise<ApiResult<RemoteCheckpoint[]>> {
    this.calls.push('list')
    if (this.down) return { kind: 'unavailable', reason: 'sem rede' }
    if (!this.tokens.has(token)) return { kind: 'unauthorized' }
    return { kind: 'ok', value: [...this.of(this.tokens.get(token)!).values()].map((row) => structuredClone(row)) }
  }

  async put(token: string, scope: CheckpointScope, scopeId: string, body: CheckpointWrite): Promise<ApiResult<RemoteCheckpoint>> {
    this.calls.push(`put ${scope}/${scopeId}@${body.expectedRevision}`)
    if (this.down) return { kind: 'unavailable', reason: 'sem rede' }
    if (!this.tokens.has(token)) return { kind: 'unauthorized' }
    if (this.rejectStatus) return { kind: 'rejected', status: this.rejectStatus }
    const key = checkpointKey(scope, scopeId)
    const learner = this.tokens.get(token)!
    const current = this.of(learner).get(key)
    if ((current?.revision ?? 0) !== body.expectedRevision) return { kind: 'conflict', current: current ? structuredClone(current) : null }
    const row = this.write(scope, scopeId, body.payload, (current?.revision ?? 0) + 1, learner)
    if (this.loseNextResponse) { this.loseNextResponse = false; return { kind: 'unavailable', reason: 'resposta perdida' } }
    return { kind: 'ok', value: structuredClone(row) }
  }

  attempts: { attemptId: string; missionId: string; config: string; learner: string }[] = []

  async submitAttempt(token: string, missionId: string, body: { attemptId: string; config: string }): Promise<ApiResult<RemoteAttempt>> {
    this.calls.push(`attempt ${missionId}`)
    if (this.down) return { kind: 'unavailable', reason: 'sem rede' }
    if (!this.tokens.has(token)) return { kind: 'unauthorized' }
    const learner = this.tokens.get(token)!
    if (!this.attempts.some((item) => item.attemptId === body.attemptId && item.learner === learner)) this.attempts.push({ attemptId: body.attemptId, missionId, config: body.config, learner })
    if (this.loseNextResponse) { this.loseNextResponse = false; return { kind: 'unavailable', reason: 'resposta perdida' } }
    return { kind: 'ok', value: this.attemptView(body.attemptId) }
  }

  async listAttempts(token: string): Promise<ApiResult<RemoteAttempt[]>> {
    this.calls.push('list attempts')
    if (!this.tokens.has(token)) return { kind: 'unauthorized' }
    return { kind: 'ok', value: this.attempts.filter((item) => item.learner === this.tokens.get(token)).map((item) => this.attemptView(item.attemptId)) }
  }

  accounts = new Map<string, { password: string; learner: string }>()

  async createAccount(token: string, email: string, password: string): Promise<ApiResult<{ email: string }>> {
    this.calls.push('create account')
    if (!this.tokens.has(token)) return { kind: 'unauthorized' }
    if (this.accounts.has(email)) return { kind: 'rejected', status: 409, code: 'EMAIL_TAKEN', message: 'Já existe uma conta com este e-mail.' }
    this.accounts.set(email, { password, learner: this.tokens.get(token)! })
    return { kind: 'ok', value: { email } }
  }

  async signIn(email: string, password: string): Promise<ApiResult<{ token: string; learnerId: string; email: string }>> {
    this.calls.push('sign in')
    const account = this.accounts.get(email)
    if (account?.password !== password) return { kind: 'rejected', status: 401, code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' }
    const token = `ngl_${String(this.tokens.size + 100).padStart(43, 'b')}`
    this.tokens.set(token, account.learner)
    return { kind: 'ok', value: { token, learnerId: account.learner, email } }
  }

  async signOut(token: string): Promise<ApiResult<true>> {
    this.calls.push('sign out')
    this.tokens.delete(token)
    return { kind: 'ok', value: true }
  }

  // O servidor decide pelo conteúdo, nunca pelo que o cliente relata.
  private attemptView(attemptId: string): RemoteAttempt {
    const item = this.attempts.find((entry) => entry.attemptId === attemptId)!
    const ok = item.config.includes('alias')
    return { attemptId, missionId: item.missionId, scenarioVersion: 'mission-v1', status: ok ? 'VERIFIED' : 'REJECTED', result: { ok, configValid: true, message: ok ? 'ok' : 'A imagem ainda não vem do arquivo certo.' }, createdAt: '2026-10-07T12:00:00Z' }
  }

  // Simula outra aba ou dispositivo gravando com o mesmo visitante.
  write(scope: CheckpointScope, scopeId: string, payload: unknown, revision?: number, learner = 'learner-1') {
    const key = checkpointKey(scope, scopeId)
    const rows = this.of(learner)
    const row: RemoteCheckpoint = { scope, scopeId, schemaVersion: 1, scenarioVersion: scope === 'CHAPTER' ? 'chapters-v1' : 'mission-v1', revision: revision ?? (rows.get(key)?.revision ?? 0) + 1, payload: jsonb(structuredClone(payload)), updatedAt: new Date(Date.UTC(2026, 9, 7, 12, this.clock++)).toISOString() }
    rows.set(key, row)
    return row
  }
}

class FakeLab implements LocalBridge {
  items = new Map<string, LocalCheckpoint>()
  applied: string[] = []
  invalid = new Set<string>()

  set(scopeId: string, payload: object, scope: CheckpointScope = 'CHAPTER') {
    this.items.set(checkpointKey(scope, scopeId), { scope, scopeId, schemaVersion: 1, scenarioVersion: scope === 'CHAPTER' ? 'chapters-v1' : 'mission-v1', payload })
  }

  get(scopeId: string, scope: CheckpointScope = 'CHAPTER') {
    return this.items.get(checkpointKey(scope, scopeId))?.payload
  }

  list() { return [...this.items.values()] }
  isTrivial(local: LocalCheckpoint) { return (local.payload as { draftSource?: string }).draftSource === 'intocado' }
  accepts(remote: RemoteCheckpoint) { return !this.invalid.has(checkpointKey(remote.scope, remote.scopeId)) }
  apply(remote: RemoteCheckpoint) {
    if (!this.accepts(remote)) return false
    this.applied.push(checkpointKey(remote.scope, remote.scopeId))
    this.set(remote.scopeId, structuredClone(remote.payload) as object, remote.scope)
    return true
  }
}

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>()
  get(key: string) { return this.data.get(key) ?? null }
  set(key: string, value: string) { this.data.set(key, value); return true }
}

class MemoryAttempts implements AttemptStore {
  items: LocalAttempt[] = []
  add(missionId: string, config: string) {
    const attempt: LocalAttempt = { attemptId: `tentativa-${this.items.length + 1}`, missionId, config, clientReport: { validation: { ok: true } }, createdAt: '2026-10-07T12:00:00Z', state: 'pending', message: null }
    this.items.push(attempt)
    return attempt
  }
  pending() { return this.items.filter((item) => item.state === 'pending') }
  settle(attemptId: string, state: Exclude<LocalAttempt['state'], 'pending'>, message: string | null) {
    this.items = this.items.map((item) => item.attemptId === attemptId ? { ...item, state, message } : item)
  }
  mergeRemote(remote: RemoteAttempt[]) {
    for (const entry of remote) {
      const state = entry.status === 'VERIFIED' ? 'verified' as const : 'rejected' as const
      if (this.items.some((item) => item.attemptId === entry.attemptId)) this.settle(entry.attemptId, state, entry.result.message)
      else this.items.push({ attemptId: entry.attemptId, missionId: entry.missionId, config: '', clientReport: null, createdAt: entry.createdAt, state, message: entry.result.message })
    }
  }
}

function setup(options: { server?: FakeServer; lab?: FakeLab; store?: MemoryStore; online?: boolean; lock?: (task: () => Promise<boolean>) => Promise<boolean>; attempts?: MemoryAttempts } = {}) {
  const server = options.server ?? new FakeServer()
  const lab = options.lab ?? new FakeLab()
  const store = options.store ?? new MemoryStore()
  const timers = new Map<number, { callback: () => void; ms: number }>()
  let nextTimer = 1
  const network = { online: options.online ?? true }
  const engine = new SyncEngine({
    api: server, bridge: lab, store, isOnline: () => network.online, now: () => new Date('2026-10-07T12:00:00Z'),
    setTimer: (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, ms }); return id },
    clearTimer: (handle) => { timers.delete(handle as number) },
    ...(options.lock ? { lock: options.lock } : {}),
    ...(options.attempts ? { attempts: options.attempts } : {})
  })
  async function runTimers() {
    const pending = [...timers.entries()]
    timers.clear()
    for (const [, timer] of pending) timer.callback()
    await engine.idle()
  }
  return { server, lab, store, engine, timers, network, runTimers }
}

const chapter = (draft: string, steps: string[] = []) => ({ version: 1, id: 'servidor-de-arquivos', draftSource: draft, guide: { completedSteps: steps } })

describe('importação do progresso local', () => {
  it('envia o progresso existente uma única vez e só então indica sincronizado', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('local', ['a', 'b']))
    lab.set('campaign', { version: 1, variant: 'catalog', attempts: [{ completedAt: 'x' }] }, 'MISSION')
    const { server, store, engine } = setup({ lab })
    expect(engine.getSnapshot().status).toBe('connecting')

    const seen: string[] = []
    engine.subscribe((snapshot) => seen.push(snapshot.status))
    await engine.start()

    expect(server.calls).toEqual(['register', 'put CHAPTER/servidor-de-arquivos@0', 'put MISSION/campaign@0'])
    expect(seen).toContain('importing')
    expect(seen.indexOf('synced')).toBe(seen.length - 1)
    expect(engine.getSnapshot().importedAt).toBeDefined()
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('local', ['a', 'b']))

    // Nova sessão no mesmo navegador: sem novo visitante e sem reenviar o que já foi confirmado.
    const again = setup({ server, lab, store })
    await again.engine.start()
    expect(server.calls.slice(3)).toEqual(['list'])
    expect(again.engine.getSnapshot().status).toBe('synced')
    expect(lab.applied).toEqual([])
  })

  it('não duplica nem acusa conflito quando a confirmação da importação se perde', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('local'))
    const { server, engine, runTimers } = setup({ lab })
    server.loseNextResponse = true
    await engine.start()
    expect(engine.getSnapshot().status).toBe('offline')
    expect(engine.getSnapshot().pending).toBe(1)

    await runTimers()
    expect(server.calls.at(-1)).toBe('put CHAPTER/servidor-de-arquivos@0')
    expect(engine.getSnapshot().status).toBe('synced')
    expect(engine.getSnapshot().conflicts).toEqual([])
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')?.revision).toBe(1)
  })

  it('importa de novo, sem perder nada local, quando o servidor não reconhece mais o token', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('local'))
    const { server, store, engine } = setup({ lab })
    await engine.start()
    const fresh = new FakeServer()
    fresh.calls = []
    const next = setup({ server: fresh, lab, store })
    await next.engine.start()
    expect(fresh.calls).toEqual(['list', 'register', 'put CHAPTER/servidor-de-arquivos@0'])
    expect(fresh.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('local'))
    expect(next.engine.getSnapshot().status).toBe('synced')
    expect(server.rows.size).toBe(1)
  })
})

describe('restauração e sincronização posterior', () => {
  it('restaura checkpoints mais novos do servidor quando não há mudança local', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('v1'))
    const { server, store, engine } = setup({ lab })
    await engine.start()
    server.write('CHAPTER', 'servidor-de-arquivos', chapter('v2 de outra aba'))
    server.write('CHAPTER', 'varios-sites', { version: 1, id: 'varios-sites', draftSource: 'novo' })

    const next = setup({ server, lab, store })
    await next.engine.start()
    expect(lab.get('servidor-de-arquivos')).toEqual(chapter('v2 de outra aba'))
    expect(lab.get('varios-sites')).toEqual({ version: 1, id: 'varios-sites', draftSource: 'novo' })
    expect(next.engine.getSnapshot()).toMatchObject({ status: 'synced', restored: 2, pending: 0 })
    expect(server.calls.filter((call) => call.startsWith('put'))).toHaveLength(1)
  })

  it('marca a mudança como pendente na hora e envia com a revisão confirmada', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('v1'))
    const { server, engine, runTimers } = setup({ lab })
    await engine.start()
    lab.set('servidor-de-arquivos', chapter('v2'))
    engine.markChanged()
    expect(engine.getSnapshot()).toMatchObject({ status: 'pending', pending: 1 })
    await runTimers()
    expect(server.calls.at(-1)).toBe('put CHAPTER/servidor-de-arquivos@1')
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0 })
  })

  it('não reenvia quando o conteúdo não mudou', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('v1'))
    const { server, engine, runTimers } = setup({ lab })
    await engine.start()
    lab.set('servidor-de-arquivos', chapter('v1'))
    engine.markChanged()
    expect(engine.getSnapshot().status).toBe('synced')
    await runTimers()
    expect(server.calls.filter((call) => call.startsWith('put'))).toHaveLength(1)
  })
})

describe('modo offline', () => {
  it('mantém a fila no navegador e envia quando a conexão volta', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('feito offline'))
    const { server, engine, network } = setup({ lab, online: false })
    await engine.start()
    expect(server.calls).toEqual([])
    expect(engine.getSnapshot()).toMatchObject({ status: 'offline', pending: 1 })
    expect(engine.getSnapshot().lastSyncedAt).toBeUndefined()

    network.online = true
    await engine.refresh()
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('feito offline'))
    expect(engine.getSnapshot().status).toBe('synced')
  })

  it('tenta de novo com espera crescente quando o servidor não responde', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('local'))
    const { server, engine, timers, runTimers } = setup({ lab })
    server.down = true
    await engine.start()
    expect([...timers.values()].map((timer) => timer.ms)).toEqual([2_000])
    await runTimers()
    expect([...timers.values()].map((timer) => timer.ms)).toEqual([4_000])
    expect(engine.getSnapshot()).toMatchObject({ status: 'offline', pending: 1, message: 'sem rede' })

    // Mudanças durante a espera não antecipam a próxima tentativa.
    lab.set('servidor-de-arquivos', chapter('mais uma mudança'))
    engine.markChanged()
    expect(timers.size).toBe(1)

    server.down = false
    await runTimers()
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('mais uma mudança'))
    expect(engine.getSnapshot().status).toBe('synced')
  })

  it('não repete um checkpoint recusado até ele mudar', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('enorme'))
    const { server, engine, runTimers } = setup({ lab })
    server.rejectStatus = 413
    await engine.start()
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', rejected: 1 })
    await engine.refresh()
    expect(server.calls.filter((call) => call.startsWith('put'))).toHaveLength(1)
    server.rejectStatus = undefined
    lab.set('servidor-de-arquivos', chapter('menor'))
    engine.markChanged()
    await runTimers()
    expect(engine.getSnapshot().status).toBe('synced')
  })
})

describe('conflitos de revisão', () => {
  async function conflicted() {
    const context = setup()
    context.lab.set('servidor-de-arquivos', chapter('base'))
    await context.engine.start()
    context.server.write('CHAPTER', 'servidor-de-arquivos', chapter('versão do servidor', ['a', 'b', 'c']))
    context.lab.set('servidor-de-arquivos', chapter('versão local'))
    context.engine.markChanged()
    await context.runTimers()
    return context
  }

  it('preserva as duas versões e pausa o envio daquele checkpoint após 409', async () => {
    const { server, lab, engine, runTimers } = await conflicted()
    expect(server.calls.at(-1)).toBe('put CHAPTER/servidor-de-arquivos@1')
    const snapshot = engine.getSnapshot()
    expect(snapshot.status).toBe('conflict')
    expect(snapshot.conflicts).toHaveLength(1)
    expect(snapshot.conflicts[0]?.server.payload).toEqual(chapter('versão do servidor', ['a', 'b', 'c']))
    expect(snapshot.conflicts[0]?.local?.payload).toEqual(chapter('versão local'))
    expect(lab.get('servidor-de-arquivos')).toEqual(chapter('versão local'))
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('versão do servidor', ['a', 'b', 'c']))

    const puts = server.calls.length
    lab.set('servidor-de-arquivos', chapter('continua editando'))
    engine.markChanged()
    await runTimers()
    expect(server.calls.slice(puts)).toEqual([])
    expect(engine.getSnapshot().status).toBe('conflict')
  })

  it('detecta o conflito já na restauração, sem aplicar a versão do servidor', async () => {
    const context = setup()
    context.lab.set('servidor-de-arquivos', chapter('base'))
    await context.engine.start()
    context.lab.set('servidor-de-arquivos', chapter('mudança local ainda não enviada'))
    context.server.write('CHAPTER', 'servidor-de-arquivos', chapter('outra aba'))
    const next = setup({ server: context.server, lab: context.lab, store: context.store })
    await next.engine.start()
    expect(context.lab.applied).toEqual([])
    expect(next.engine.getSnapshot().status).toBe('conflict')
    expect(context.server.rows.get('CHAPTER/servidor-de-arquivos')?.payload).toEqual(chapter('outra aba'))
  })

  it('mantém a versão local e guarda a do servidor como cópia', async () => {
    const { server, store, engine, runTimers } = await conflicted()
    expect(engine.resolveConflict('CHAPTER/servidor-de-arquivos', 'local')).toBe(true)
    await runTimers()
    expect(server.calls.at(-1)).toBe('put CHAPTER/servidor-de-arquivos@2')
    expect(server.rows.get('CHAPTER/servidor-de-arquivos')).toMatchObject({ revision: 3, payload: chapter('versão local') })
    const copies = JSON.parse(store.get(preservedCopiesKey) ?? '[]')
    expect(copies).toMatchObject([{ key: 'CHAPTER/servidor-de-arquivos', origin: 'server', revision: 2, payload: chapter('versão do servidor', ['a', 'b', 'c']) }])
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', backups: 1, conflicts: [] })
  })

  it('usa a versão do servidor e guarda a local como cópia', async () => {
    const { server, lab, store, engine, runTimers } = await conflicted()
    const before = server.calls.length
    expect(engine.resolveConflict('CHAPTER/servidor-de-arquivos', 'server')).toBe(true)
    await runTimers()
    expect(lab.get('servidor-de-arquivos')).toEqual(chapter('versão do servidor', ['a', 'b', 'c']))
    expect(server.calls.slice(before).filter((call) => call.startsWith('put'))).toEqual([])
    expect(JSON.parse(store.get(preservedCopiesKey) ?? '[]')).toMatchObject([{ origin: 'local', payload: chapter('versão local') }])
    expect(engine.getSnapshot().status).toBe('synced')
  })

  it('não oferece aplicar uma versão do servidor incompatível', async () => {
    const { lab, engine } = await conflicted()
    lab.invalid.add('CHAPTER/servidor-de-arquivos')
    engine.markChanged()
    expect(engine.getSnapshot().conflicts[0]?.serverUsable).toBe(false)
    expect(engine.resolveConflict('CHAPTER/servidor-de-arquivos', 'server')).toBe(false)
    expect(lab.get('servidor-de-arquivos')).toEqual(chapter('versão local'))
  })

  it('mantém o conflito depois de recarregar a página', async () => {
    const { server, lab, store } = await conflicted()
    const next = setup({ server, lab, store })
    expect(next.engine.getSnapshot().conflicts).toHaveLength(1)
    await next.engine.start()
    expect(next.engine.getSnapshot().status).toBe('conflict')
    expect(JSON.parse(store.get(syncMetaKey) ?? '{}').conflicts['CHAPTER/servidor-de-arquivos'].server.revision).toBe(2)
  })
})

describe('várias abas no mesmo navegador', () => {
  function mutex() {
    let tail = Promise.resolve()
    return (task: () => Promise<boolean>) => {
      const result = tail.then(task)
      tail = result.then(() => undefined, () => undefined)
      return result
    }
  }

  it('cria um único visitante e não reenvia o que a outra aba já confirmou', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('compartilhado'))
    const lock = mutex()
    const store = new MemoryStore()
    const server = new FakeServer()
    const first = setup({ server, lab, store, lock })
    const second = setup({ server, lab, store, lock })
    await Promise.all([first.engine.start(), second.engine.start()])
    expect(server.calls.filter((call) => call === 'register')).toHaveLength(1)
    expect(server.calls.filter((call) => call.startsWith('put'))).toHaveLength(1)
    expect(second.engine.getSnapshot().status).toBe('synced')
  })

  it('envia a mudança de outra aba com a revisão mais recente, sem conflito falso', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('v1'))
    const lock = mutex()
    const store = new MemoryStore()
    const server = new FakeServer()
    const first = setup({ server, lab, store, lock })
    const second = setup({ server, lab, store, lock })
    await first.engine.start()
    await second.engine.start()
    lab.set('servidor-de-arquivos', chapter('v2 na primeira aba'))
    first.engine.markChanged()
    await first.runTimers()
    lab.set('servidor-de-arquivos', chapter('v3 na segunda aba'))
    second.engine.markChanged()
    await second.runTimers()
    expect(server.calls.filter((call) => call.startsWith('put'))).toEqual(['put CHAPTER/servidor-de-arquivos@0', 'put CHAPTER/servidor-de-arquivos@1', 'put CHAPTER/servidor-de-arquivos@2'])
    expect(second.engine.getSnapshot()).toMatchObject({ status: 'synced', conflicts: [] })
  })
})

describe('tentativas de missão verificadas pelo servidor', () => {
  it('usa só o veredito do servidor, mesmo que o cliente relate sucesso', async () => {
    const attempts = new MemoryAttempts()
    const good = attempts.add('catalog', 'location /imagens/ { alias /data/catalogo/; }')
    const bad = attempts.add('catalog', 'location /imagens/ { root /data/catalogo; }')
    const { engine, server } = setup({ attempts })
    await engine.start()
    expect(server.attempts).toHaveLength(2)
    expect(attempts.items.find((item) => item.attemptId === good.attemptId)?.state).toBe('verified')
    expect(attempts.items.find((item) => item.attemptId === bad.attemptId)).toMatchObject({ state: 'rejected', message: 'A imagem ainda não vem do arquivo certo.' })
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', attemptsPending: 0 })
  })

  it('guarda a tentativa offline e reenvia com o mesmo ID quando a resposta se perde', async () => {
    const attempts = new MemoryAttempts()
    const { engine, server, network, runTimers } = setup({ attempts, online: false })
    attempts.add('transfer', 'alias /opt/produtos/;')
    engine.markChanged()
    await runTimers()
    expect(engine.getSnapshot()).toMatchObject({ status: 'offline', attemptsPending: 1 })
    network.online = true
    server.loseNextResponse = true
    await engine.refresh()
    expect(engine.getSnapshot().status).toBe('offline')
    await runTimers()
    expect(server.attempts).toHaveLength(1)
    expect(attempts.items[0]?.state).toBe('verified')
    expect(engine.getSnapshot().status).toBe('synced')
  })

  it('traz vereditos já registrados no servidor ao abrir', async () => {
    const store = new MemoryStore()
    const server = new FakeServer()
    const first = new MemoryAttempts()
    first.add('integration', 'alias e try_files')
    await setup({ server, store, attempts: first }).engine.start()
    const elsewhere = new MemoryAttempts()
    await setup({ server, store, attempts: elsewhere }).engine.start()
    expect(elsewhere.items).toMatchObject([{ missionId: 'integration', state: 'verified', config: '' }])
  })
})

describe('contas e outros navegadores', () => {
  it('combina o progresso deste navegador com o da conta sem descartar nada', async () => {
    const server = new FakeServer()
    const home = new FakeLab()
    home.set('servidor-de-arquivos', chapter('capítulo 1 em casa'))
    home.set('varios-sites', { version: 1, id: 'varios-sites', draftSource: 'capítulo 3 em casa' })
    home.set('campaign', { version: 1, variant: 'transfer' }, 'MISSION')
    const atHome = setup({ server, lab: home })
    await atHome.engine.start()
    expect(await atHome.engine.createAccount(' aluna@exemplo.test ', 'senha-bem-longa')).toEqual({ ok: true })
    expect(atHome.engine.getSnapshot().email).toBe('aluna@exemplo.test')

    const school = new FakeLab()
    school.set('servidor-de-arquivos', chapter('intocado'))
    school.set('varios-sites', { version: 1, id: 'varios-sites', draftSource: 'capítulo 3 na escola' })
    school.set('proxy-reverso', { version: 1, id: 'proxy-reverso', draftSource: 'só na escola' })
    const atSchool = setup({ server, lab: school })
    await atSchool.engine.start()
    expect(await atSchool.engine.signIn('aluna@exemplo.test', 'errada')).toEqual({ ok: false, message: 'E-mail ou senha incorretos.' })
    expect(await atSchool.engine.signIn('aluna@exemplo.test', 'senha-bem-longa')).toEqual({ ok: true })

    // Capítulo só aberto na escola cede ao da conta; o que só existe na escola é enviado.
    expect(school.get('servidor-de-arquivos')).toEqual(chapter('capítulo 1 em casa'))
    expect(school.get('campaign', 'MISSION')).toEqual({ version: 1, variant: 'transfer' })
    expect(server.rows.get('CHAPTER/proxy-reverso')?.payload).toEqual({ version: 1, id: 'proxy-reverso', draftSource: 'só na escola' })
    const snapshot = atSchool.engine.getSnapshot()
    expect(snapshot).toMatchObject({ status: 'conflict', email: 'aluna@exemplo.test' })
    expect(snapshot.conflicts.map((conflict) => conflict.key)).toEqual(['CHAPTER/varios-sites'])

    atSchool.engine.resolveAll('server')
    await atSchool.runTimers()
    expect(school.get('varios-sites')).toEqual({ version: 1, id: 'varios-sites', draftSource: 'capítulo 3 em casa' })
    expect(atSchool.engine.getSnapshot()).toMatchObject({ status: 'synced', backups: 1 })
  })

  it('sai neste navegador sem apagar o progresso local', async () => {
    const lab = new FakeLab()
    lab.set('servidor-de-arquivos', chapter('meu progresso'))
    const { server, engine } = setup({ lab })
    await engine.start()
    await engine.createAccount('aluno@exemplo.test', 'senha-bem-longa')
    await engine.signOut()
    expect(engine.getSnapshot().email).toBeUndefined()
    expect(server.calls).toContain('sign out')
    await engine.refresh()
    expect(server.calls.filter((call) => call === 'register')).toHaveLength(2)
    expect(lab.get('servidor-de-arquivos')).toEqual(chapter('meu progresso'))
  })
})
