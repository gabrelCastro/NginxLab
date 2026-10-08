import { lessons } from '../lessons'
import { campaign } from '../lessons/campaign'
import { missionScenarios, type MissionVariant } from '../missions/catalog'
import type { CheckpointScope } from './api'

const stageLabels: Record<string, string> = {
  observe: 'observar o problema', predict: 'previsão', investigate: 'investigação', repair: 'correção',
  'transfer-intro': 'imagem restaurada', transfer: 'desafio final', complete: 'missão concluída',
  integration: 'revisão integrada', 'campaign-complete': 'incidente resolvido'
}

export function checkpointTitle(scope: CheckpointScope, scopeId: string) {
  if (scope === 'MISSION') return 'Missões da loja'
  const lesson = lessons.find((item) => item.id === scopeId)
  return lesson ? `${lesson.number}. ${campaign[lesson.id]?.title ?? lesson.title}` : scopeId
}

// Resumo legível de um checkpoint para comparar versões. Lê o payload de forma defensiva
// porque a versão do servidor pode ser incompatível com esta versão do app.
export function describeCheckpoint(scope: CheckpointScope, scopeId: string, payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return ['Conteúdo ilegível nesta versão do app.']
  const item = payload as Record<string, unknown>
  const commands = Array.isArray(item.commandHistory) ? item.commandHistory.length : 0
  const pending = typeof item.draftSource === 'string' && typeof item.activeSource === 'string' && item.draftSource !== item.activeSource
  const lines: string[] = []
  if (scope === 'CHAPTER') {
    const lesson = lessons.find((entry) => entry.id === scopeId)
    const guide = item.guide as { completedSteps?: unknown } | undefined
    const steps = Array.isArray(guide?.completedSteps) ? guide.completedSteps.length : 0
    if (lesson) lines.push(`${Math.min(steps, lesson.steps.length)} de ${lesson.steps.length} passos do guia`)
    if (item.completed === true) lines.push('Capítulo marcado como concluído neste dispositivo')
  } else {
    const variant = item.variant as MissionVariant
    const scenario = missionScenarios[variant] as (typeof missionScenarios)[MissionVariant] | undefined
    if (scenario) lines.push(scenario.title)
    if (typeof item.stage === 'string') lines.push(`Etapa: ${stageLabels[item.stage] ?? item.stage}`)
    if (Array.isArray(item.attempts)) lines.push(`Conclusões registradas: ${item.attempts.length}`)
  }
  lines.push(`${commands} ${commands === 1 ? 'comando' : 'comandos'} no terminal`)
  lines.push(pending ? 'Configuração editada ainda não recarregada' : 'Configuração editada igual à ativa')
  return lines
}
