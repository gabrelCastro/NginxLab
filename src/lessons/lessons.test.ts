import { describe, expect, it } from 'vitest'
import { createTerminalState, executeCommand } from '../sim/terminal'
import { lessons, type LessonEvent } from '.'
import { campaign } from './campaign'

it('gives every chapter a distinct store situation and goal', () => {
  expect(Object.keys(campaign).sort()).toEqual(lessons.map((lesson) => lesson.id).sort())
  for (const lesson of lessons) {
    const chapter = campaign[lesson.id]!
    expect(chapter.title.length).toBeGreaterThan(8)
    expect(chapter.situation.length).toBeGreaterThan(40)
    expect(chapter.goal.length).toBeGreaterThan(30)
  }
})

describe('lesson walkthroughs', () => {
  for (const lesson of lessons) {
    it(`plays lesson ${lesson.number}: ${lesson.title}`, () => {
      let state = createTerminalState(lesson.initialConfig, lesson.files, lesson.backends)
      const events: LessonEvent[] = []
      for (const command of lesson.walkthrough) {
        const result = executeCommand(state, command)
        state = result.state
        events.push({
          command,
          ...(result.action ? { action: result.action } : {}),
          ...(result.success !== undefined ? { success: result.success } : {}),
          ...(result.response ? { response: result.response } : {})
        })
      }
      expect(lesson.objectives.map((objective) => objective.verify(events)), lesson.id).toEqual(lesson.objectives.map(() => true))
    })
  }
})

describe('beginner guides', () => {
  it('starts every lesson with context before asking for a command', () => {
    for (const lesson of lessons) {
      expect(lesson.steps.length, lesson.id).toBeGreaterThanOrEqual(3)
      expect(lesson.steps[0]?.command, lesson.id).toBeUndefined()
      expect(lesson.steps[0]?.explanation.length, lesson.id).toBeGreaterThan(60)
    }
  })

  it('explains what to observe and verifies every guided command', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        expect(Boolean(step.command || step.applyEdit || step.check), `${lesson.id}/${step.id}`).toBe(true)
        expect(step.takeaway, `${lesson.id}/${step.id}`).toBeTruthy()
        if (step.command) expect(step.lookFor, `${lesson.id}/${step.id}`).toBeTruthy()
        if (step.command) expect(step.verify, `${lesson.id}/${step.id}`).toBeTypeOf('function')
        if (step.check) {
          expect(step.check.options, `${lesson.id}/${step.id}`).toHaveLength(3)
          expect(step.check.correctIndex, `${lesson.id}/${step.id}`).toBeGreaterThanOrEqual(0)
          expect(step.check.correctIndex, `${lesson.id}/${step.id}`).toBeLessThan(step.check.options.length)
        }
      }
    }
  })

  for (const lesson of lessons) {
    it(`produces the promised evidence in lesson ${lesson.number}`, () => {
      let state = createTerminalState(lesson.initialConfig, lesson.files, lesson.backends)
      const events: LessonEvent[] = []

      for (const step of lesson.steps) {
        if (step.applyEdit) {
          state = {
            ...state,
            draftSource: state.draftSource.replace(step.applyEdit.search, step.applyEdit.replace)
          }
        }
        if (!step.command) continue

        const result = executeCommand(state, step.command)
        state = result.state
        events.push({
          command: step.command,
          ...(result.action ? { action: result.action } : {}),
          ...(result.success !== undefined ? { success: result.success } : {}),
          ...(result.response ? { response: result.response } : {})
        })
        expect(step.verify?.(events), `${lesson.id}/${step.id}`).toBe(true)
      }
    })
  }
})
