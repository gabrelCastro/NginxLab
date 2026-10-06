import type { DirectiveNode } from './config/types'
import { BackendPool } from './backends'
import { normalizePath, VirtualFileSystem } from './fs'
import type { CompiledConfig, CompiledLocation, CompiledServer } from './model'

export type TraceKind = 'request' | 'server' | 'location' | 'rewrite' | 'filesystem' | 'proxy' | 'response'
export type TraceStatus = 'info' | 'checking' | 'match' | 'miss' | 'success' | 'error'

export interface TraceStep {
  kind: TraceKind
  title: string
  detail: string
  status: TraceStatus
  line?: number
}

export interface SimulatedRequest {
  method?: string
  scheme?: 'http' | 'https'
  host?: string
  port?: number
  path: string
  headers?: Record<string, string>
}

export interface SimulatedResponse {
  status: number
  headers: Record<string, string>
  body: string
  trace: TraceStep[]
  serverId?: string
  location?: string
  filePath?: string
  backend?: string
}

export interface RequestEnvironment {
  fs: VirtualFileSystem
  backends?: BackendPool
  runtime?: RequestRuntime
}

export interface RequestRuntime {
  cache: Map<string, { status: number; headers?: Record<string, string>; body: string }>
  rateCounts: Map<string, number>
}

const statusText: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Moved Temporarily',
  304: 'Not Modified', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Temporarily Unavailable', 504: 'Gateway Timeout'
}

export function simulateRequest(config: CompiledConfig, input: SimulatedRequest, environment: RequestEnvironment): SimulatedResponse {
  const method = input.method ?? 'GET'
  const host = (input.host ?? input.headers?.Host ?? 'localhost').split(':')[0]!.toLowerCase()
  const port = input.port ?? 80
  const requestPath = normalizeUri(input.path)
  const trace: TraceStep[] = [{
    kind: 'request',
    title: `${method} ${requestPath}`,
    detail: `A requisição chegou em ${host}:${port}.`,
    status: 'info'
  }]
  const server = selectServer(config, host, port, trace)
  if (!server) return response(400, 'No server on this port', trace)

  let uri = requestPath
  let location = selectLocation(server.locations, uri, trace)
  const rewrite = directive(location?.directives ?? server.directives, 'rewrite')
  if (rewrite && rewrite.args.length >= 2) {
    try {
      const expression = new RegExp(rewrite.args[0]!)
      if (expression.test(uri)) {
        const target = uri.replace(expression, nginxReplacement(rewrite.args[1]!))
        trace.push({ kind: 'rewrite', title: `rewrite ${uri} → ${target}`, detail: `A expressão ${rewrite.args[0]} alterou a URI antes de continuar.`, status: 'match', line: rewrite.line })
        const flag = rewrite.args[2]
        if (flag === 'redirect' || flag === 'permanent') {
          return response(flag === 'permanent' ? 301 : 302, '', trace, { Location: target }, server, location)
        }
        uri = target
        if (flag === 'last') location = selectLocation(server.locations, uri, trace)
      }
    } catch {
      trace.push({ kind: 'rewrite', title: 'Expressão regular inválida', detail: rewrite.args[0] ?? '', status: 'error', line: rewrite.line })
    }
  }

  const effective = location?.directives ?? server.directives
  const returnDirective = directive(effective, 'return') ?? directive(server.directives, 'return')
  if (returnDirective) {
    const status = Number(returnDirective.args[0] ?? 200)
    const bodyOrLocation = expandVariables(returnDirective.args.slice(1).join(' '), input, uri)
    const redirect = status >= 300 && status < 400
    trace.push({ kind: 'response', title: `return ${status}`, detail: redirect ? `Resposta imediata para ${bodyOrLocation}.` : 'A diretiva encerrou a requisição imediatamente.', status: 'success', line: returnDirective.line })
    const headers = collectHeaders(effective, input, uri)
    if (redirect) headers.Location = bodyOrLocation
    return response(status, redirect ? '' : bodyOrLocation, trace, headers, server, location)
  }

  const proxy = directive(effective, 'proxy_pass')
  if (proxy) return proxyRequest(config, input, uri, server, location, proxy, effective, environment, trace)

  return staticRequest(input, uri, server, location, effective, environment.fs, trace)
}

function selectServer(config: CompiledConfig, host: string, port: number, trace: TraceStep[]) {
  const candidates = config.servers.filter((server) => server.port === port)
  if (candidates.length === 0) {
    trace.push({ kind: 'server', title: 'Nenhum server atende a porta', detail: `Não existe listen ${port}.`, status: 'error' })
    return undefined
  }
  const named = candidates.find((server) => server.names.some((name) => matchesServerName(name, host)))
  const selected = named ?? candidates.find((server) => server.defaultServer) ?? candidates[0]!
  const reason = named
    ? `server_name ${named.names.find((name) => matchesServerName(name, host))} corresponde ao Host ${host}.`
    : selected.defaultServer
      ? `Nenhum server_name corresponde; este bloco tem default_server.`
      : 'Nenhum server_name corresponde; o primeiro server desta porta é o padrão.'
  trace.push({ kind: 'server', title: `server ${selected.id} escolhido`, detail: reason, status: 'success', line: selected.line })
  return selected
}

function selectLocation(locations: CompiledLocation[], uri: string, trace: TraceStep[]) {
  const exact = locations.find((location) => location.modifier === 'exact' && location.pattern === uri)
  for (const location of locations.filter((candidate) => candidate.modifier === 'exact')) {
    trace.push(locationTrace(location, location === exact, uri, location === exact ? 'Correspondência exata: vence imediatamente.' : 'A URI não é exatamente igual.'))
  }
  if (exact) return exact

  const prefixes = locations
    .filter((location) => (location.modifier === 'prefix' || location.modifier === 'prefix-stop') && uri.startsWith(location.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length)
  const longest = prefixes[0]
  for (const location of locations.filter((candidate) => candidate.modifier === 'prefix' || candidate.modifier === 'prefix-stop')) {
    const match = uri.startsWith(location.pattern)
    trace.push(locationTrace(location, match, uri, match ? `Prefixo corresponde (${location.pattern.length} caracteres).` : 'A URI não começa com este prefixo.'))
  }
  if (longest?.modifier === 'prefix-stop') {
    trace.push({ kind: 'location', title: `location ^~ ${longest.pattern} vence`, detail: 'É o maior prefixo e ^~ impede a busca por regex.', status: 'success', line: longest.line })
    return longest
  }

  for (const location of locations.filter((candidate) => candidate.modifier === 'regex' || candidate.modifier === 'regex-insensitive')) {
    let match = false
    try {
      match = new RegExp(location.pattern, location.modifier === 'regex-insensitive' ? 'i' : '').test(uri)
    } catch {
      match = false
    }
    trace.push(locationTrace(location, match, uri, match ? 'Primeira regex correspondente: vence.' : 'A expressão regular não corresponde.'))
    if (match) return location
  }
  if (longest) {
    trace.push({ kind: 'location', title: `location ${longest.pattern} vence`, detail: 'É o maior prefixo correspondente e nenhuma regex venceu.', status: 'success', line: longest.line })
    return longest
  }
  trace.push({ kind: 'location', title: 'Configuração do server', detail: 'Nenhuma location corresponde; serão usadas as diretivas do server.', status: 'info' })
  return undefined
}

function staticRequest(
  input: SimulatedRequest,
  uri: string,
  server: CompiledServer,
  location: CompiledLocation | undefined,
  effective: DirectiveNode[],
  fs: VirtualFileSystem,
  trace: TraceStep[]
) {
  const root = directive(effective, 'root') ?? directive(server.directives, 'root')
  const alias = directive(effective, 'alias')
  const base = alias?.args[0] ?? root?.args[0] ?? '/usr/share/nginx/html'
  const suffix = alias && location ? uri.slice(location.pattern.length) : uri
  let filePath = normalizePath(`${base}/${suffix}`)
  const tryFiles = directive(effective, 'try_files')
  if (tryFiles) {
    const candidates = tryFiles.args
    let found = false
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!
      const last = index === candidates.length - 1
      if (last && candidate.startsWith('=')) {
        const code = Number(candidate.slice(1))
        trace.push({ kind: 'filesystem', title: `try_files ${candidate}`, detail: 'Nenhum candidato anterior existiu; retorna o código indicado.', status: 'error', line: tryFiles.line })
        return response(code, errorPage(code), trace, { 'Content-Type': 'text/html' }, server, location, filePath)
      }
      if (last && candidate.startsWith('/')) {
        trace.push({ kind: 'filesystem', title: `fallback interno ${candidate}`, detail: `nginx reinicia a busca de location com a URI ${candidate}.`, status: 'match', line: tryFiles.line })
        const redirectedLocation = selectLocation(server.locations, candidate, trace)
        const redirectedDirectives = redirectedLocation?.directives ?? server.directives
        return staticRequest(input, candidate, server, redirectedLocation, redirectedDirectives, fs, trace)
      }
      const candidateUri = candidate.replaceAll('$uri', uri)
      const candidatePath = normalizePath(`${base}/${candidateUri}`)
      const exists = candidate.endsWith('/') ? fs.isDirectory(candidatePath) : fs.exists(candidatePath)
      trace.push({ kind: 'filesystem', title: `try_files ${candidateUri}`, detail: `${candidatePath}: ${exists ? 'existe' : 'não existe'}.`, status: exists ? 'match' : 'miss', line: tryFiles.line })
      if (exists) {
        filePath = candidatePath
        found = true
        break
      }
    }
    if (!found) return notFound(filePath, trace, server, location)
  }

  if (fs.isDirectory(filePath)) {
    const indexDirective = directive(effective, 'index') ?? directive(server.directives, 'index')
    const indexes = indexDirective?.args ?? ['index.html']
    const match = indexes.map((name) => normalizePath(`${filePath}/${name}`)).find((path) => fs.exists(path))
    for (const candidate of indexes) {
      const path = normalizePath(`${filePath}/${candidate}`)
      trace.push({
        kind: 'filesystem',
        title: `index ${candidate}`,
        detail: `${path}: ${fs.exists(path) ? 'existe' : 'não existe'}.`,
        status: fs.exists(path) ? 'match' : 'miss',
        ...(indexDirective ? { line: indexDirective.line } : {})
      })
    }
    if (!match) {
      trace.push({ kind: 'response', title: '403 Forbidden', detail: `O diretório ${filePath}/ existe, mas nenhum arquivo de índice foi encontrado.`, status: 'error' })
      return response(403, errorPage(403), trace, { 'Content-Type': 'text/html' }, server, location, filePath)
    }
    filePath = match
  } else {
    trace.push({ kind: 'filesystem', title: `Procurar ${filePath}`, detail: fs.exists(filePath) ? 'O arquivo existe no disco virtual.' : 'O arquivo não existe no disco virtual.', status: fs.exists(filePath) ? 'match' : 'miss' })
  }
  const file = fs.read(filePath)
  if (!file) return notFound(filePath, trace, server, location)
  trace.push({ kind: 'response', title: '200 OK', detail: `${filePath} foi enviado ao cliente.`, status: 'success' })
  const headers = collectHeaders(effective, input, uri)
  headers['Content-Type'] = file.contentType ?? contentType(filePath)
  return response(200, input.method === 'HEAD' ? '' : file.content, trace, headers, server, location, filePath)
}

function proxyRequest(
  config: CompiledConfig,
  input: SimulatedRequest,
  uri: string,
  server: CompiledServer,
  location: CompiledLocation | undefined,
  proxy: DirectiveNode,
  effective: DirectiveNode[],
  environment: RequestEnvironment,
  trace: TraceStep[]
) {
  const target = proxy.args[0] ?? ''
  const parsed = target.match(/^http:\/\/([^/]+)(\/.*)?$/)
  if (!parsed || !environment.backends) return badGateway(target, trace, server, location)
  const host = parsed[1]!
  const targetUri = parsed[2]
  let forwardedPath = uri
  if (targetUri !== undefined && location) {
    forwardedPath = `${targetUri}${uri.slice(location.pattern.length)}`.replace(/\/+/g, '/')
  }
  const upstream = config.upstreams.find((candidate) => candidate.name === host)
  const addresses = upstream
    ? upstream.peers.map((peer) => `${peer.address}|${peer.weight}`)
    : [host]
  const headers = { ...input.headers }
  const limit = directive(effective, 'limit_req')
  if (limit && environment.runtime) {
    const key = input.headers?.['X-Real-IP'] ?? '127.0.0.1'
    const count = (environment.runtime.rateCounts.get(key) ?? 0) + 1
    environment.runtime.rateCounts.set(key, count)
    const burst = Number(limit.args.find((argument) => argument.startsWith('burst='))?.split('=')[1] ?? 0)
    if (count > 1 + burst) {
      const status = Number(directive(effective, 'limit_req_status')?.args[0] ?? 503)
      trace.push({ kind: 'response', title: `${status} limite excedido`, detail: `limit_req recusou a requisição de ${key}.`, status: 'error', line: limit.line })
      return response(status, errorPage(status), trace, { 'Content-Type': 'text/html' }, server, location)
    }
  }
  for (const setting of effective.filter((node) => node.name === 'proxy_set_header')) {
    const name = setting.args[0]
    if (name) headers[name] = expandVariables(setting.args.slice(1).join(' '), input, uri)
  }
  trace.push({ kind: 'proxy', title: `proxy_pass ${target}`, detail: `A URI repassada é ${forwardedPath}.`, status: 'checking', line: proxy.line })
  const cache = directive(effective, 'proxy_cache')
  const cacheKey = `${host}:${forwardedPath}`
  const cached = cache && environment.runtime?.cache.get(cacheKey)
  if (cached) {
    trace.push({ kind: 'proxy', title: 'Cache HIT', detail: 'A resposta veio do cache; o backend não foi chamado.', status: 'success', line: cache.line })
    return response(cached.status, cached.body, trace, { ...cached.headers, 'X-Cache-Status': 'HIT' }, server, location)
  }
  const result = environment.backends.request(host, addresses, { method: input.method ?? 'GET', path: forwardedPath, headers })
  if (!result) return badGateway(host, trace, server, location)
  if ((result.response.delayMs ?? 0) > 30_000) {
    trace.push({ kind: 'proxy', title: '504 Gateway Timeout', detail: `${result.address} demorou além do limite.`, status: 'error' })
    return response(504, errorPage(504), trace, { 'Content-Type': 'text/html' }, server, location, undefined, result.address)
  }
  trace.push({ kind: 'proxy', title: `Backend ${result.address}`, detail: `Respondeu com HTTP ${result.response.status}.`, status: 'success' })
  if (cache && environment.runtime && result.response.status === 200) {
    environment.runtime.cache.set(cacheKey, {
      status: result.response.status,
      body: result.response.body,
      ...(result.response.headers ? { headers: result.response.headers } : {})
    })
  }
  const responseHeaders = { ...result.response.headers, ...(cache ? { 'X-Cache-Status': 'MISS' } : {}) }
  return response(result.response.status, result.response.body, trace, responseHeaders, server, location, undefined, result.address)
}

function response(
  status: number,
  body: string,
  trace: TraceStep[],
  headers: Record<string, string> = {},
  server?: CompiledServer,
  location?: CompiledLocation,
  filePath?: string,
  backend?: string
): SimulatedResponse {
  const baseHeaders: Record<string, string> = { Server: 'nginx/1.27.5', ...headers }
  if (!baseHeaders['Content-Type']) baseHeaders['Content-Type'] = 'text/plain'
  baseHeaders['Content-Length'] = String(new TextEncoder().encode(body).length)
  return {
    status,
    headers: baseHeaders,
    body,
    trace,
    ...(server ? { serverId: server.id } : {}),
    ...(location ? { location: `${modifierSymbol(location)}${location.pattern}` } : {}),
    ...(filePath ? { filePath } : {}),
    ...(backend ? { backend } : {})
  }
}

function notFound(path: string, trace: TraceStep[], server: CompiledServer, location?: CompiledLocation) {
  trace.push({ kind: 'response', title: '404 Not Found', detail: `open() "${path}" failed (2: No such file or directory)`, status: 'error' })
  return response(404, errorPage(404), trace, { 'Content-Type': 'text/html' }, server, location, path)
}

function badGateway(target: string, trace: TraceStep[], server: CompiledServer, location?: CompiledLocation) {
  trace.push({ kind: 'proxy', title: '502 Bad Gateway', detail: `Não foi possível conectar a ${target}.`, status: 'error' })
  return response(502, errorPage(502), trace, { 'Content-Type': 'text/html' }, server, location)
}

function locationTrace(location: CompiledLocation, match: boolean, uri: string, detail: string): TraceStep {
  return {
    kind: 'location',
    title: `Testar location ${modifierSymbol(location)}${location.pattern}`,
    detail: `${detail} URI: ${uri}`,
    status: match ? 'match' : 'miss',
    line: location.line
  }
}

function modifierSymbol(location: CompiledLocation) {
  return location.modifier === 'exact' ? '= '
    : location.modifier === 'prefix-stop' ? '^~ '
      : location.modifier === 'regex' ? '~ '
        : location.modifier === 'regex-insensitive' ? '~* '
          : ''
}

function matchesServerName(pattern: string, host: string) {
  const normalized = pattern.toLowerCase()
  if (normalized === host) return true
  if (normalized.startsWith('*.')) return host.endsWith(normalized.slice(1))
  if (normalized.endsWith('.*')) return host.startsWith(normalized.slice(0, -1))
  return false
}

function directive(nodes: DirectiveNode[], name: string) {
  return nodes.find((node) => node.name === name)
}

function normalizeUri(path: string) {
  const pathname = path.split('?')[0] || '/'
  return normalizePath(pathname) + (pathname.endsWith('/') && pathname !== '/' ? '/' : '')
}

function nginxReplacement(value: string) {
  return value.replace(/\$(\d+)/g, '$$$1')
}

function expandVariables(value: string, request: SimulatedRequest, uri: string) {
  const remote = request.headers?.['X-Real-IP'] ?? '127.0.0.1'
  return value
    .replaceAll('$uri', uri)
    .replaceAll('$host', request.host ?? 'localhost')
    .replaceAll('$scheme', request.scheme ?? 'http')
    .replaceAll('$request_uri', request.path)
    .replaceAll('$remote_addr', remote)
    .replaceAll('$proxy_add_x_forwarded_for', request.headers?.['X-Forwarded-For'] ? `${request.headers['X-Forwarded-For']}, ${remote}` : remote)
}

function collectHeaders(nodes: DirectiveNode[], request: SimulatedRequest, uri: string) {
  return Object.fromEntries(nodes.filter((node) => node.name === 'add_header' && node.args[0]).map((node) => [node.args[0]!, expandVariables(node.args.slice(1).join(' '), request, uri)]))
}

function contentType(path: string) {
  if (path.endsWith('.html')) return 'text/html'
  if (path.endsWith('.css')) return 'text/css'
  if (path.endsWith('.js')) return 'application/javascript'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  return 'text/plain'
}

function errorPage(status: number) {
  const text = statusText[status] ?? 'Error'
  return `<html>\r\n<head><title>${status} ${text}</title></head>\r\n<body>\r\n<center><h1>${status} ${text}</h1></center>\r\n<hr><center>nginx/1.27.5</center>\r\n</body>\r\n</html>\r\n`
}
