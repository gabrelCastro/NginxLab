import { lessons, type LessonEvent } from '../lessons'
import { checkConfig } from '../sim/check'
import { createTerminalState, type TerminalState } from '../sim/terminal'
import type { RequestRuntime, SimulatedResponse } from '../sim/request'

const key = 'nginxlearn:chapters-v1'
const currentKey = 'nginxlearn:current-chapter-v1'
let memory: Record<string, SavedLesson> = {}

export interface GuideProgress {
  completedSteps: string[]
  verifiedSteps: string[]
  answers: Record<string, number>
  hintCount: number
  recallAnswer: number | null
}

export function emptyGuide(): GuideProgress {
  return { completedSteps: [], verifiedSteps: [], answers: {}, hintCount: 0, recallAnswer: null }
}

export interface SavedLesson {
  version: 1
  id: string
  draftSource: string
  activeSource: string
  commandHistory: string[]
  terminalEntries: { id: number; command: string; output: string }[]
  events: LessonEvent[]
  response: SimulatedResponse | null
  responseSource: string | null
  accessLog: string[]
  errorLog: string[]
  commandCount: number
  cache: [string, { status: number; headers?: Record<string, string>; body: string }][]
  rateCounts: [string, number][]
  backendCursors: [string, number][]
  guide: GuideProgress
}

export function readLessonCheckpoints() {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { items: memory, storageAvailable: true }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return { items: memory, storageAvailable: true } }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { items: memory, storageAvailable: true }
    const items = Object.fromEntries(Object.entries(parsed).filter(([id, value]) => lessons.some((lesson) => lesson.id === id) && isSavedLesson(value, id))) as Record<string, SavedLesson>
    memory = items
    return { items, storageAvailable: true }
  } catch {
    return { items: memory, storageAvailable: false }
  }
}

export function isSavedLesson(value: unknown, id: string): value is SavedLesson {
  if (!value || typeof value !== 'object') return false
  const saved = value as Partial<SavedLesson>
  if (saved.version !== 1 || saved.id !== id || typeof saved.draftSource !== 'string' || typeof saved.activeSource !== 'string' || !checkConfig(saved.activeSource).ok) return false
  if (!Array.isArray(saved.commandHistory) || !saved.commandHistory.every((command) => typeof command === 'string')) return false
  if (!Array.isArray(saved.terminalEntries) || !saved.terminalEntries.every((entry) => entry && typeof entry.id === 'number' && typeof entry.command === 'string' && typeof entry.output === 'string')) return false
  if (!Array.isArray(saved.events) || !saved.events.every((event) => event && typeof event.command === 'string')) return false
  if (!Array.isArray(saved.accessLog) || !saved.accessLog.every((line) => typeof line === 'string') || !Array.isArray(saved.errorLog) || !saved.errorLog.every((line) => typeof line === 'string') || typeof saved.commandCount !== 'number' || !Number.isSafeInteger(saved.commandCount) || saved.commandCount < 0) return false
  if (!Array.isArray(saved.cache) || !saved.cache.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && entry[1] && typeof entry[1].status === 'number' && typeof entry[1].body === 'string')) return false
  if (!Array.isArray(saved.rateCounts) || !saved.rateCounts.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && Number.isSafeInteger(entry[1]) && entry[1] >= 0)) return false
  if (!Array.isArray(saved.backendCursors) || !saved.backendCursors.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && Number.isSafeInteger(entry[1]) && entry[1] >= 0)) return false
  const guide = saved.guide
  if (!guide || !Array.isArray(guide.completedSteps) || !guide.completedSteps.every((step) => typeof step === 'string') || !Array.isArray(guide.verifiedSteps) || !guide.verifiedSteps.every((step) => typeof step === 'string') || !Number.isSafeInteger(guide.hintCount) || guide.hintCount < 0 || !guide.answers || typeof guide.answers !== 'object' || Array.isArray(guide.answers)) return false
  if (!Object.values(guide.answers).every((answer) => Number.isSafeInteger(answer) && answer >= 0)) return false
  if (guide.recallAnswer !== null && (!Number.isSafeInteger(guide.recallAnswer) || guide.recallAnswer < 0)) return false
  if (saved.response !== null && (!saved.response || typeof saved.response.status !== 'number' || !Array.isArray(saved.response.trace))) return false
  if (saved.responseSource !== null && typeof saved.responseSource !== 'string') return false
  return true
}

export function restoreLesson(saved: SavedLesson, index: number): TerminalState {
  const lesson = lessons[index]!
  const session = createTerminalState(saved.activeSource, lesson.files, lesson.backends)
  const runtime: RequestRuntime = { cache: new Map(saved.cache), rateCounts: new Map(saved.rateCounts) }
  session.backendPool.restoreCursors(saved.backendCursors)
  return { ...session, draftSource: saved.draftSource, accessLog: saved.accessLog, errorLog: saved.errorLog, commandCount: saved.commandCount, runtime }
}

// Grava só um capítulo. Os demais vêm do que está guardado agora, para não apagar
// o que outra aba aberta salvou depois que esta carregou.
export function saveLessonCheckpoint(saved: SavedLesson) {
  memory = { ...memory, [saved.id]: saved }
  try {
    let stored: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>
    } catch { /* Conteúdo ilegível é substituído. */ }
    localStorage.setItem(key, JSON.stringify({ ...memory, ...stored, [saved.id]: saved }))
    return true
  } catch {
    return false
  }
}

export const lessonStorageKey = key

export function readLastLessonIndex() {
  try {
    const value = Number(localStorage.getItem(currentKey))
    return Number.isInteger(value) && value >= 0 && value < lessons.length ? value : 0
  } catch { return 0 }
}

export function saveLastLessonIndex(index: number) {
  try { localStorage.setItem(currentKey, String(index)) } catch { /* Continua nesta sessão. */ }
}
