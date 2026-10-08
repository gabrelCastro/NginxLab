import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve('dist')
// Os mesmos cabeçalhos de segurança do nginx de produção; uma violação de CSP vira erro de console nos E2E.
const securityHeaders = [...readFileSync(resolve('deploy/web/security-headers.conf'), 'utf8').matchAll(/^add_header\s+(\S+)\s+"([^"]*)"/gm)].map(([, name, value]) => [name, value])
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

// Opcional: NGINXLEARN_API_URL=http://localhost:8080 encaminha /api para o backend.
const apiTarget = process.env.NGINXLEARN_API_URL ? new URL(process.env.NGINXLEARN_API_URL) : undefined

createServer((request, response) => {
  for (const [name, value] of securityHeaders) response.setHeader(name, value)
  if (request.url?.startsWith('/api/')) {
    if (!apiTarget) {
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end('{"code":"API_NOT_CONFIGURED"}')
      return
    }
    const upstream = forward({ host: apiTarget.hostname, port: apiTarget.port, path: request.url, method: request.method, headers: { ...request.headers, host: apiTarget.host } }, (reply) => {
      response.writeHead(reply.statusCode ?? 502, reply.headers)
      reply.pipe(response)
    })
    upstream.on('error', () => { response.writeHead(502, { 'Content-Type': 'application/json' }); response.end('{"code":"API_UNREACHABLE"}') })
    request.pipe(upstream)
    return
  }
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const requested = resolve(root, `.${pathname}`)
  const safePath = requested === root || requested.startsWith(`${root}${sep}`) ? requested : root
  const file = existsSync(safePath) && statSync(safePath).isFile() ? safePath : resolve(root, 'index.html')
  response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  createReadStream(file).pipe(response)
}).listen(5180, '127.0.0.1', () => {
  process.stdout.write('Production build available at http://127.0.0.1:5180\n')
})
