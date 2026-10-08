import { lessons } from '../lessons'
import { missionScenarios } from '../missions/catalog'
import { isSavedLesson, type SavedLesson } from '../store/lessonPersistence'
import { isSavedMission, type SavedMission } from '../store/missionPersistence'
import type { RemoteCheckpoint } from './api'
import type { LocalBridge, LocalCheckpoint } from './engine'

export const checkpointSchemaVersion = 1
export const chapterScenarioVersion = 'chapters-v1'
export const missionScenarioVersion = 'mission-v1'
export const missionScopeId = 'campaign'

// `completed` é progresso informado pelo navegador. O servidor guarda, mas não o
// trata como conquista verificada (isso pertence à validação da fase 5).
export type ChapterPayload = SavedLesson & { completed: boolean }

export interface LabCheckpoints {
  lessons: Record<string, SavedLesson>
  mission: SavedMission | undefined
  completedLessons: string[]
}

export interface LabAccess {
  read(): LabCheckpoints
  freshLesson(id: string): SavedLesson | undefined
  applyLesson(saved: SavedLesson, completed: boolean): boolean
  applyMission(saved: SavedMission): boolean
}

export function createLabBridge(lab: LabAccess): LocalBridge {
  // Payloads de rede memorizados por objeto local: sem mudança local, o hash não é recalculado.
  const wire = new WeakMap<SavedLesson, { completed: boolean; payload: ChapterPayload }>()
  const fresh = new Map<string, SavedLesson>()

  function chapterPayload(saved: SavedLesson, completed: boolean) {
    const cached = wire.get(saved)
    if (cached?.completed === completed) return cached.payload
    const payload = { ...saved, completed }
    wire.set(saved, { completed, payload })
    return payload
  }

  function accepts(remote: RemoteCheckpoint) {
    if (remote.schemaVersion !== checkpointSchemaVersion) return false
    if (remote.scope === 'CHAPTER') return remote.scenarioVersion === chapterScenarioVersion && lessons.some((lesson) => lesson.id === remote.scopeId) && isSavedLesson(remote.payload, remote.scopeId)
    return remote.scenarioVersion === missionScenarioVersion && remote.scopeId === missionScopeId && isSavedMission(remote.payload)
  }

  return {
    isTrivial(local) {
      const item = local.payload as Partial<ChapterPayload & SavedMission>
      const untouched = (item.commandHistory?.length ?? 0) === 0 && item.draftSource === item.activeSource
      if (local.scope === 'CHAPTER') {
        const lesson = lessons.find((entry) => entry.id === local.scopeId)
        const guide = item.guide
        return untouched && !item.completed && item.activeSource === lesson?.initialConfig && !!guide && guide.completedSteps.length === 0 && guide.verifiedSteps.length === 0 && Object.keys(guide.answers).length === 0 && guide.hintCount === 0 && guide.recallAnswer === null
      }
      return untouched && item.variant === 'catalog' && item.stage === 'observe' && (item.attempts?.length ?? 0) === 0 && item.activeSource === missionScenarios.catalog.initialConfig
    },
    list() {
      const { lessons: saved, mission, completedLessons } = lab.read()
      const items: LocalCheckpoint[] = []
      for (const lesson of lessons) {
        let checkpoint = saved[lesson.id]
        // Uma conclusão antiga sem checkpoint também é importada, a partir do início do capítulo.
        if (!checkpoint && completedLessons.includes(lesson.id)) {
          checkpoint = fresh.get(lesson.id) ?? lab.freshLesson(lesson.id)
          if (checkpoint) fresh.set(lesson.id, checkpoint)
        }
        if (checkpoint) items.push({ scope: 'CHAPTER', scopeId: lesson.id, schemaVersion: checkpointSchemaVersion, scenarioVersion: chapterScenarioVersion, payload: chapterPayload(checkpoint, completedLessons.includes(lesson.id)) })
      }
      if (mission) items.push({ scope: 'MISSION', scopeId: missionScopeId, schemaVersion: checkpointSchemaVersion, scenarioVersion: missionScenarioVersion, payload: mission })
      return items
    },
    accepts,
    apply(remote) {
      if (!accepts(remote)) return false
      if (remote.scope === 'CHAPTER') {
        const { completed, ...saved } = remote.payload as ChapterPayload
        return lab.applyLesson(saved, completed === true)
      }
      return lab.applyMission(remote.payload as SavedMission)
    }
  }
}
