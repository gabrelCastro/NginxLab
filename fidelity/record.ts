import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { configCases, requestCases } from './cases'
import type { ConfigRecording, RecordedResponse, RequestRecording } from './types'

const image = 'nginx:1.27-alpine'
const recordedDirectory = new URL('./recorded/', import.meta.url)

function main() {
  execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
  mkdirSync(recordedDirectory, { recursive: true })
  for (const testCase of configCases) recordConfig(testCase.id, testCase.config)
  for (const testCase of requestCases) recordRequests(testCase)
}

function recordConfig(id: string, config: string) {
  const directory = mkdtempSync(join(tmpdir(), 'nginxlearn-config-'))
  const configPath = join(directory, 'nginx.conf')
  writeFileSync(configPath, config)
  const result = spawnSync('docker', [
    'run', '--rm', '--entrypoint', 'nginx', '-v', `${configPath}:/etc/nginx/nginx.conf:ro`, image,
    '-t', '-c', '/etc/nginx/nginx.conf'
  ], { encoding: 'utf8' })
  const output = `${result.stdout}${result.stderr}`
    .split('\n')
    .filter((line) => line.startsWith('nginx:'))
  writeRecording<ConfigRecording>(`config-${id}.json`, { id, output })
  rmSync(directory, { recursive: true })
}

function recordRequests(testCase: (typeof requestCases)[number]) {
  const directory = mkdtempSync(join(tmpdir(), 'nginxlearn-request-'))
  const configPath = join(directory, 'nginx.conf')
  const dataPath = join(directory, 'data')
  mkdirSync(dataPath)
  writeFileSync(configPath, testCase.config)
  for (const [path, value] of Object.entries(testCase.files)) {
    const destination = join(directory, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, typeof value === 'string' ? value : value.content)
  }
  const container = `nginxlearn-${process.pid}-${testCase.id}`
  execFileSync('docker', ['run', '--rm', '-d', '--name', container, '-v', `${configPath}:/etc/nginx/nginx.conf:ro`, '-v', `${dataPath}:/data:ro`, image], { stdio: 'ignore' })
  try {
    const responses = testCase.requests.map((request) => fetchInsideContainer(container, request.host ?? 'localhost', request.path))
    writeRecording<RequestRecording>(`request-${testCase.id}.json`, { id: testCase.id, responses })
  } finally {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' })
    rmSync(directory, { recursive: true })
  }
}

// curl, e não o wget do BusyBox: o wget descarta o corpo de respostas 4xx/5xx.
function fetchInsideContainer(container: string, host: string, path: string): RecordedResponse {
  const result = spawnSync('docker', ['exec', container, 'curl', '-s', '-D', '/dev/stderr', '-H', `Host: ${host}`, `http://127.0.0.1${path}`], { encoding: 'utf8' })
  const status = Number(result.stderr.match(/HTTP\/1\.1 (\d+)/)?.[1] ?? 0)
  const headers = Object.fromEntries([...result.stderr.matchAll(/^([\w-]+): (.+?)\r?$/gm)]
    .filter((match) => ['location', 'x-location'].includes(match[1]!.toLowerCase()))
    .map((match) => [canonicalHeader(match[1]!), match[2]!.trim()]))
  return { status, headers, body: result.stdout }
}

function canonicalHeader(name: string) {
  return name.toLowerCase().split('-').map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join('-')
}

function writeRecording<T>(name: string, value: T) {
  writeFileSync(new URL(name, recordedDirectory), `${JSON.stringify(value, null, 2)}\n`)
  process.stdout.write(`recorded ${name}\n`)
}

main()
