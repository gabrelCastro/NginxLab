export type CheckpointScope = 'CHAPTER' | 'MISSION'

export interface RemoteCheckpoint {
  scope: CheckpointScope
  scopeId: string
  schemaVersion: number
  scenarioVersion: string
  revision: number
  payload: unknown
  updatedAt: string
}

export interface CheckpointWrite {
  schemaVersion: number
  scenarioVersion: string
  expectedRevision: number
  payload: unknown
}

export interface AttemptSubmission {
  attemptId: string
  scenarioVersion: string
  config: string
  clientReport: Record<string, unknown> | null
}

export interface RemoteAttempt {
  attemptId: string
  missionId: string
  scenarioVersion: string
  status: 'VERIFIED' | 'REJECTED'
  result: { ok: boolean; configValid: boolean; message: string }
  createdAt: string
}

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'conflict'; current: RemoteCheckpoint | null }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'rejected'; status: number; code?: string; message?: string }

export interface ProgressApi {
  register(): Promise<ApiResult<{ token: string; learnerId: string }>>
  list(token: string): Promise<ApiResult<RemoteCheckpoint[]>>
  put(token: string, scope: CheckpointScope, scopeId: string, body: CheckpointWrite): Promise<ApiResult<RemoteCheckpoint>>
  submitAttempt(token: string, missionId: string, body: AttemptSubmission): Promise<ApiResult<RemoteAttempt>>
  listAttempts(token: string): Promise<ApiResult<RemoteAttempt[]>>
  createAccount(token: string, email: string, password: string): Promise<ApiResult<{ email: string }>>
  signIn(email: string, password: string): Promise<ApiResult<{ token: string; learnerId: string; email: string }>>
  signOut(token: string): Promise<ApiResult<true>>
}

export function isRemoteAttempt(value: unknown): value is RemoteAttempt {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RemoteAttempt>
  return typeof item.attemptId === 'string' && typeof item.missionId === 'string' && (item.status === 'VERIFIED' || item.status === 'REJECTED') && !!item.result && typeof item.result.message === 'string' && typeof item.result.ok === 'boolean'
}

const tokenFormat = /^ngl_[A-Za-z0-9_-]{43}$/

export function isRemoteCheckpoint(value: unknown): value is RemoteCheckpoint {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RemoteCheckpoint>
  return (item.scope === 'CHAPTER' || item.scope === 'MISSION') && typeof item.scopeId === 'string' && Number.isSafeInteger(item.schemaVersion) && typeof item.scenarioVersion === 'string' && Number.isSafeInteger(item.revision) && (item.revision ?? 0) > 0 && typeof item.updatedAt === 'string' && 'payload' in item
}

export function createProgressApi(baseUrl: string, fetcher: typeof fetch = (...args) => fetch(...args), timeoutMs = 10_000): ProgressApi {
  async function call(path: string, init: RequestInit & { token?: string }): Promise<{ status: number; body: unknown } | { failure: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (init.body !== undefined) headers['Content-Type'] = 'application/json'
      if (init.token) headers.Authorization = `Bearer ${init.token}`
      const response = await fetcher(`${baseUrl}${path}`, { method: init.method ?? 'GET', ...(init.body !== undefined ? { body: init.body } : {}), headers, cache: 'no-store', credentials: 'omit', signal: controller.signal })
      const type = response.headers.get('Content-Type') ?? ''
      let body: unknown
      if (type.includes('json')) {
        try { body = await response.json() } catch { return { failure: 'Resposta inválida do servidor.' } }
      }
      // Um proxy ou servidor estático pode responder 200 com HTML; isso não confirma nada.
      if (response.ok && body === undefined && response.status !== 204) return { failure: 'O servidor de progresso não está disponível neste endereço.' }
      return { status: response.status, body }
    } catch {
      return { failure: controller.signal.aborted ? 'O servidor demorou para responder.' : 'Sem conexão com o servidor de progresso.' }
    } finally {
      clearTimeout(timer)
    }
  }

  function classify<T>(result: Awaited<ReturnType<typeof call>>, read: (body: unknown) => T | undefined): ApiResult<T> {
    if ('failure' in result) return { kind: 'unavailable', reason: result.failure }
    if (result.status === 401 || result.status === 403) return { kind: 'unauthorized' }
    if (result.status === 409) {
      const current = (result.body as { current?: unknown } | undefined)?.current
      return { kind: 'conflict', current: isRemoteCheckpoint(current) ? current : null }
    }
    if (result.status >= 500 || result.status === 408 || result.status === 429) return { kind: 'unavailable', reason: `Servidor indisponível (${result.status}).` }
    if (result.status < 200 || result.status >= 300) {
      const error = result.body as { code?: unknown; message?: unknown } | undefined
      return { kind: 'rejected', status: result.status, ...(typeof error?.code === 'string' ? { code: error.code } : {}), ...(typeof error?.message === 'string' ? { message: error.message } : {}) }
    }
    const value = read(result.body)
    return value === undefined ? { kind: 'unavailable', reason: 'Resposta inesperada do servidor.' } : { kind: 'ok', value }
  }

  return {
    async register() {
      return classify(await call('/guests', { method: 'POST' }), (body) => {
        const item = body as { token?: unknown; learner?: { id?: unknown } } | undefined
        return typeof item?.token === 'string' && tokenFormat.test(item.token) && typeof item.learner?.id === 'string' ? { token: item.token, learnerId: item.learner.id } : undefined
      })
    },
    async list(token) {
      return classify(await call('/checkpoints', { token }), (body) => Array.isArray(body) ? body.filter(isRemoteCheckpoint) : undefined)
    },
    async put(token, scope, scopeId, body) {
      return classify(await call(`/checkpoints/${scope}/${encodeURIComponent(scopeId)}`, { method: 'PUT', token, body: JSON.stringify(body) }), (value) => isRemoteCheckpoint(value) ? value : undefined)
    },
    async submitAttempt(token, missionId, body) {
      return classify(await call(`/missions/${encodeURIComponent(missionId)}/attempts`, { method: 'POST', token, body: JSON.stringify(body) }), (value) => isRemoteAttempt(value) ? value : undefined)
    },
    async listAttempts(token) {
      return classify(await call('/missions/attempts', { token }), (body) => Array.isArray(body) ? body.filter(isRemoteAttempt) : undefined)
    },
    async createAccount(token, email, password) {
      return classify(await call('/account', { method: 'POST', token, body: JSON.stringify({ email, password }) }), (body) => {
        const item = body as { email?: unknown } | undefined
        return typeof item?.email === 'string' ? { email: item.email } : undefined
      })
    },
    async signIn(email, password) {
      const result = await call('/sessions', { method: 'POST', body: JSON.stringify({ email, password }) })
      // Aqui 401 significa credenciais erradas, não token inválido.
      if (!('failure' in result) && result.status === 401) return { kind: 'rejected', status: 401, code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' }
      return classify(result, (body) => {
        const item = body as { token?: unknown; email?: unknown; learner?: { id?: unknown } } | undefined
        return typeof item?.token === 'string' && tokenFormat.test(item.token) && typeof item.email === 'string' && typeof item.learner?.id === 'string' ? { token: item.token, email: item.email, learnerId: item.learner.id } : undefined
      })
    },
    async signOut(token) {
      return classify(await call('/sessions/current', { method: 'DELETE', token }), () => true as const)
    }
  }
}
