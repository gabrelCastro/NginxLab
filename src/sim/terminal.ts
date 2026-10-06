import { BackendPool, type SimulatedBackend } from './backends'
import { checkConfig } from './check'
import { VirtualFileSystem, type FileSeed } from './fs'
import type { CompiledConfig } from './model'
import { simulateRequest, type RequestRuntime, type SimulatedResponse } from './request'

export interface TerminalState {
  draftSource: string
  activeSource: string
  activeConfig: CompiledConfig
  files: FileSeed
  backends: SimulatedBackend[]
  backendPool: BackendPool
  runtime: RequestRuntime
  accessLog: string[]
  errorLog: string[]
  commandCount: number
}

export interface CommandResult {
  output: string
  state: TerminalState
  response?: SimulatedResponse
  action?: 'test' | 'reload' | 'request'
  success?: boolean
}

export function createTerminalState(source: string, files: FileSeed = {}, backends: SimulatedBackend[] = []): TerminalState {
  const checked = checkConfig(source)
  if (!checked.ok || !checked.config) throw new Error(`Invalid initial config:\n${checked.output.join('\n')}`)
  return {
    draftSource: source,
    activeSource: source,
    activeConfig: checked.config,
    files,
    backends,
    backendPool: new BackendPool(backends),
    runtime: { cache: new Map(), rateCounts: new Map() },
    accessLog: [],
    errorLog: [],
    commandCount: 0
  }
}

export function executeCommand(current: TerminalState, command: string): CommandResult {
  const state = { ...current, commandCount: current.commandCount + 1 }
  const args = shellWords(command.trim())
  if (args.length === 0) return { output: '', state }
  if (args[0] === 'help') return { output: helpText, state }
  if (args[0] === 'clear') return { output: '\u0000clear', state }
  if (args[0] === 'nginx') return executeNginx(state, args)
  if (args[0] === 'curl') return executeCurl(state, args)
  if (args[0] === 'cat') return executeCat(state, args)
  if (args[0] === 'ls') return executeLs(state, args)
  if (args[0] === 'tail') return executeTail(state, args)
  const suggestion = closest(args[0]!, ['nginx', 'curl', 'cat', 'ls', 'tail', 'help', 'clear'])
  return { output: `bash: ${args[0]}: command not found${suggestion ? `\nVocê quis dizer '${suggestion}'?` : ''}`, state, success: false }
}

function executeNginx(state: TerminalState, args: string[]): CommandResult {
  if (args.length === 2 && args[1] === '-t') {
    const checked = checkConfig(state.draftSource)
    return { output: checked.output.join('\n'), state, action: 'test', success: checked.ok }
  }
  if (args.length === 3 && args[1] === '-s' && args[2] === 'reload') {
    const checked = checkConfig(state.draftSource)
    if (!checked.ok || !checked.config) return { output: checked.output.join('\n'), state, action: 'reload', success: false }
    return {
      output: '',
      state: { ...state, activeSource: state.draftSource, activeConfig: checked.config },
      action: 'reload',
      success: true
    }
  }
  return { output: 'nginx: invalid option: use nginx -t or nginx -s reload', state, success: false }
}

function executeCurl(state: TerminalState, args: string[]): CommandResult {
  let include = false
  let verbose = false
  let head = false
  let follow = false
  const headers: Record<string, string> = {}
  let url = ''
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '-i') include = true
    else if (argument === '-v') verbose = true
    else if (argument === '-I') head = true
    else if (argument === '-L') follow = true
    else if (argument === '-H' && args[index + 1]) {
      const [name, ...value] = args[++index]!.split(':')
      if (name) headers[name.trim()] = value.join(':').trim()
    } else if (!argument.startsWith('-')) url = argument
  }
  if (!url) return { output: 'curl: try curl -i http://localhost/', state, success: false }
  let parsed: URL
  try {
    parsed = new URL(url.includes('://') ? url : `http://${url}`)
  } catch {
    return { output: `curl: (3) URL rejected: ${url}`, state, success: false }
  }
  const host = headers.Host ?? parsed.host
  let response = simulateRequest(state.activeConfig, { method: head ? 'HEAD' : 'GET', scheme: parsed.protocol === 'https:' ? 'https' : 'http', host, port: parsed.port ? Number(parsed.port) : 80, path: `${parsed.pathname}${parsed.search}`, headers }, {
    fs: new VirtualFileSystem(state.files),
    backends: state.backendPool,
    runtime: state.runtime
  })
  if (follow && response.headers.Location) {
    const redirect = new URL(response.headers.Location, parsed)
    response = simulateRequest(state.activeConfig, { method: head ? 'HEAD' : 'GET', scheme: redirect.protocol === 'https:' ? 'https' : 'http', host: redirect.host, port: redirect.port ? Number(redirect.port) : 80, path: `${redirect.pathname}${redirect.search}`, headers }, {
      fs: new VirtualFileSystem(state.files),
      backends: state.backendPool,
      runtime: state.runtime
    })
  }
  const access = `127.0.0.1 - - [06/Oct/2026:10:42:${String(38 + state.commandCount).padStart(2, '0')} -0300] "${head ? 'HEAD' : 'GET'} ${parsed.pathname} HTTP/1.1" ${response.status} ${response.headers['Content-Length']} "-" "curl/8.10.1"`
  const error = response.status === 404 && response.filePath
    ? `2026/10/06 10:42:${String(38 + state.commandCount).padStart(2, '0')} [error] 1#1: *1 open() "${response.filePath}" failed (2: No such file or directory), client: 127.0.0.1, server: ${response.serverId ?? ''}, request: "GET ${parsed.pathname} HTTP/1.1", host: "${host}"`
    : undefined
  const nextState = { ...state, accessLog: [...state.accessLog, access], errorLog: error ? [...state.errorLog, error] : state.errorLog }
  const responseHead = [`HTTP/1.1 ${response.status} ${statusName(response.status)}`, ...Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`), ''].join('\n')
  const requestHead = verbose ? `> ${head ? 'HEAD' : 'GET'} ${parsed.pathname} HTTP/1.1\n> Host: ${host}\n>\n< ` : ''
  const rendered = `${requestHead}${include || verbose || head ? responseHead : ''}${head ? '' : response.body}`
  return { output: rendered, state: nextState, response, action: 'request', success: response.status < 400 }
}

function executeCat(state: TerminalState, args: string[]): CommandResult {
  const path = args[1]
  if (!path) return { output: 'cat: missing operand', state, success: false }
  if (path === '/etc/nginx/nginx.conf') return { output: state.draftSource, state, success: true }
  if (path.endsWith('access.log')) return { output: state.accessLog.join('\n'), state, success: true }
  if (path.endsWith('error.log')) return { output: state.errorLog.join('\n'), state, success: true }
  const file = new VirtualFileSystem(state.files).read(path)
  return file ? { output: file.content, state, success: true } : { output: `cat: ${path}: No such file or directory`, state, success: false }
}

function executeLs(state: TerminalState, args: string[]): CommandResult {
  const path = args.find((argument) => !argument.startsWith('-') && argument !== 'ls') ?? '/'
  const fs = new VirtualFileSystem(state.files)
  const entries = fs.list(path)
  return entries.length > 0 ? { output: entries.join('  '), state, success: true } : { output: `ls: ${path}: No such file or directory`, state, success: false }
}

function executeTail(state: TerminalState, args: string[]): CommandResult {
  const path = args.at(-1) ?? ''
  const lines = path.endsWith('access.log') ? state.accessLog : path.endsWith('error.log') ? state.errorLog : undefined
  return lines ? { output: lines.slice(-10).join('\n'), state, success: true } : { output: `tail: cannot open '${path}'`, state, success: false }
}

function shellWords(command: string) {
  const words: string[] = []
  let current = ''
  let quote = ''
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (quote) {
      if (character === quote) quote = ''
      else current += character
    } else if (character === '"' || character === "'") quote = character
    else if (/\s/.test(character)) {
      if (current) words.push(current)
      current = ''
    } else current += character
  }
  if (current) words.push(current)
  return words
}

function closest(value: string, options: string[]) {
  const first = options
    .map((option) => ({ option, distance: levenshtein(value, option) }))
    .sort((left, right) => left.distance - right.distance)[0]
  return first && first.distance <= 2 ? first.option : undefined
}

function levenshtein(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0]!
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const old = row[rightIndex]!
      row[rightIndex] = Math.min(row[rightIndex]! + 1, row[rightIndex - 1]! + 1, previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1))
      previous = old
    }
  }
  return row[right.length]!
}

function statusName(status: number) {
  return ({ 200: 'OK', 301: 'Moved Permanently', 302: 'Moved Temporarily', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 502: 'Bad Gateway', 503: 'Service Temporarily Unavailable', 504: 'Gateway Timeout' } as Record<number, string>)[status] ?? ''
}

const helpText = `Comandos disponíveis:
  nginx -t                 testa a configuração editada
  nginx -s reload          ativa uma configuração válida
  curl [-i|-v|-I|-L] URL   faz uma requisição simulada
  curl -H "Host: app.test" http://localhost/
  cat ARQUIVO               lê config, arquivo ou log
  ls [DIRETÓRIO]            lista o disco virtual
  tail [-f] ARQUIVO         mostra as últimas linhas do log
  clear                     limpa o terminal
  help                      mostra esta ajuda`
