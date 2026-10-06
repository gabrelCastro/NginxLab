import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkConfig } from '../src/sim/check'
import { VirtualFileSystem } from '../src/sim/fs'
import { simulateRequest } from '../src/sim/request'
import { configCases, requestCases } from './cases'
import type { ConfigRecording, RequestRecording } from './types'

describe('recorded nginx 1.27 behavior', () => {
  for (const testCase of configCases) {
    it(`matches nginx -t for ${testCase.id}`, () => {
      const recording = read<ConfigRecording>(`config-${testCase.id}.json`)
      expect(checkConfig(testCase.config).output).toEqual(recording.output)
    })
  }

  for (const testCase of requestCases) {
    it(`matches responses for ${testCase.id}`, () => {
      const checked = checkConfig(testCase.config)
      if (!checked.ok || !checked.config) throw new Error(checked.output.join('\n'))
      const actual = testCase.requests.map((request) => {
        const response = simulateRequest(checked.config!, request, { fs: new VirtualFileSystem(testCase.files) })
        const headers = Object.fromEntries(Object.entries(response.headers).filter(([name]) => ['Location', 'X-Location'].includes(name)))
        return { status: response.status, headers, body: response.body }
      })
      expect(actual).toEqual(read<RequestRecording>(`request-${testCase.id}.json`).responses)
    })
  }
})

function read<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./recorded/${name}`, import.meta.url), 'utf8')) as T
}
