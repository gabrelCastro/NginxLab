import type { SimulatedBackend } from '../sim/backends'
import type { FileSeed } from '../sim/fs'
import type { SimulatedResponse } from '../sim/request'

export interface LessonEvent {
  command: string
  action?: 'test' | 'reload' | 'request'
  success?: boolean
  response?: SimulatedResponse
}

export interface LessonObjective {
  id: string
  label: string
  verify: (events: LessonEvent[]) => boolean
}

export interface LessonArticle {
  paragraphs: string[]
  links: { label: string; href: string }[]
}

export interface LessonStep {
  id: string
  title: string
  explanation: string
  command?: string
  commandParts?: { text: string; meaning: string }[]
  lookFor?: string
  applyEdit?: { search: string; replace: string; label: string }
  verify?: (events: LessonEvent[]) => boolean
}

export interface Lesson {
  id: string
  number: number
  title: string
  eyebrow: string
  idea: string
  initialConfig: string
  files: FileSeed
  backends?: SimulatedBackend[]
  steps: LessonStep[]
  objectives: LessonObjective[]
  hints: string[]
  article: LessonArticle
  walkthrough: string[]
}
