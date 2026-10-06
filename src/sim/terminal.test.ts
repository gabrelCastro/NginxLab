import { describe, expect, it } from 'vitest'
import { createTerminalState, executeCommand } from './terminal'

const source = `events {}
http {
  server {
    listen 80;
    server_name localhost;
    root /www;
  }
}`

describe('terminal', () => {
  it('keeps edits inactive until a successful reload', () => {
    const initial = createTerminalState(source, { '/www/index.html': 'old' })
    const edited = { ...initial, draftSource: source.replace('root /www', 'return 200 new') }
    const before = executeCommand(edited, 'curl http://localhost/')
    expect(before.output).toContain('old')
    const reloaded = executeCommand(before.state, 'nginx -s reload')
    expect(reloaded.success).toBe(true)
    expect(executeCommand(reloaded.state, 'curl http://localhost/').output).toBe('new')
  })

  it('does not reload an invalid config', () => {
    const initial = createTerminalState(source)
    const result = executeCommand({ ...initial, draftSource: source.replace('listen 80;', 'lisen 80;') }, 'nginx -s reload')
    expect(result.success).toBe(false)
    expect(result.output).toContain('unknown directive "lisen"')
    expect(result.state.activeSource).toBe(source)
  })

  it('supports curl headers and nginx-like logs', () => {
    const initial = createTerminalState(source, { '/www/index.html': 'hello' })
    const request = executeCommand(initial, 'curl -i -H "Host: localhost" http://127.0.0.1/missing')
    expect(request.output).toContain('HTTP/1.1 404 Not Found')
    expect(executeCommand(request.state, 'tail /var/log/nginx/error.log').output).toContain('open() "/www/missing" failed (2: No such file or directory)')
    expect(executeCommand(request.state, 'tail /var/log/nginx/access.log').output).toContain('"GET /missing HTTP/1.1" 404')
  })

  it('suggests a nearby command', () => {
    const result = executeCommand(createTerminalState(source), 'cirl localhost')
    expect(result.output).toContain("Você quis dizer 'curl'?")
  })
})
