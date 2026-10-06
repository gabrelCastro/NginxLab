import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve('dist')
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

createServer((request, response) => {
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
