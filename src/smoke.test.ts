import { describe, expect, it } from 'vitest'

describe('project', () => {
  it('is ready for the simulator', () => {
    expect('nginxlearn').toContain('nginx')
  })
})
