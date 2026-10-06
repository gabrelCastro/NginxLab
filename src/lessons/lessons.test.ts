import { describe, expect, it } from 'vitest'
import { createTerminalState, executeCommand } from '../sim/terminal'
import { lessons, type LessonEvent } from '.'

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
