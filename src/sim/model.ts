import type { DirectiveNode } from './config/types'

export type LocationModifier = 'exact' | 'prefix' | 'prefix-stop' | 'regex' | 'regex-insensitive'

export interface CompiledLocation {
  modifier: LocationModifier
  pattern: string
  line: number
  directives: DirectiveNode[]
}

export interface CompiledServer {
  id: string
  line: number
  port: number
  defaultServer: boolean
  names: string[]
  directives: DirectiveNode[]
  locations: CompiledLocation[]
}

export interface UpstreamPeer {
  address: string
  weight: number
  maxFails: number
}

export interface CompiledUpstream {
  name: string
  peers: UpstreamPeer[]
}

export interface CompiledConfig {
  ast: DirectiveNode[]
  servers: CompiledServer[]
  upstreams: CompiledUpstream[]
}

export function compileConfig(ast: DirectiveNode[]): CompiledConfig {
  const http = ast.find((directive) => directive.name === 'http')
  const nodes = http?.children ?? []
  const upstreams = nodes.filter((node) => node.name === 'upstream').map(compileUpstream)
  const servers = nodes.filter((node) => node.name === 'server').map((node, index) => compileServer(node, index))
  return { ast, servers, upstreams }
}

function compileServer(node: DirectiveNode, index: number): CompiledServer {
  const directives = node.children ?? []
  const listen = directives.find((directive) => directive.name === 'listen')
  const listenAddress = listen?.args.find((argument) => !argument.includes('=')) ?? '80'
  const portMatch = listenAddress.match(/(?::|^)(\d+)$/)
  const port = Number(portMatch?.[1] ?? 80)
  const names = directives.filter((directive) => directive.name === 'server_name').flatMap((directive) => directive.args)
  const locations = directives.filter((directive) => directive.name === 'location').map(compileLocation)
  return {
    id: names[0] ?? `server-${index + 1}`,
    line: node.line,
    port,
    defaultServer: listen?.args.includes('default_server') ?? false,
    names,
    directives,
    locations
  }
}

function compileLocation(node: DirectiveNode): CompiledLocation {
  const modifierToken = node.args[0]
  const modifier: LocationModifier = modifierToken === '='
    ? 'exact'
    : modifierToken === '^~'
      ? 'prefix-stop'
      : modifierToken === '~'
        ? 'regex'
        : modifierToken === '~*'
          ? 'regex-insensitive'
          : 'prefix'
  const pattern = modifier === 'prefix' ? (node.args[0] ?? '/') : (node.args[1] ?? '/')
  return { modifier, pattern, line: node.line, directives: node.children ?? [] }
}

function compileUpstream(node: DirectiveNode): CompiledUpstream {
  const peers = (node.children ?? []).filter((directive) => directive.name === 'server').map((directive) => ({
    address: directive.args[0] ?? '',
    weight: numericParameter(directive.args, 'weight', 1),
    maxFails: numericParameter(directive.args, 'max_fails', 1)
  }))
  return { name: node.args[0] ?? '', peers }
}

function numericParameter(args: string[], name: string, fallback: number) {
  const value = args.find((argument) => argument.startsWith(`${name}=`))?.split('=')[1]
  return value === undefined ? fallback : Number(value)
}
