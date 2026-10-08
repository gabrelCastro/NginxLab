import { create } from 'zustand'
import type { RemoteAttempt } from './api'

// Tentativas de missão aguardando ou já com veredito do servidor. O navegador valida na
// hora para dar retorno ao aluno, mas só o servidor marca uma solução como verificada.
export const attemptsStorageKey = 'nginxlearn:mission-attempts-v1'
export const attemptScenarioVersion = 'mission-v1'
const maxAttempts = 50

export type AttemptState = 'pending' | 'verified' | 'rejected' | 'error'

export interface LocalAttempt {
  attemptId: string
  missionId: string
  config: string
  clientReport: Record<string, unknown> | null
  createdAt: string
  state: AttemptState
  message: string | null
}

export interface AttemptStore {
  pending(): LocalAttempt[]
  settle(attemptId: string, state: Exclude<AttemptState, 'pending'>, message: string | null): void
  mergeRemote(remote: RemoteAttempt[]): void
}

function isAttempt(value: unknown): value is LocalAttempt {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LocalAttempt>
  return typeof item.attemptId === 'string' && typeof item.missionId === 'string' && typeof item.config === 'string' && typeof item.createdAt === 'string' && ['pending', 'verified', 'rejected', 'error'].includes(item.state ?? '')
}

function read(): LocalAttempt[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(attemptsStorageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isAttempt) : []
  } catch {
    return []
  }
}

export const useAttempts = create<{ items: LocalAttempt[] }>(() => ({ items: typeof localStorage === 'undefined' ? [] : read() }))

function write(items: LocalAttempt[]) {
  // Mantém todas as pendentes e as mais recentes já resolvidas.
  const pending = items.filter((item) => item.state === 'pending')
  const settled = items.filter((item) => item.state !== 'pending').slice(-Math.max(0, maxAttempts - pending.length))
  const kept = items.filter((item) => pending.includes(item) || settled.includes(item))
  useAttempts.setState({ items: kept })
  try { localStorage.setItem(attemptsStorageKey, JSON.stringify(kept)) } catch { /* Fica nesta sessão. */ }
}

export function recordAttempt(missionId: string, config: string, clientReport: Record<string, unknown>) {
  const attempt: LocalAttempt = { attemptId: crypto.randomUUID(), missionId, config, clientReport, createdAt: new Date().toISOString(), state: 'pending', message: null }
  write([...useAttempts.getState().items, attempt])
  return attempt
}

export function reloadAttempts() {
  useAttempts.setState({ items: read() })
}

export function latestAttempt(items: LocalAttempt[], missionId: string) {
  return items.filter((item) => item.missionId === missionId).at(-1)
}

export const browserAttemptStore: AttemptStore = {
  pending: () => read().filter((item) => item.state === 'pending'),
  settle(attemptId, state, message) {
    write(read().map((item) => item.attemptId === attemptId ? { ...item, state, message } : item))
  },
  mergeRemote(remote) {
    const items = read()
    const known = new Set(items.map((item) => item.attemptId))
    const merged = items.map((item) => {
      const match = remote.find((entry) => entry.attemptId === item.attemptId)
      return match ? { ...item, state: match.status === 'VERIFIED' ? 'verified' as const : 'rejected' as const, message: match.result.message } : item
    })
    // Veredito de outro dispositivo da mesma conta: só o resumo, sem a configuração.
    const foreign = remote.filter((entry) => !known.has(entry.attemptId)).map((entry): LocalAttempt => ({
      attemptId: entry.attemptId, missionId: entry.missionId, config: '', clientReport: null, createdAt: entry.createdAt,
      state: entry.status === 'VERIFIED' ? 'verified' : 'rejected', message: entry.result.message
    }))
    write([...merged, ...foreign].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
  }
}
