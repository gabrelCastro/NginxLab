import { missionScenarios, type MissionStage, type MissionVariant, type MissionValidation } from '../missions/catalog'
import { checkConfig } from '../sim/check'
import { createTerminalState, type TerminalState } from '../sim/terminal'
import type { SimulatedResponse } from '../sim/request'

const key = 'nginxlearn:mission-v1'
const modeKey = 'nginxlearn:last-mode-v1'
let memoryMission: SavedMission | undefined

export interface SavedMission {
  version: 1
  variant: MissionVariant
  stage: MissionStage
  prediction: number | null
  predictionExplored: boolean
  hintCount: number
  primaryHintCount: number
  reloadCount: number
  homeProofReload: number | null
  imageProofReload: number | null
  extraProofReload?: number | null
  fallbackProofReload?: number | null
  integrationCompletions?: number
  attempts: { completedAt: string; prediction: number | null; predictionExplored: boolean; primaryHints: number; transferHints: number }[]
  draftSource: string
  activeSource: string
  commandHistory: string[]
  terminalEntries: { id: number; command: string; output: string }[]
  accessLog: string[]
  errorLog: string[]
  commandCount: number
  homeResponse: SimulatedResponse | null
  imageResponse: SimulatedResponse | null
  extraResponse?: SimulatedResponse | null
  fallbackResponse?: SimulatedResponse | null
  response: SimulatedResponse | null
  responseSource: string | null
  homeSource: string | null
  imageSource: string | null
  extraSource?: string | null
  fallbackSource?: string | null
  validation: MissionValidation | null
  catalogSource: string | null
}

export function readMission(): { saved?: SavedMission; storageAvailable: boolean } {
  try {
    localStorage.setItem('nginxlearn:storage-check', '1')
    localStorage.removeItem('nginxlearn:storage-check')
    const raw = localStorage.getItem(key)
    if (!raw) return { ...(memoryMission ? { saved: memoryMission } : {}), storageAvailable: true }
    let saved: unknown
    try { saved = JSON.parse(raw) } catch { return { ...(memoryMission ? { saved: memoryMission } : {}), storageAvailable: true } }
    if (!isSavedMission(saved)) return { storageAvailable: true }
    memoryMission = saved
    return { saved, storageAvailable: true }
  } catch {
    return { ...(memoryMission ? { saved: memoryMission } : {}), storageAvailable: false }
  }
}

function isSavedMission(value: unknown): value is SavedMission {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SavedMission>
  if (item.version !== 1 || (item.variant !== 'catalog' && item.variant !== 'transfer' && item.variant !== 'integration')) return false
  if (!['observe', 'predict', 'investigate', 'repair', 'transfer-intro', 'transfer', 'complete', 'integration', 'campaign-complete'].includes(item.stage ?? '')) return false
  if (typeof item.activeSource !== 'string' || typeof item.draftSource !== 'string' || !checkConfig(item.activeSource).ok) return false
  if (!Array.isArray(item.commandHistory) || !item.commandHistory.every((command) => typeof command === 'string')) return false
  if (!Array.isArray(item.terminalEntries) || !item.terminalEntries.every((entry) => typeof entry.command === 'string' && typeof entry.output === 'string' && typeof entry.id === 'number')) return false
  if (!Array.isArray(item.accessLog) || !item.accessLog.every((line) => typeof line === 'string') || !Array.isArray(item.errorLog) || !item.errorLog.every((line) => typeof line === 'string')) return false
  if (typeof item.commandCount !== 'number' || typeof item.hintCount !== 'number' || typeof item.reloadCount !== 'number') return false
  if (![item.homeProofReload, item.imageProofReload].every((count) => count === null || typeof count === 'number')) return false
  if (item.extraProofReload !== undefined && item.extraProofReload !== null && typeof item.extraProofReload !== 'number') return false
  if (item.fallbackProofReload !== undefined && item.fallbackProofReload !== null && typeof item.fallbackProofReload !== 'number') return false
  if (item.integrationCompletions !== undefined && typeof item.integrationCompletions !== 'number') return false
  if (typeof item.primaryHintCount !== 'number' || !Array.isArray(item.attempts) || !item.attempts.every(isAttempt)) return false
  if (typeof item.predictionExplored !== 'boolean') return false
  if (item.prediction !== null && (typeof item.prediction !== 'number' || item.prediction < 0 || item.prediction > 2)) return false
  if (![item.homeResponse, item.imageResponse, item.response].every(isResponseOrNull)) return false
  if (item.extraResponse !== undefined && !isResponseOrNull(item.extraResponse)) return false
  if (item.fallbackResponse !== undefined && !isResponseOrNull(item.fallbackResponse)) return false
  if (![item.homeSource, item.imageSource, item.responseSource, item.catalogSource].every((source) => source === null || typeof source === 'string')) return false
  if (![item.extraSource, item.fallbackSource].every((source) => source === undefined || source === null || typeof source === 'string')) return false
  if (item.validation !== null && (!item.validation || typeof item.validation.message !== 'string' || typeof item.validation.ok !== 'boolean' || typeof item.validation.home !== 'boolean' || typeof item.validation.image !== 'boolean')) return false
  return true
}

function isAttempt(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const attempt = value as SavedMission['attempts'][number]
  return typeof attempt.completedAt === 'string' && (attempt.prediction === null || typeof attempt.prediction === 'number') && typeof attempt.predictionExplored === 'boolean' && typeof attempt.primaryHints === 'number' && typeof attempt.transferHints === 'number'
}

function isResponseOrNull(value: unknown) {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<SimulatedResponse>
  return typeof response.status === 'number' && typeof response.body === 'string' && !!response.headers && typeof response.headers === 'object' && Array.isArray(response.trace) && response.trace.every((step) => step && typeof step.kind === 'string' && typeof step.title === 'string' && typeof step.detail === 'string' && typeof step.status === 'string')
}

export function restoreMissionSession(saved: SavedMission): TerminalState {
  const scenario = missionScenarios[saved.variant]
  const session = createTerminalState(saved.activeSource, scenario.files)
  return { ...session, draftSource: saved.draftSource, accessLog: saved.accessLog, errorLog: saved.errorLog, commandCount: saved.commandCount }
}

export function saveMission(saved: SavedMission) {
  memoryMission = saved
  try {
    localStorage.setItem(key, JSON.stringify(saved))
    return true
  } catch {
    return false
  }
}

export function readLastMode(): 'lesson' | 'mission' {
  try { return localStorage.getItem(modeKey) === 'mission' ? 'mission' : 'lesson' } catch { return 'lesson' }
}

export function saveLastMode(mode: 'lesson' | 'mission') {
  try { localStorage.setItem(modeKey, mode) } catch { /* A missão continua nesta sessão. */ }
}
