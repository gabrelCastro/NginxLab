import { parseConfig } from './config/parser'
import type { DirectiveNode } from './config/types'
import { compileConfig, type CompiledConfig } from './model'

const path = '/etc/nginx/nginx.conf'

export interface ConfigCheck {
  ok: boolean
  output: string[]
  errorLine?: number
  config?: CompiledConfig
}

const contexts: Record<string, Set<string>> = {
  main: new Set(['events', 'http', 'error_log', 'worker_processes']),
  events: new Set(['worker_connections']),
  http: new Set(['server', 'upstream', 'include', 'default_type', 'access_log', 'error_log', 'sendfile', 'proxy_cache_path', 'limit_req_zone']),
  server: new Set(['listen', 'server_name', 'root', 'index', 'location', 'return', 'rewrite', 'access_log', 'error_log']),
  location: new Set(['root', 'alias', 'index', 'try_files', 'return', 'rewrite', 'proxy_pass', 'proxy_set_header', 'add_header', 'proxy_cache', 'proxy_cache_valid', 'limit_req', 'limit_req_status']),
  upstream: new Set(['server', 'keepalive'])
}

const blocks = new Set(['events', 'http', 'server', 'location', 'upstream'])
const unsupported = new Set(['include', 'sendfile', 'keepalive'])
const knownDirectives = new Set(Object.values(contexts).flatMap((names) => [...names]))

export function checkConfig(source: string): ConfigCheck {
  const parsed = parseConfig(source)
  if (!parsed.ok) return failure(parsed.error.message, parsed.error.line)
  const semanticError = validateLevel(parsed.directives, 'main')
  if (semanticError) return failure(semanticError.message, semanticError.line)

  const syntaxOk = `nginx: the configuration file ${path} syntax is ok`
  if (!parsed.directives.some((directive) => directive.name === 'events')) {
    return {
      ok: false,
      output: [syntaxOk, 'nginx: [emerg] no "events" section in configuration', `nginx: configuration file ${path} test failed`]
    }
  }
  const unsupportedNode = findNode(parsed.directives, (node) => unsupported.has(node.name))
  if (unsupportedNode) {
    return {
      ok: false,
      errorLine: unsupportedNode.line,
      output: [`NginxLearn: a diretiva "${unsupportedNode.name}" é válida no nginx, mas ainda não é simulada (linha ${unsupportedNode.line}).`]
    }
  }
  return {
    ok: true,
    output: [syntaxOk, `nginx: configuration file ${path} test is successful`],
    config: compileConfig(parsed.directives)
  }
}

function validateLevel(nodes: DirectiveNode[], context: string): { message: string; line: number } | undefined {
  const allowed = contexts[context] ?? new Set<string>()
  const seenLocations = new Map<string, number>()
  for (const node of nodes) {
    if (!allowed.has(node.name)) {
      return {
        message: knownDirectives.has(node.name) ? `"${node.name}" directive is not allowed here` : `unknown directive "${node.name}"`,
        line: node.line
      }
    }
    const hasBlock = node.children !== undefined
    const expectsBlock = blocks.has(node.name) && !(context === 'upstream' && node.name === 'server')
    if (expectsBlock !== hasBlock) {
      return { message: hasBlock ? `unexpected "{"` : `directive "${node.name}" has no opening "{"`, line: node.line }
    }
    if (node.name === 'listen') {
      if (node.args.length === 0) return { message: 'invalid number of arguments in "listen" directive', line: node.line }
      const invalidIndex = node.args.findIndex((argument, index) => index > 0 && argument !== 'default_server' && !argument.startsWith('ssl'))
      if (invalidIndex >= 0) {
        const value = node.args[invalidIndex]!
        if (value === 'root' || value === 'server_name' || contexts.server!.has(value)) {
          return { message: `invalid parameter "${value}"`, line: node.argLines[invalidIndex] ?? node.line }
        }
        return { message: `invalid parameter "${value}"`, line: node.argLines[invalidIndex] ?? node.line }
      }
    }
    if (node.name === 'location') {
      const key = node.args.join(' ')
      if (seenLocations.has(key)) return { message: `duplicate location "${node.args.at(-1) ?? ''}"`, line: node.line }
      seenLocations.set(key, node.line)
    }
    if (node.children) {
      const childContext = node.name
      const nested = validateLevel(node.children, childContext)
      if (nested) return nested
    }
  }
  return undefined
}

function findNode(nodes: DirectiveNode[], predicate: (node: DirectiveNode) => boolean): DirectiveNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node
    if (node.children) {
      const nested = findNode(node.children, predicate)
      if (nested) return nested
    }
  }
  return undefined
}

function failure(message: string, line: number): ConfigCheck {
  return {
    ok: false,
    errorLine: line,
    output: [`nginx: [emerg] ${message} in ${path}:${line}`, `nginx: configuration file ${path} test failed`]
  }
}
