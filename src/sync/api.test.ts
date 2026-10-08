import { describe, expect, it } from 'vitest'
import { createProgressApi } from './api'

const token = `ngl_${'x'.repeat(43)}`
const checkpoint = { scope: 'CHAPTER', scopeId: 'servidor-de-arquivos', schemaVersion: 1, scenarioVersion: 'chapters-v1', revision: 3, payload: { version: 1 }, updatedAt: '2026-10-07T12:00:00Z' }

function reply(status: number, body?: unknown, type = 'application/json') {
  return async () => new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: body === undefined ? {} : { 'Content-Type': type } })
}

describe('cliente da API de progresso', () => {
  it('envia o token só no cabeçalho, sem cache e sem cookies', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const api = createProgressApi('/api/v1', async (url, init) => {
      seen = { url: String(url), init: init ?? {} }
      return reply(200, checkpoint)()
    })
    const result = await api.put(token, 'CHAPTER', 'servidor-de-arquivos', { schemaVersion: 1, scenarioVersion: 'chapters-v1', expectedRevision: 2, payload: { version: 1 } })
    expect(result).toEqual({ kind: 'ok', value: checkpoint })
    expect(seen?.url).toBe('/api/v1/checkpoints/CHAPTER/servidor-de-arquivos')
    expect(seen?.init).toMatchObject({ method: 'PUT', cache: 'no-store', credentials: 'omit' })
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`)
    expect(JSON.parse(String(seen?.init.body))).toMatchObject({ expectedRevision: 2 })
  })

  it('lê o estado atual do servidor em um 409', async () => {
    const api = createProgressApi('', reply(409, { code: 'REVISION_CONFLICT', current: checkpoint }))
    expect(await api.put(token, 'CHAPTER', 'servidor-de-arquivos', { schemaVersion: 1, scenarioVersion: 'chapters-v1', expectedRevision: 1, payload: {} })).toEqual({ kind: 'conflict', current: checkpoint })
  })

  it('distingue token inválido, servidor fora do ar e recusa definitiva', async () => {
    expect(await createProgressApi('', reply(401)).list(token)).toEqual({ kind: 'unauthorized' })
    expect((await createProgressApi('', reply(503)).list(token)).kind).toBe('unavailable')
    expect((await createProgressApi('', reply(429)).list(token)).kind).toBe('unavailable')
    expect(await createProgressApi('', reply(413, { status: 413 })).put(token, 'CHAPTER', 'a', { schemaVersion: 1, scenarioVersion: 'x', expectedRevision: 0, payload: {} })).toEqual({ kind: 'rejected', status: 413 })
    expect((await createProgressApi('', async () => { throw new TypeError('Failed to fetch') }).list(token)).kind).toBe('unavailable')
  })

  it('não confunde a página HTML de um servidor estático com confirmação', async () => {
    expect((await createProgressApi('', reply(200, '<!doctype html>', 'text/html')).register()).kind).toBe('unavailable')
  })

  it('aceita só tokens no formato emitido pelo backend', async () => {
    expect((await createProgressApi('', reply(201, { token: 'qualquer', learner: { id: 'l' } })).register()).kind).toBe('unavailable')
    expect(await createProgressApi('', reply(201, { token, learner: { id: 'l' } })).register()).toEqual({ kind: 'ok', value: { token, learnerId: 'l' } })
  })

  it('desiste de uma requisição lenta', async () => {
    const hanging = (_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    expect(await createProgressApi('', hanging as typeof fetch, 5).list(token)).toEqual({ kind: 'unavailable', reason: 'O servidor demorou para responder.' })
  })
})
