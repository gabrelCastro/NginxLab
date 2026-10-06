import { create } from 'zustand'
import { lessons, type LessonEvent } from '../lessons'
import { checkConfig } from '../sim/check'
import { createTerminalState, executeCommand, type TerminalState } from '../sim/terminal'
import type { SimulatedResponse } from '../sim/request'

export interface TerminalEntry {
  id: number
  command: string
  output: string
}

interface LabState {
  lessonIndex: number
  session: TerminalState
  events: LessonEvent[]
  terminalEntries: TerminalEntry[]
  commandHistory: string[]
  response: SimulatedResponse | undefined
  errorLine: number | undefined
  visibleTraceSteps: number
  playing: boolean
  completedLessons: string[]
  setDraft: (source: string) => void
  runCommand: (command: string) => void
  selectLesson: (index: number) => void
  resetLesson: () => void
  togglePlaying: () => void
  stepTrace: (amount?: number) => void
  finishTrace: () => void
}

function sessionFor(index: number) {
  const lesson = lessons[index]!
  return createTerminalState(lesson.initialConfig, lesson.files, lesson.backends)
}

function readCompleted() {
  try {
    return JSON.parse(localStorage.getItem('nginxlearn:completed') ?? '[]') as string[]
  } catch {
    return []
  }
}

export const useLab = create<LabState>((set, get) => ({
  lessonIndex: 0,
  session: sessionFor(0),
  events: [],
  terminalEntries: [{ id: 0, command: 'help', output: 'Digite help para ver os comandos. Comece com curl -i http://localhost/.' }],
  commandHistory: [],
  response: undefined,
  errorLine: undefined,
  visibleTraceSteps: 0,
  playing: true,
  completedLessons: typeof localStorage === 'undefined' ? [] : readCompleted(),
  setDraft: (source) => set((state) => ({ session: { ...state.session, draftSource: source }, errorLine: undefined })),
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
    const lesson = lessons[get().lessonIndex]!
    const completed = lesson.objectives.every((objective) => objective.verify(events))
    const completedLessons = completed && !get().completedLessons.includes(lesson.id)
      ? [...get().completedLessons, lesson.id]
      : get().completedLessons
    if (completed) localStorage.setItem('nginxlearn:completed', JSON.stringify(completedLessons))
    const check = result.action === 'test' || result.action === 'reload' ? checkConfig(result.state.draftSource) : undefined
    set({
      session: result.state,
      events,
      completedLessons,
      terminalEntries: [...get().terminalEntries, { id: result.state.commandCount, command: trimmed, output: result.output }],
      commandHistory: [...get().commandHistory, trimmed],
      ...(result.response ? { response: result.response, visibleTraceSteps: 1, playing: true } : {}),
      ...(check && !check.ok && check.errorLine ? { errorLine: check.errorLine } : { errorLine: undefined })
    })
  },
  selectLesson: (index) => set({
    lessonIndex: index,
    session: sessionFor(index),
    events: [],
    terminalEntries: [],
    commandHistory: [],
    response: undefined,
    errorLine: undefined,
    visibleTraceSteps: 0,
    playing: true
  }),
  resetLesson: () => get().selectLesson(get().lessonIndex),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  stepTrace: (amount = 1) => set((state) => ({
    visibleTraceSteps: Math.max(1, Math.min(state.response?.trace.length ?? 0, state.visibleTraceSteps + amount)),
    playing: false
  })),
  finishTrace: () => set((state) => ({ visibleTraceSteps: state.response?.trace.length ?? 0, playing: false }))
}))
