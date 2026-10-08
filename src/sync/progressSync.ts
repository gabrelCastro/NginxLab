import { create } from 'zustand'
import { applyLessonCheckpoint, applyMissionCheckpoint, currentCheckpoints, freshLessonCheckpoint, labStorageKeys, onCheckpointChange, syncFromOtherTab } from '../store/useLab'
import { createProgressApi } from './api'
import { SyncEngine, preservedCopiesKey, syncMetaKey, type KeyValueStore, type SyncSnapshot } from './engine'
import { attemptsStorageKey, browserAttemptStore, reloadAttempts } from './attempts'
import { createLabBridge } from './labBridge'

interface SyncState {
  snapshot: SyncSnapshot
  retry: () => void
  resolve: (key: string, choice: 'local' | 'server') => boolean
  copiesFor: (key: string) => unknown
  preserved: () => unknown[]
  resolveAll: (choice: 'local' | 'server') => void
  createAccount: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>
  signOut: () => Promise<void>
}

const disabledSnapshot: SyncSnapshot = { status: 'disabled', pending: 0, attemptsPending: 0, rejected: 0, conflicts: [], backups: 0, restored: 0, importedAt: undefined, lastSyncedAt: undefined, nextRetryAt: undefined, message: undefined, email: undefined }

export const useSync = create<SyncState>(() => ({
  snapshot: disabledSnapshot,
  retry: () => {},
  resolve: () => false,
  copiesFor: () => undefined,
  preserved: () => [],
  resolveAll: () => {},
  createAccount: async () => ({ ok: false, message: 'A sincronização está desativada.' }),
  signIn: async () => ({ ok: false, message: 'A sincronização está desativada.' }),
  signOut: async () => {}
}))

const browserStore: KeyValueStore = {
  get: (key) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key, value) => { try { localStorage.setItem(key, value); return true } catch { return false } }
}

let engine: SyncEngine | undefined

export function startProgressSync() {
  if (engine || typeof window === 'undefined') return
  const configured = import.meta.env.VITE_API_BASE_URL
  if (configured === 'off') return
  engine = new SyncEngine({
    api: createProgressApi((configured || '/api/v1').replace(/\/$/, '')),
    bridge: createLabBridge({ read: currentCheckpoints, freshLesson: freshLessonCheckpoint, applyLesson: applyLessonCheckpoint, applyMission: applyMissionCheckpoint }),
    store: browserStore,
    isOnline: () => navigator.onLine !== false,
    now: () => new Date(),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (handle) => { if (handle !== undefined) window.clearTimeout(handle as number) },
    attempts: browserAttemptStore,
    ...(navigator.locks ? { lock: (task: () => Promise<boolean>) => navigator.locks.request('nginxlearn-sync', task) } : {})
  })
  const current = engine
  useSync.setState({
    snapshot: current.getSnapshot(),
    retry: () => current.refresh(),
    resolve: (key, choice) => current.resolveConflict(key, choice),
    copiesFor: (key) => current.conflictCopies(key),
    preserved: () => current.preservedCopies(),
    resolveAll: (choice) => current.resolveAll(choice),
    createAccount: (email, password) => current.createAccount(email, password),
    signIn: (email, password) => current.signIn(email, password),
    signOut: () => current.signOut()
  })
  current.subscribe((snapshot) => useSync.setState({ snapshot }))
  onCheckpointChange(() => current.markChanged())
  // Eventos de storage só chegam às outras abas: mantêm laboratório e fila coerentes entre elas.
  window.addEventListener('storage', (event) => {
    if (event.key === null || labStorageKeys.includes(event.key)) syncFromOtherTab(event.key)
    if (event.key === null || event.key === attemptsStorageKey) reloadAttempts()
    if (event.key === null || event.key === syncMetaKey || event.key === preservedCopiesKey || event.key === attemptsStorageKey) current.reloadShared()
  })
  window.addEventListener('online', () => current.refresh())
  window.addEventListener('offline', () => current.wentOffline())
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') current.refresh() })
  current.start()
}
