import { describe, expect, it } from 'vitest'
import { BackendPool } from './backends'
import { checkConfig } from './check'
import { VirtualFileSystem } from './fs'
import { simulateRequest } from './request'

function config(body: string) {
  const checked = checkConfig(`events {}\nhttp {\n${body}\n}`)
  if (!checked.ok || !checked.config) throw new Error(checked.output.join('\n'))
  return checked.config
}

describe('request simulation', () => {
  it('selects server_name and the longest prefix', () => {
    const compiled = config(`
server { listen 80 default_server; server_name fallback.test; return 404; }
server {
  listen 80;
  server_name app.test;
  root /www;
  location / { add_header X-Location root; }
  location /assets/ { add_header X-Location assets; }
}`)
    const result = simulateRequest(compiled, { path: '/assets/app.js', host: 'app.test' }, {
      fs: new VirtualFileSystem({ '/www/assets/app.js': 'hello' })
    })
    expect(result.status).toBe(200)
    expect(result.serverId).toBe('app.test')
    expect(result.location).toBe('/assets/')
    expect(result.headers['X-Location']).toBe('assets')
  })

  it('uses exact, prefix-stop and first matching regex in nginx order', () => {
    const compiled = config(`server {
      listen 80;
      location / { return 200 prefix; }
      location ~ \\.php$ { return 200 regex-first; }
      location ~ \\.php { return 200 regex-second; }
      location ^~ /static/ { return 200 static; }
      location = / { return 200 exact; }
    }`)
    const env = { fs: new VirtualFileSystem() }
    expect(simulateRequest(compiled, { path: '/' }, env).body).toBe('exact')
    expect(simulateRequest(compiled, { path: '/index.php' }, env).body).toBe('regex-first')
    expect(simulateRequest(compiled, { path: '/indexxphp' }, env).body).toBe('prefix')
    expect(simulateRequest(compiled, { path: '/static/x.php' }, env).body).toBe('static')
  })

  it('distinguishes root and alias', () => {
    const compiled = config(`server {
      listen 80;
      location /rooted/ { root /data; }
      location /aliased/ { alias /data/; }
    }`)
    const env = { fs: new VirtualFileSystem({ '/data/rooted/a.txt': 'root', '/data/a.txt': 'alias' }) }
    expect(simulateRequest(compiled, { path: '/rooted/a.txt' }, env).body).toBe('root')
    expect(simulateRequest(compiled, { path: '/aliased/a.txt' }, env).body).toBe('alias')
  })

  it('falls back to index.html with try_files', () => {
    const compiled = config(`server {
      listen 80;
      root /app;
      location / { try_files $uri $uri/ /index.html; }
    }`)
    const result = simulateRequest(compiled, { path: '/dashboard' }, {
      fs: new VirtualFileSystem({ '/app/index.html': '<main>SPA</main>' })
    })
    expect(result.status).toBe(200)
    expect(result.filePath).toBe('/app/index.html')
  })

  it('changes the proxied path only when proxy_pass includes a URI', () => {
    const withUri = config(`server { listen 80; location /api/ { proxy_pass http://app/v1/; } }`)
    const withoutUri = config(`server { listen 80; location /api/ { proxy_pass http://app; } }`)
    const backends = new BackendPool([{ address: 'app', respond: (request) => ({ status: 200, body: request.path }) }])
    const env = { fs: new VirtualFileSystem(), backends }
    expect(simulateRequest(withUri, { path: '/api/users' }, env).body).toBe('/v1/users')
    expect(simulateRequest(withoutUri, { path: '/api/users' }, env).body).toBe('/api/users')
  })
})
