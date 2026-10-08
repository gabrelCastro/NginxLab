import { create } from 'zustand'
import { lessons, type LessonEvent } from '../lessons'
import { missionScenarios, validateMission, type MissionStage, type MissionValidation, type MissionVariant } from '../missions/catalog'
import { checkConfig } from '../sim/check'
import { recordAttempt } from '../sync/attempts'
import { createTerminalState, executeCommand, type TerminalState } from '../sim/terminal'
import type { SimulatedResponse } from '../sim/request'
import { missionStorageKey, readLastMode, readMission, restoreMissionSession, saveLastMode, saveMission, type SavedMission } from './missionPersistence'
import { emptyGuide, readLastLessonIndex, readLessonCheckpoints, lessonStorageKey, restoreLesson, saveLastLessonIndex, saveLessonCheckpoint, type GuideProgress, type SavedLesson } from './lessonPersistence'

export interface TerminalEntry {
  id: number
  command: string
  output: string
}

interface LabState {
  mode: 'lesson' | 'mission'
  lessonIndex: number
  lessonRunId: number
  session: TerminalState
  events: LessonEvent[]
  terminalEntries: TerminalEntry[]
  commandHistory: string[]
  response: SimulatedResponse | undefined
  errorLine: number | undefined
  visibleTraceSteps: number
  playing: boolean
  completedLessons: string[]
  guide: GuideProgress
  missionVariant: MissionVariant
  missionStage: MissionStage
  missionPrediction: number | null
  missionPredictionExplored: boolean
  missionHintCount: number
  missionPrimaryHintCount: number
  missionReloadCount: number
  missionHomeProofReload: number | undefined
  missionImageProofReload: number | undefined
  missionExtraProofReload: number | undefined
  missionFallbackProofReload: number | undefined
  missionIntegrationCompletions: number
  missionAttempts: SavedMission['attempts']
  missionHomeResponse: SimulatedResponse | undefined
  missionImageResponse: SimulatedResponse | undefined
  missionExtraResponse: SimulatedResponse | undefined
  missionFallbackResponse: SimulatedResponse | undefined
  missionHomeSource: string | undefined
  missionImageSource: string | undefined
  missionExtraSource: string | undefined
  missionFallbackSource: string | undefined
  missionValidation: MissionValidation | undefined
  missionCatalogSource: string | undefined
  storageAvailable: boolean
  responseSource: string | undefined
  traceFocus: { line: number; source: string } | undefined
  externalNotice: string | undefined
  dismissExternalNotice: () => void
  setDraft: (source: string) => void
  runCommand: (command: string) => void
  selectLesson: (index: number) => void
  resetLesson: () => void
  togglePlaying: () => void
  stepTrace: (amount?: number) => void
  finishTrace: () => void
  markLessonComplete: (id: string) => void
  openMission: () => void
  restartMission: () => void
  browseShop: () => void
  setMissionPrediction: (answer: number | null) => void
  inspectMission: () => void
  revealMissionHint: () => void
  checkMission: () => void
  startTransfer: () => void
  startIntegration: () => void
  selectMissionResponse: (which: 'home' | 'image' | 'extra' | 'fallback') => void
  focusTraceLine: (line: number) => void
  clearTraceFocus: () => void
  updateGuide: (patch: Partial<GuideProgress>) => void
}

const completedStorageKey = 'nginxlearn:guided-v2-completed'
const loadedMission = typeof localStorage === 'undefined' ? { storageAvailable: false } : readMission()
const savedMission = loadedMission.saved
const loadedLessons = typeof localStorage === 'undefined' ? { items: {} as Record<string, SavedLesson>, storageAvailable: false } : readLessonCheckpoints()
let lessonCheckpointCache = loadedLessons.items
let missionCheckpoint = savedMission
const initialLessonIndex = typeof localStorage === 'undefined' ? 0 : readLastLessonIndex()
const initialLesson = lessonCheckpointCache[lessons[initialLessonIndex]!.id]
const initialMode = savedMission && readLastMode() === 'mission' ? 'mission' : 'lesson'

function sessionFor(index: number) {
  const lesson = lessons[index]!
  return createTerminalState(lesson.initialConfig, lesson.files, lesson.backends)
}

function missionCommand(path: string, host?: string) {
  return `curl -i ${host ? `-H "Host: ${host}" ` : ''}http://localhost${path}`
}

function readCompleted() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(completedStorageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && lessons.some((lesson) => lesson.id === id)) : []
  } catch {
    return []
  }
}

function saveCompleted(completedLessons: string[]) {
  try { localStorage.setItem(completedStorageKey, JSON.stringify(completedLessons)) } catch { /* Progresso mantido nesta sessão. */ }
}

function lessonWorkspace(saved: SavedLesson | undefined, index: number) {
  return {
    session: saved ? restoreLesson(saved, index) : sessionFor(index),
    guide: saved?.guide ?? emptyGuide(),
    events: saved?.events ?? [], terminalEntries: saved?.terminalEntries ?? [], commandHistory: saved?.commandHistory ?? [],
    response: saved?.response ?? undefined, responseSource: saved?.responseSource ?? undefined, traceFocus: undefined, errorLine: undefined,
    visibleTraceSteps: saved?.response?.trace.length ?? 0, playing: !saved?.response
  }
}

function missionProgress(saved: SavedMission) {
  return {
    missionVariant: saved.variant, missionStage: saved.stage,
    missionPrediction: saved.prediction, missionPredictionExplored: saved.predictionExplored,
    missionHintCount: saved.hintCount, missionPrimaryHintCount: saved.primaryHintCount,
    missionReloadCount: saved.reloadCount, missionHomeProofReload: saved.homeProofReload ?? undefined,
    missionImageProofReload: saved.imageProofReload ?? undefined, missionExtraProofReload: saved.extraProofReload ?? undefined,
    missionFallbackProofReload: saved.fallbackProofReload ?? undefined, missionIntegrationCompletions: saved.integrationCompletions ?? 0,
    missionAttempts: saved.attempts, missionHomeResponse: saved.homeResponse ?? undefined,
    missionImageResponse: saved.imageResponse ?? undefined, missionExtraResponse: saved.extraResponse ?? undefined,
    missionFallbackResponse: saved.fallbackResponse ?? undefined, missionHomeSource: saved.homeSource ?? undefined,
    missionImageSource: saved.imageSource ?? undefined, missionExtraSource: saved.extraSource ?? undefined,
    missionFallbackSource: saved.fallbackSource ?? undefined, missionValidation: saved.validation ?? undefined,
    missionCatalogSource: saved.catalogSource ?? undefined
  }
}

function missionWorkspace(saved: SavedMission) {
  return {
    session: restoreMissionSession(saved),
    terminalEntries: saved.terminalEntries, commandHistory: saved.commandHistory, response: saved.response ?? undefined,
    responseSource: saved.responseSource ?? undefined, events: [], traceFocus: undefined, errorLine: undefined,
    visibleTraceSteps: saved.response ? saved.response.trace.length : 0, playing: false
  }
}

export const useLab = create<LabState>((set, get) => ({
  mode: initialMode,
  lessonIndex: initialLessonIndex,
  lessonRunId: 0,
  session: initialMode === 'mission' && savedMission ? restoreMissionSession(savedMission) : initialLesson ? restoreLesson(initialLesson, initialLessonIndex) : sessionFor(initialLessonIndex),
  events: initialMode === 'lesson' ? initialLesson?.events ?? [] : [],
  terminalEntries: initialMode === 'mission' && savedMission ? savedMission.terminalEntries : initialLesson?.terminalEntries ?? [{ id: 0, command: 'help', output: 'Comece pelo passo a passo à direita. Digite help quando quiser consultar os comandos disponíveis.' }],
  commandHistory: initialMode === 'mission' && savedMission ? savedMission.commandHistory : initialLesson?.commandHistory ?? [],
  response: initialMode === 'mission' ? savedMission?.response ?? undefined : initialLesson?.response ?? undefined,
  responseSource: initialMode === 'mission' ? savedMission?.responseSource ?? undefined : initialLesson?.responseSource ?? undefined,
  traceFocus: undefined,
  externalNotice: undefined,
  dismissExternalNotice: () => set({ externalNotice: undefined }),
  errorLine: undefined,
  visibleTraceSteps: 0,
  playing: true,
  completedLessons: typeof localStorage === 'undefined' ? [] : readCompleted(),
  guide: initialLesson?.guide ?? emptyGuide(),
  missionVariant: savedMission?.variant ?? 'catalog',
  missionStage: savedMission?.stage ?? 'observe',
  missionPrediction: savedMission?.prediction ?? null,
  missionPredictionExplored: savedMission?.predictionExplored ?? false,
  missionHintCount: savedMission?.hintCount ?? 0,
  missionPrimaryHintCount: savedMission?.primaryHintCount ?? 0,
  missionReloadCount: savedMission?.reloadCount ?? 0,
  missionHomeProofReload: savedMission?.homeProofReload ?? undefined,
  missionImageProofReload: savedMission?.imageProofReload ?? undefined,
  missionExtraProofReload: savedMission?.extraProofReload ?? undefined,
  missionFallbackProofReload: savedMission?.fallbackProofReload ?? undefined,
  missionIntegrationCompletions: savedMission?.integrationCompletions ?? 0,
  missionAttempts: savedMission?.attempts ?? [],
  missionHomeResponse: savedMission?.homeResponse ?? undefined,
  missionImageResponse: savedMission?.imageResponse ?? undefined,
  missionExtraResponse: savedMission?.extraResponse ?? undefined,
  missionFallbackResponse: savedMission?.fallbackResponse ?? undefined,
  missionHomeSource: savedMission?.homeSource ?? undefined,
  missionImageSource: savedMission?.imageSource ?? undefined,
  missionExtraSource: savedMission?.extraSource ?? undefined,
  missionFallbackSource: savedMission?.fallbackSource ?? undefined,
  missionValidation: savedMission?.validation ?? undefined,
  missionCatalogSource: savedMission?.catalogSource ?? undefined,
  storageAvailable: loadedMission.storageAvailable && loadedLessons.storageAvailable,
  setDraft: (source) => set((state) => ({ session: { ...state.session, draftSource: source }, errorLine: undefined, missionValidation: undefined, traceFocus: undefined })),
  runCommand: (command) => {
    const trimmed = command.trim()
    if (!trimmed) return
    const result = executeCommand(get().session, trimmed)
    if (result.output === '\u0000clear') {
      set({ session: result.state, terminalEntries: [], commandHistory: [...get().commandHistory, trimmed] })
      return
    }
    const event: LessonEvent = {
      command: trimmed,
      ...(result.action ? { action: result.action } : {}),
      ...(result.success !== undefined ? { success: result.success } : {}),
      ...(result.response ? { response: result.response } : {})
    }
    const events = [...get().events, event]
    const check = result.action === 'test' || result.action === 'reload' ? checkConfig(result.state.draftSource) : undefined
    const scenario = get().mode === 'mission' ? missionScenarios[get().missionVariant] : undefined
    const expectedHost = !scenario?.host || result.response?.serverId === scenario.host
    const requestedHome = /https?:\/\/localhost\/?(?:\s|$)/.test(trimmed)
    set({
      session: result.state,
      events,
      terminalEntries: [...get().terminalEntries, { id: result.state.commandCount, command: trimmed, output: result.output }],
      commandHistory: [...get().commandHistory, trimmed],
      ...(result.response ? { response: result.response, responseSource: get().session.activeSource, visibleTraceSteps: 1, playing: true } : {}),
      ...(scenario && result.response && expectedHost && trimmed.includes(scenario.imageUri) ? { missionImageResponse: result.response, missionImageSource: get().session.activeSource, missionImageProofReload: get().missionReloadCount } : {}),
      ...(scenario && result.response && expectedHost && requestedHome ? { missionHomeResponse: result.response, missionHomeSource: get().session.activeSource, missionHomeProofReload: get().missionReloadCount } : {}),
      ...(scenario?.extraUri && result.response && expectedHost && trimmed.includes(scenario.extraUri) ? { missionExtraResponse: result.response, missionExtraSource: get().session.activeSource, missionExtraProofReload: get().missionReloadCount } : {}),
      ...(scenario?.fallbackHost && result.response && requestedHome && trimmed.includes(scenario.fallbackHost) && result.response.serverId === scenario.expectedFallbackServer ? { missionFallbackResponse: result.response, missionFallbackSource: get().session.activeSource, missionFallbackProofReload: get().missionReloadCount } : {}),
      ...(scenario && get().missionStage === 'predict' && (result.action === 'request' || /^(?:tail|ls|cat)\s/.test(trimmed)) ? { missionPredictionExplored: true } : {}),
      ...(scenario && result.action === 'reload' && result.success ? { missionReloadCount: get().missionReloadCount + 1, missionValidation: undefined } : {}),
      ...(scenario && result.response ? { missionValidation: undefined } : {}),
      ...(check && !check.ok && check.errorLine ? { errorLine: check.errorLine } : { errorLine: undefined })
    })
  },
  selectLesson: (index) => set((state) => ({
    mode: 'lesson', lessonIndex: index, lessonRunId: state.lessonRunId + 1,
    ...lessonWorkspace(lessonCheckpointCache[lessons[index]!.id], index)
  })),
  resetLesson: () => {
    if (get().mode === 'mission') { get().restartMission(); return }
    const index = get().lessonIndex
    set((state) => ({ lessonRunId: state.lessonRunId + 1, session: sessionFor(index), guide: emptyGuide(), events: [], terminalEntries: [], commandHistory: [], response: undefined, responseSource: undefined, traceFocus: undefined, errorLine: undefined, visibleTraceSteps: 0, playing: true }))
  },
  togglePlaying: () => set((state) => !state.response || state.visibleTraceSteps >= state.response.trace.length ? state : { playing: !state.playing }),
  stepTrace: (amount = 1) => set((state) => ({
    visibleTraceSteps: Math.max(1, Math.min(state.response?.trace.length ?? 0, state.visibleTraceSteps + amount)),
    playing: false
  })),
  finishTrace: () => set((state) => ({ visibleTraceSteps: state.response?.trace.length ?? 0, playing: false })),
  markLessonComplete: (id) => set((state) => {
    if (state.completedLessons.includes(id)) return state
    const completedLessons = [...state.completedLessons, id]
    saveCompleted(completedLessons)
    return { completedLessons }
  }),
  openMission: () => {
    const saved = readMission().saved
    if (saved) set({ mode: 'mission', ...missionProgress(saved), ...missionWorkspace(saved) })
    else get().restartMission()
  },
  restartMission: () => set((state) => ({
    mode: 'mission', missionVariant: 'catalog', missionStage: 'observe', missionPrediction: null, missionPredictionExplored: false, missionHintCount: 0, missionPrimaryHintCount: 0, missionReloadCount: 0, missionHomeProofReload: undefined, missionImageProofReload: undefined, missionExtraProofReload: undefined, missionFallbackProofReload: undefined, missionHomeResponse: undefined, missionImageResponse: undefined, missionExtraResponse: undefined, missionFallbackResponse: undefined, missionHomeSource: undefined, missionImageSource: undefined, missionExtraSource: undefined, missionFallbackSource: undefined, missionValidation: undefined, missionCatalogSource: undefined,
    session: createTerminalState(missionScenarios.catalog.initialConfig, missionScenarios.catalog.files),
    events: [], terminalEntries: [], commandHistory: [], response: undefined, responseSource: undefined, traceFocus: undefined, errorLine: undefined, visibleTraceSteps: 0, playing: false, lessonRunId: state.lessonRunId + 1
  })),
  browseShop: () => {
    const state = get()
    if (state.mode !== 'mission') return
    const scenario = missionScenarios[state.missionVariant]
    const homeCommand = missionCommand('/', scenario.host)
    const imageCommand = missionCommand(scenario.imageUri, scenario.host)
    const home = executeCommand(state.session, homeCommand)
    const image = executeCommand(home.state, imageCommand)
    const extraCommand = scenario.extraUri ? missionCommand(scenario.extraUri, scenario.host) : undefined
    const extra = extraCommand ? executeCommand(image.state, extraCommand) : undefined
    const fallbackCommand = scenario.fallbackHost ? missionCommand('/', scenario.fallbackHost) : undefined
    const fallback = fallbackCommand ? executeCommand(extra?.state ?? image.state, fallbackCommand) : undefined
    const runs = [{ command: homeCommand, result: home }, { command: imageCommand, result: image }, ...(extra && extraCommand ? [{ command: extraCommand, result: extra }] : []), ...(fallback && fallbackCommand ? [{ command: fallbackCommand, result: fallback }] : [])]
    set({
      session: fallback?.state ?? extra?.state ?? image.state,
      terminalEntries: [...state.terminalEntries, ...runs.map(({ command, result }) => ({ id: result.state.commandCount, command, output: result.output }))],
      commandHistory: [...state.commandHistory, ...runs.map(({ command }) => command)],
      events: [...state.events, ...runs.map(({ command, result }) => ({ command, action: 'request' as const, ...(result.response ? { response: result.response } : {}), ...(result.success !== undefined ? { success: result.success } : {}) }))],
      missionHomeResponse: home.response,
      missionImageResponse: image.response,
      missionExtraResponse: extra?.response,
      missionFallbackResponse: fallback?.response,
      missionHomeSource: state.session.activeSource,
      missionImageSource: state.session.activeSource,
      missionExtraSource: extra ? state.session.activeSource : undefined,
      missionFallbackSource: fallback ? state.session.activeSource : undefined,
      missionHomeProofReload: state.missionReloadCount,
      missionImageProofReload: state.missionReloadCount,
      missionExtraProofReload: extra ? state.missionReloadCount : undefined,
      missionFallbackProofReload: fallback ? state.missionReloadCount : undefined,
      missionValidation: undefined,
      response: image.response,
      responseSource: state.session.activeSource,
      traceFocus: undefined,
      visibleTraceSteps: image.response?.trace.length ?? 0,
      playing: false,
      ...(state.missionStage === 'observe' ? { missionStage: 'predict', missionPredictionExplored: false } : state.missionStage === 'predict' ? { missionPredictionExplored: true } : {})
    })
  },
  setMissionPrediction: (answer) => set((state) => state.mode === 'mission' && state.missionStage === 'predict' ? { missionPrediction: answer, missionStage: 'investigate' } : state),
  inspectMission: () => set((state) => state.mode === 'mission' && state.missionStage === 'investigate' ? { missionStage: 'repair' } : state),
  revealMissionHint: () => set((state) => ({ missionHintCount: Math.min(3, state.missionHintCount + 1) })),
  checkMission: () => {
    const state = get()
    if (state.mode !== 'mission' || (state.missionStage !== 'repair' && state.missionStage !== 'transfer' && state.missionStage !== 'integration')) return
    const scenario = missionScenarios[state.missionVariant]
    let validation: MissionValidation
    if (state.session.draftSource !== state.session.activeSource) {
      validation = { ok: false, home: false, image: false, message: 'A configuração editada ainda não está ativa. Execute nginx -t e nginx -s reload.' }
    } else if (state.missionReloadCount === 0) {
      validation = { ok: false, home: false, image: false, message: 'Teste e recarregue sua configuração antes de validar a missão.' }
    } else if (state.missionHomeProofReload !== state.missionReloadCount || state.missionImageProofReload !== state.missionReloadCount) {
      validation = { ok: false, home: false, image: false, message: 'Depois do reload, abra a loja novamente ou peça / e a imagem pelo terminal para comprovar a mudança.' }
    } else if (scenario.extraUri && (state.missionExtraProofReload !== state.missionReloadCount || state.missionFallbackProofReload !== state.missionReloadCount)) {
      validation = { ok: false, home: false, image: false, message: 'Depois do reload, confira também /dashboard e o Host desconhecido na loja simulada.' }
    } else if (state.missionHomeResponse?.status !== 200 || state.missionHomeResponse.filePath !== '/srv/loja/index.html' || state.missionImageResponse?.status !== 200 || state.missionImageResponse.filePath !== scenario.expectedFile) {
      validation = { ok: false, home: false, image: false, message: 'As últimas requisições ainda não mostram a página e a imagem corretas. Confira as respostas e tente novamente.' }
    } else if (scenario.extraUri && (state.missionExtraResponse?.status !== 200 || state.missionExtraResponse?.filePath !== scenario.expectedExtraFile || state.missionFallbackResponse?.status !== scenario.expectedFallbackStatus || state.missionFallbackResponse?.serverId !== scenario.expectedFallbackServer)) {
      validation = { ok: false, home: true, image: true, message: 'A rota da aplicação ou o site padrão ainda não se comporta como esperado. Compare os traces.' }
    } else {
      validation = validateMission(state.session.activeSource, state.missionVariant)
    }
    // A validação local dá o retorno imediato; o servidor reexecuta a mesma configuração
    // e só ele marca a solução como verificada.
    if (validation.ok) recordAttempt(state.missionVariant, state.session.activeSource, { prediction: state.missionPrediction, predictionExplored: state.missionPredictionExplored, hints: state.missionHintCount, primaryHints: state.missionPrimaryHintCount })
    set({
      missionValidation: validation,
      ...(validation.ok ? { missionStage: state.missionVariant === 'catalog' ? 'transfer-intro' : state.missionVariant === 'transfer' ? 'complete' : 'campaign-complete' } : {}),
      ...(validation.ok && state.missionVariant === 'transfer' ? { missionAttempts: [...state.missionAttempts, { completedAt: new Date().toISOString(), prediction: state.missionPrediction, predictionExplored: state.missionPredictionExplored, primaryHints: state.missionPrimaryHintCount, transferHints: state.missionHintCount }] } : {}),
      ...(validation.ok && state.missionVariant === 'integration' ? { missionIntegrationCompletions: state.missionIntegrationCompletions + 1 } : {})
    })
  },
  startTransfer: () => set((state) => ({
    missionVariant: 'transfer', missionStage: 'transfer', missionCatalogSource: state.session.activeSource, missionHintCount: 0, missionPrimaryHintCount: state.missionHintCount, missionReloadCount: 0, missionHomeProofReload: undefined, missionImageProofReload: undefined, missionExtraProofReload: undefined, missionFallbackProofReload: undefined, missionHomeResponse: undefined, missionImageResponse: undefined, missionExtraResponse: undefined, missionFallbackResponse: undefined, missionHomeSource: undefined, missionImageSource: undefined, missionExtraSource: undefined, missionFallbackSource: undefined, missionValidation: undefined,
    session: createTerminalState(missionScenarios.transfer.initialConfig, missionScenarios.transfer.files),
    events: [], terminalEntries: [], commandHistory: [], response: undefined, responseSource: undefined, traceFocus: undefined, errorLine: undefined, visibleTraceSteps: 0, playing: false
  })),
  startIntegration: () => {
    if (!get().missionAttempts.length) return
    set({
      mode: 'mission', missionVariant: 'integration', missionStage: 'integration', missionHintCount: 0, missionReloadCount: 0,
      missionHomeProofReload: undefined, missionImageProofReload: undefined, missionExtraProofReload: undefined, missionFallbackProofReload: undefined,
      missionHomeResponse: undefined, missionImageResponse: undefined, missionExtraResponse: undefined, missionFallbackResponse: undefined,
      missionHomeSource: undefined, missionImageSource: undefined, missionExtraSource: undefined, missionFallbackSource: undefined,
      missionValidation: undefined, session: createTerminalState(missionScenarios.integration.initialConfig, missionScenarios.integration.files),
      events: [], terminalEntries: [], commandHistory: [], response: undefined, responseSource: undefined, traceFocus: undefined,
      errorLine: undefined, visibleTraceSteps: 0, playing: false
    })
  },
  selectMissionResponse: (which) => set((state) => {
    const response = which === 'home' ? state.missionHomeResponse : which === 'image' ? state.missionImageResponse : which === 'extra' ? state.missionExtraResponse : state.missionFallbackResponse
    const source = which === 'home' ? state.missionHomeSource : which === 'image' ? state.missionImageSource : which === 'extra' ? state.missionExtraSource : state.missionFallbackSource
    return response ? { response, responseSource: source, visibleTraceSteps: response.trace.length, playing: false, traceFocus: undefined } : state
  }),
  focusTraceLine: (line) => set((state) => state.responseSource ? { traceFocus: { line, source: state.responseSource } } : state),
  clearTraceFocus: () => set({ traceFocus: undefined }),
  updateGuide: (patch) => set((state) => ({ guide: { ...state.guide, ...patch } }))
}))

function lessonCheckpoint(id: string, state: Pick<LabState, 'session' | 'commandHistory' | 'terminalEntries' | 'events' | 'response' | 'responseSource' | 'guide'>): SavedLesson {
  return {
    version: 1, id, draftSource: state.session.draftSource, activeSource: state.session.activeSource,
    commandHistory: state.commandHistory, terminalEntries: state.terminalEntries, events: state.events,
    response: state.response ?? null, responseSource: state.responseSource ?? null,
    accessLog: state.session.accessLog, errorLog: state.session.errorLog, commandCount: state.session.commandCount,
    cache: [...state.session.runtime.cache.entries()], rateCounts: [...state.session.runtime.rateCounts.entries()], backendCursors: state.session.backendPool.snapshotCursors(), guide: state.guide
  }
}

// Campos que não fazem parte de nenhum checkpoint: animação, foco e avisos da sessão.
const transientFields = new Set<keyof LabState>(['visibleTraceSteps', 'playing', 'traceFocus', 'errorLine', 'storageAvailable', 'lessonRunId', 'externalNotice'])
// Enquanto aplica o que outra aba gravou, esta aba não regrava o mesmo conteúdo.
let applyingExternal = false
let checkpointListener: (() => void) | undefined

export function onCheckpointChange(listener: (() => void) | undefined) {
  checkpointListener = listener
}

useLab.subscribe((state, previous) => {
  if (state.mode !== previous.mode) saveLastMode(state.mode)
  if (applyingExternal) return
  if (!(Object.keys(state) as (keyof LabState)[]).some((field) => !transientFields.has(field) && state[field] !== previous[field])) return
  if (state.mode === 'lesson') {
    if (state.lessonIndex !== previous.lessonIndex) saveLastLessonIndex(state.lessonIndex)
    const id = lessons[state.lessonIndex]!.id
    const saved = lessonCheckpoint(id, state)
    lessonCheckpointCache = { ...lessonCheckpointCache, [id]: saved }
    if (!saveLessonCheckpoint(saved) && state.storageAvailable) useLab.setState({ storageAvailable: false })
    checkpointListener?.()
    return
  }
  if (state.mode !== 'mission') return
  const saved: SavedMission = {
    version: 1, variant: state.missionVariant, stage: state.missionStage, prediction: state.missionPrediction, predictionExplored: state.missionPredictionExplored, hintCount: state.missionHintCount, primaryHintCount: state.missionPrimaryHintCount, reloadCount: state.missionReloadCount, homeProofReload: state.missionHomeProofReload ?? null, imageProofReload: state.missionImageProofReload ?? null, extraProofReload: state.missionExtraProofReload ?? null, fallbackProofReload: state.missionFallbackProofReload ?? null, integrationCompletions: state.missionIntegrationCompletions, attempts: state.missionAttempts,
    draftSource: state.session.draftSource, activeSource: state.session.activeSource, commandHistory: state.commandHistory, terminalEntries: state.terminalEntries, accessLog: state.session.accessLog, errorLog: state.session.errorLog, commandCount: state.session.commandCount,
    homeResponse: state.missionHomeResponse ?? null, imageResponse: state.missionImageResponse ?? null, extraResponse: state.missionExtraResponse ?? null, fallbackResponse: state.missionFallbackResponse ?? null, homeSource: state.missionHomeSource ?? null, imageSource: state.missionImageSource ?? null, extraSource: state.missionExtraSource ?? null, fallbackSource: state.missionFallbackSource ?? null, response: state.response ?? null, responseSource: state.responseSource ?? null, validation: state.missionValidation ?? null, catalogSource: state.missionCatalogSource ?? null
  }
  missionCheckpoint = saved
  if (!saveMission(saved) && state.storageAvailable) useLab.setState({ storageAvailable: false })
  checkpointListener?.()
})

// Leitura e aplicação de checkpoints para a sincronização com o servidor.
export function currentCheckpoints() {
  return { lessons: lessonCheckpointCache, mission: missionCheckpoint, completedLessons: useLab.getState().completedLessons }
}

export function freshLessonCheckpoint(id: string) {
  const index = lessons.findIndex((lesson) => lesson.id === id)
  if (index < 0) return undefined
  return lessonCheckpoint(id, { session: sessionFor(index), commandHistory: [], terminalEntries: [], events: [], response: undefined, responseSource: undefined, guide: emptyGuide() })
}

export function applyLessonCheckpoint(saved: SavedLesson, completed: boolean) {
  const index = lessons.findIndex((lesson) => lesson.id === saved.id)
  if (index < 0) return false
  lessonCheckpointCache = { ...lessonCheckpointCache, [saved.id]: saved }
  saveLessonCheckpoint(saved)
  const state = useLab.getState()
  // Conclusões só se acumulam: a versão escolhida nunca apaga uma conclusão já vista.
  const completedLessons = completed && !state.completedLessons.includes(saved.id) ? [...state.completedLessons, saved.id] : state.completedLessons
  if (completedLessons !== state.completedLessons) saveCompleted(completedLessons)
  if (state.mode === 'lesson' && state.lessonIndex === index) useLab.setState({ completedLessons, lessonRunId: state.lessonRunId + 1, ...lessonWorkspace(saved, index) })
  else if (completedLessons !== state.completedLessons) useLab.setState({ completedLessons })
  return true
}

export function applyMissionCheckpoint(saved: SavedMission) {
  missionCheckpoint = saved
  saveMission(saved)
  const state = useLab.getState()
  if (state.mode === 'mission') useLab.setState({ ...missionProgress(saved), ...missionWorkspace(saved), lessonRunId: state.lessonRunId + 1 })
  else useLab.setState(missionProgress(saved))
  return true
}

// Outra aba aberta gravou um checkpoint. Os demais capítulos são atualizados em silêncio;
// o que está aberto aqui passa a mostrar a versão mais recente, com aviso.
export function syncFromOtherTab(storageKey: string | null) {
  if (storageKey === lessonStorageKey || storageKey === null) {
    const { items } = readLessonCheckpoints()
    const state = useLab.getState()
    const openId = state.mode === 'lesson' ? lessons[state.lessonIndex]!.id : undefined
    const changedOpen = openId !== undefined && items[openId] !== undefined && JSON.stringify(items[openId]) !== JSON.stringify(lessonCheckpointCache[openId])
    lessonCheckpointCache = { ...lessonCheckpointCache, ...items }
    if (changedOpen) external(() => useLab.setState({ lessonRunId: state.lessonRunId + 1, ...lessonWorkspace(items[openId]!, state.lessonIndex), externalNotice: 'Este capítulo foi alterado em outra aba aberta. A versão mais recente foi carregada aqui.' }))
  }
  if (storageKey === missionStorageKey || storageKey === null) {
    const saved = readMission().saved
    if (saved && JSON.stringify(saved) !== JSON.stringify(missionCheckpoint)) {
      missionCheckpoint = saved
      const state = useLab.getState()
      if (state.mode === 'mission') external(() => useLab.setState({ ...missionProgress(saved), ...missionWorkspace(saved), lessonRunId: state.lessonRunId + 1, externalNotice: 'A missão foi alterada em outra aba aberta. A versão mais recente foi carregada aqui.' }))
      else external(() => useLab.setState(missionProgress(saved)))
    }
  }
  if (storageKey === completedStorageKey || storageKey === null) {
    const state = useLab.getState()
    const merged = [...new Set([...state.completedLessons, ...readCompleted()])]
    if (merged.length !== state.completedLessons.length) external(() => useLab.setState({ completedLessons: merged }))
  }
  checkpointListener?.()
}

function external(apply: () => void) {
  applyingExternal = true
  try { apply() } finally { applyingExternal = false }
}

export const labStorageKeys = [lessonStorageKey, missionStorageKey, completedStorageKey]
