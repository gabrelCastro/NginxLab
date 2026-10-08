import { describe, expect, it } from 'vitest'
import { lessons } from '../lessons'
import { applyLessonCheckpoint, applyMissionCheckpoint, currentCheckpoints, freshLessonCheckpoint, onCheckpointChange, useLab } from '../store/useLab'
import type { RemoteCheckpoint } from './api'
import { createLabBridge, type ChapterPayload } from './labBridge'

const bridge = createLabBridge({ read: currentCheckpoints, freshLesson: freshLessonCheckpoint, applyLesson: applyLessonCheckpoint, applyMission: applyMissionCheckpoint })
const first = lessons[0]!
const second = lessons[1]!

function remoteChapter(payload: unknown, overrides: Partial<RemoteCheckpoint> = {}): RemoteCheckpoint {
  return { scope: 'CHAPTER', scopeId: first.id, schemaVersion: 1, scenarioVersion: 'chapters-v1', revision: 4, payload, updatedAt: '2026-10-07T12:00:00Z', ...overrides }
}

describe('ponte entre o laboratório e a sincronização', () => {
  it('expõe só mudanças reais do laboratório como checkpoints', () => {
    let notified = 0
    onCheckpointChange(() => notified++)
    useLab.getState().stepTrace()
    expect(notified).toBe(0)
    useLab.getState().setDraft('events {}\nhttp {}\n')
    expect(notified).toBe(1)
    onCheckpointChange(undefined)

    const items = bridge.list()
    const chapter = items.find((item) => item.scopeId === first.id)!
    expect(chapter).toMatchObject({ scope: 'CHAPTER', schemaVersion: 1, scenarioVersion: 'chapters-v1' })
    expect((chapter.payload as ChapterPayload).draftSource).toBe('events {}\nhttp {}\n')
    expect((chapter.payload as ChapterPayload).completed).toBe(false)
    // Sem mudança local, o mesmo objeto é reaproveitado (o hash não é recalculado).
    expect(bridge.list().find((item) => item.scopeId === first.id)?.payload).toBe(chapter.payload)
  })

  it('importa uma conclusão antiga mesmo sem checkpoint do capítulo', () => {
    useLab.getState().markLessonComplete(second.id)
    const chapter = bridge.list().find((item) => item.scopeId === second.id)
    expect(chapter?.payload).toMatchObject({ id: second.id, completed: true, draftSource: second.initialConfig })
  })

  it('recusa versões do servidor que este app não sabe abrir', () => {
    const valid = { ...freshLessonCheckpoint(first.id)!, completed: false }
    expect(bridge.accepts(remoteChapter(valid))).toBe(true)
    expect(bridge.accepts(remoteChapter(valid, { scenarioVersion: 'chapters-v9' }))).toBe(false)
    expect(bridge.accepts(remoteChapter(valid, { schemaVersion: 2 }))).toBe(false)
    expect(bridge.accepts(remoteChapter({ ...valid, id: second.id }))).toBe(false)
    expect(bridge.accepts(remoteChapter({ ...valid, activeSource: 'http {' }))).toBe(false)
    expect(bridge.accepts(remoteChapter(valid, { scopeId: 'capitulo-inexistente' }))).toBe(false)
    expect(bridge.accepts({ ...remoteChapter({ version: 1 }), scope: 'MISSION', scopeId: 'campaign', scenarioVersion: 'mission-v1' })).toBe(false)
  })

  it('restaura o capítulo aberto direto no laboratório e acumula conclusões', () => {
    useLab.getState().selectLesson(0)
    const runId = useLab.getState().lessonRunId
    const restored = { ...freshLessonCheckpoint(first.id)!, draftSource: 'events {}\nhttp { server { listen 80; } }\n', commandHistory: ['nginx -t'], completed: true }
    expect(bridge.apply(remoteChapter(restored))).toBe(true)
    const state = useLab.getState()
    expect(state.session.draftSource).toBe(restored.draftSource)
    expect(state.commandHistory).toEqual(['nginx -t'])
    expect(state.lessonRunId).toBe(runId + 1)
    expect(state.completedLessons).toContain(first.id)
    expect(currentCheckpoints().lessons[first.id]?.draftSource).toBe(restored.draftSource)
    expect('completed' in currentCheckpoints().lessons[first.id]!).toBe(false)

    // Escolher uma versão sem a conclusão não apaga a conclusão já vista.
    expect(bridge.apply(remoteChapter({ ...restored, completed: false }))).toBe(true)
    expect(useLab.getState().completedLessons).toContain(first.id)
  })

  it('restaura a missão sem trocar o capítulo aberto', () => {
    useLab.getState().openMission()
    useLab.getState().browseShop()
    const mission = currentCheckpoints().mission!
    useLab.getState().selectLesson(0)
    const attempts = [{ completedAt: '2026-10-07T12:00:00Z', prediction: 1, predictionExplored: false, primaryHints: 0, transferHints: 1 }]
    const remote: RemoteCheckpoint = { scope: 'MISSION', scopeId: 'campaign', schemaVersion: 1, scenarioVersion: 'mission-v1', revision: 2, payload: { ...mission, stage: 'complete', variant: 'transfer', attempts }, updatedAt: '2026-10-07T12:00:00Z' }
    expect(bridge.apply(remote)).toBe(true)
    expect(useLab.getState().mode).toBe('lesson')
    expect(useLab.getState().missionAttempts).toEqual(attempts)
    expect(currentCheckpoints().mission?.stage).toBe('complete')
  })

  it('reconhece um capítulo apenas aberto, sem progresso', () => {
    const fresh = { ...freshLessonCheckpoint(first.id)!, completed: false }
    const local = { scope: 'CHAPTER' as const, scopeId: first.id, schemaVersion: 1, scenarioVersion: 'chapters-v1', payload: fresh }
    expect(bridge.isTrivial?.(local)).toBe(true)
    expect(bridge.isTrivial?.({ ...local, payload: { ...fresh, commandHistory: ['help'] } })).toBe(false)
    expect(bridge.isTrivial?.({ ...local, payload: { ...fresh, guide: { ...fresh.guide, completedSteps: ['a'] } } })).toBe(false)
    expect(bridge.isTrivial?.({ ...local, payload: { ...fresh, completed: true } })).toBe(false)
  })
})
