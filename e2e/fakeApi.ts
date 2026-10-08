import type { Page, Route } from '@playwright/test'
import { validateMission, type MissionVariant } from '../src/missions/catalog'

export interface FakeCheckpoint {
  scope: 'CHAPTER' | 'MISSION'
  scopeId: string
  schemaVersion: number
  scenarioVersion: string
  revision: number
  payload: Record<string, unknown>
  updatedAt: string
}

// Reordena chaves como o JSONB do PostgreSQL faz.
function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1)).map(([key, item]) => [key, jsonb(item)]))
}

// Implementação em memória do contrato de apps/api (POST /guests, GET/PUT /checkpoints).
export class FakeApi {
  private data = new Map<string, Map<string, FakeCheckpoint>>()
  // token → aprendiz. Os dados ficam separados por aprendiz, como no servidor real.
  tokens = new Map<string, string>()
  accounts = new Map<string, { password: string; learner: string }>()
  private primary: string | undefined
  log: string[] = []
  mode: 'up' | 'static-html' = 'up'
  attempts: { attemptId: string; missionId: string; learner: string; status: 'VERIFIED' | 'REJECTED'; message: string; createdAt: string }[] = []
  // Simula um servidor que discorda do navegador (por exemplo, cliente adulterado).
  rejectAll = false

  async install(page: Page) {
    await page.route('**/api/v1/**', (route) => this.handle(route))
  }

  private rowsOf(learner: string) {
    if (!this.data.has(learner)) this.data.set(learner, new Map())
    return this.data.get(learner)!
  }

  // Sem `email`, olha o primeiro aprendiz criado no teste.
  row(scope: FakeCheckpoint['scope'], scopeId: string, email?: string) {
    const learner = email ? this.accounts.get(email)?.learner : this.primary
    return learner ? this.rowsOf(learner).get(`${scope}/${scopeId}`) : undefined
  }

  // Outra aba ou dispositivo grava uma nova revisão.
  writeElsewhere(scope: FakeCheckpoint['scope'], scopeId: string, change: (payload: Record<string, unknown>) => Record<string, unknown>) {
    const current = this.row(scope, scopeId)
    if (!current || !this.primary) throw new Error(`Checkpoint ${scope}/${scopeId} ausente no servidor falso`)
    this.rowsOf(this.primary).set(`${scope}/${scopeId}`, { ...current, revision: current.revision + 1, payload: jsonb(change(structuredClone(current.payload))) as Record<string, unknown>, updatedAt: new Date().toISOString() })
  }

  private async handle(route: Route) {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '')
    if (this.mode === 'static-html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>NginxLearn</title>' })
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
    if (request.method() === 'POST' && path === '/guests') {
      const learner = crypto.randomUUID()
      this.primary ??= learner
      const token = this.issue(learner)
      this.log.push('POST /guests')
      return json(201, { learner: { id: learner, kind: 'GUEST', createdAt: new Date().toISOString() }, token })
    }
    if (request.method() === 'POST' && path === '/sessions') {
      const body = request.postDataJSON() as { email: string; password: string }
      const account = this.accounts.get(body.email.toLowerCase())
      this.log.push('POST /sessions')
      if (account?.password !== body.password) return json(401, { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' })
      return json(201, { learner: { id: account.learner, kind: 'ACCOUNT', createdAt: new Date().toISOString() }, email: body.email.toLowerCase(), token: this.issue(account.learner) })
    }
    const token = request.headers().authorization?.replace(/^Bearer /, '')
    if (!token || !this.tokens.has(token)) return json(401, { status: 401 })
    const learner = this.tokens.get(token)!
    const rows = this.rowsOf(learner)
    if (request.method() === 'POST' && path === '/account') {
      const body = request.postDataJSON() as { email: string; password: string }
      const email = body.email.toLowerCase()
      if (this.accounts.has(email)) return json(409, { code: 'EMAIL_TAKEN', message: 'Já existe uma conta com este e-mail. Entre nela para combinar o progresso.' })
      this.accounts.set(email, { password: body.password, learner })
      this.log.push('POST /account')
      return json(201, { learner: { id: learner, kind: 'ACCOUNT', createdAt: new Date().toISOString() }, email })
    }
    if (request.method() === 'DELETE' && path === '/sessions/current') {
      this.tokens.delete(token)
      this.log.push('DELETE /sessions/current')
      return route.fulfill({ status: 204 })
    }
    if (request.method() === 'GET' && path === '/checkpoints') {
      this.log.push('GET /checkpoints')
      return json(200, [...rows.values()])
    }
    const attempt = /^\/missions\/([a-z0-9-]+)\/attempts$/.exec(path)
    if (request.method() === 'POST' && attempt) {
      const missionId = attempt[1]!
      const body = request.postDataJSON() as { attemptId: string; scenarioVersion: string; config: string }
      this.log.push(`POST /missions/${missionId}/attempts`)
      const existing = this.attempts.find((item) => item.attemptId === body.attemptId && item.learner === learner)
      if (existing) return json(200, this.attemptView(existing))
      const verdict = validateMission(body.config, missionId as MissionVariant)
      const ok = verdict.ok && !this.rejectAll
      const saved = { attemptId: body.attemptId, missionId, learner, status: ok ? 'VERIFIED' as const : 'REJECTED' as const, message: this.rejectAll ? 'A configuração reexecutada não entregou a imagem esperada.' : verdict.message, createdAt: new Date().toISOString() }
      this.attempts.push(saved)
      return json(201, this.attemptView(saved))
    }
    if (request.method() === 'GET' && path === '/missions/attempts') {
      return json(200, this.attempts.filter((item) => item.learner === learner).map((item) => this.attemptView(item)))
    }
    const match = /^\/checkpoints\/(CHAPTER|MISSION)\/([a-z0-9-]+)$/.exec(path)
    if (request.method() === 'PUT' && match) {
      const [, scope, scopeId] = match as unknown as [string, FakeCheckpoint['scope'], string]
      const body = request.postDataJSON() as { schemaVersion: number; scenarioVersion: string; expectedRevision: number; payload: Record<string, unknown> }
      const key = `${scope}/${scopeId}`
      const current = rows.get(key)
      this.log.push(`PUT ${key}@${body.expectedRevision}`)
      if ((current?.revision ?? 0) !== body.expectedRevision) return json(409, { code: 'REVISION_CONFLICT', current: current ?? null })
      const saved: FakeCheckpoint = { scope, scopeId, schemaVersion: body.schemaVersion, scenarioVersion: body.scenarioVersion, revision: (current?.revision ?? 0) + 1, payload: jsonb(body.payload) as Record<string, unknown>, updatedAt: new Date().toISOString() }
      rows.set(key, saved)
      return json(current ? 200 : 201, saved)
    }
    return json(404, { status: 404 })
  }

  private issue(learner: string) {
    const token = `ngl_${crypto.randomUUID().replaceAll('-', '').padEnd(43, 'x').slice(0, 43)}`
    this.tokens.set(token, learner)
    return token
  }

  private attemptView(item: FakeApi['attempts'][number]) {
    return { attemptId: item.attemptId, missionId: item.missionId, scenarioVersion: 'mission-v1', status: item.status, result: { ok: item.status === 'VERIFIED', configValid: true, message: item.message }, createdAt: item.createdAt }
  }
}
