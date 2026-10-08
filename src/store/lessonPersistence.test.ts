import { afterEach, describe, expect, it } from 'vitest'
import { lessons } from '../lessons'
import { createTerminalState } from '../sim/terminal'
import { emptyGuide, lessonStorageKey, readLessonCheckpoints, saveLessonCheckpoint, type SavedLesson } from './lessonPersistence'

function checkpoint(index: number, draftSource: string): SavedLesson {
  const lesson = lessons[index]!
  const session = createTerminalState(lesson.initialConfig, lesson.files, lesson.backends)
  return { version: 1, id: lesson.id, draftSource, activeSource: session.activeSource, commandHistory: [], terminalEntries: [], events: [], response: null, responseSource: null, accessLog: [], errorLog: [], commandCount: 0, cache: [], rateCounts: [], backendCursors: [], guide: emptyGuide() }
}

describe('checkpoints de capítulos com várias abas', () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage') })

  it('grava um capítulo sem apagar o que outra aba salvou em outro', () => {
    const data = new Map<string, string>()
    Object.assign(globalThis, { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) }, removeItem: (key: string) => { data.delete(key) } } })
    saveLessonCheckpoint(checkpoint(0, 'aba A'))
    // A outra aba grava diretamente no armazenamento compartilhado.
    const stored = JSON.parse(data.get(lessonStorageKey)!)
    data.set(lessonStorageKey, JSON.stringify({ ...stored, [lessons[2]!.id]: checkpoint(2, 'aba B') }))
    saveLessonCheckpoint(checkpoint(0, 'aba A de novo'))
    const { items } = readLessonCheckpoints()
    expect(items[lessons[0]!.id]?.draftSource).toBe('aba A de novo')
    expect(items[lessons[2]!.id]?.draftSource).toBe('aba B')
  })
})
