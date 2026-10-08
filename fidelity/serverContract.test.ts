import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { configCases, requestCases } from './cases'
import { checkConfig } from '../src/sim/check'
import { VirtualFileSystem, type FileSeed } from '../src/sim/fs'
import { simulateRequest, type SimulatedRequest } from '../src/sim/request'
import { missionScenarios, validateMission, type MissionVariant } from '../src/missions/catalog'

// O backend valida as missões com uma implementação Java própria. Estes arquivos
// são o contrato entre as duas: o TypeScript é a referência e o Java precisa reproduzi-lo.
// Para regenerar depois de mudar o simulador ou o catálogo: npm run contract:update
const scenarioFile = new URL('../apps/api/src/main/resources/missions/mission-v1.json', import.meta.url)
const parityFile = new URL('../apps/api/src/test/resources/simulator-parity.json', import.meta.url)
const missionScenarioVersion = 'mission-v1'
const homeFile = '/srv/loja/index.html'

function files(seed: FileSeed) {
  return Object.fromEntries(Object.entries(seed).map(([path, file]) => [path, typeof file === 'string' ? { content: file } : file]))
}

function scenarios() {
  return {
    scenarioVersion: missionScenarioVersion,
    missions: Object.fromEntries((Object.keys(missionScenarios) as MissionVariant[]).map((variant) => {
      const scenario = missionScenarios[variant]
      return [variant, {
        title: scenario.title,
        files: files(scenario.files),
        host: scenario.host ?? 'localhost',
        homeFile,
        imageUri: scenario.imageUri,
        expectedFile: scenario.expectedFile,
        extraUri: scenario.extraUri ?? null,
        expectedExtraFile: scenario.expectedExtraFile ?? null,
        fallbackHost: scenario.fallbackHost ?? null,
        expectedFallbackServer: scenario.expectedFallbackServer ?? null,
        expectedFallbackStatus: scenario.expectedFallbackStatus ?? null
      }]
    }))
  }
}

const catalog = missionScenarios.catalog.initialConfig
const transfer = missionScenarios.transfer.initialConfig
const integration = missionScenarios.integration.initialConfig
const missionCases: { id: string; variant: MissionVariant; config: string }[] = [
  { id: 'catalog-initial', variant: 'catalog', config: catalog },
  { id: 'catalog-alias', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'alias /data/catalogo/;') },
  { id: 'catalog-alias-no-slash', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'alias /data/catalogo;') },
  { id: 'catalog-wrong-root', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'root /data;') },
  { id: 'catalog-rewrite-break', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'rewrite ^/imagens/(.*)$ /$1 break;\n      root /data/catalogo;') },
  { id: 'catalog-return-cheat', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'return 200 "caneca";') },
  { id: 'catalog-broken-home', variant: 'catalog', config: catalog.replace('root /srv/loja;', 'root /srv;').replace('root /data/catalogo;', 'alias /data/catalogo/;') },
  { id: 'catalog-proxy', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'proxy_pass http://127.0.0.1:9000;') },
  { id: 'catalog-exact-location', variant: 'catalog', config: catalog.replace('location /imagens/ {', 'location = /imagens/caneca.svg {\n      alias /data/catalogo/caneca.svg;\n    }\n    location /outro/ {') },
  { id: 'catalog-syntax-error', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'alias /data/catalogo') },
  { id: 'catalog-unknown-directive', variant: 'catalog', config: catalog.replace('root /data/catalogo;', 'aliass /data/catalogo/;') },
  { id: 'catalog-unsupported', variant: 'catalog', config: catalog.replace('index index.html;', 'index index.html;\n    sendfile on;') },
  { id: 'transfer-initial', variant: 'transfer', config: transfer },
  { id: 'transfer-alias', variant: 'transfer', config: transfer.replace('root /opt/produtos;', 'alias /opt/produtos/;') },
  { id: 'transfer-prefix-stop', variant: 'transfer', config: transfer.replace('location /midia/ {', 'location ^~ /midia/ {').replace('root /opt/produtos;', 'alias /opt/produtos/;') },
  { id: 'transfer-regex', variant: 'transfer', config: transfer.replace('location /midia/ {\n      root /opt/produtos;\n    }', 'location ~* \\.svg$ {\n      root /opt/produtos;\n      rewrite ^/midia/(.*)$ /$1 break;\n    }') },
  { id: 'integration-initial', variant: 'integration', config: integration },
  { id: 'integration-fixed', variant: 'integration', config: integration.replace('root /data/catalogo;', 'alias /data/catalogo/;').replace('try_files $uri $uri/ =404;', 'try_files $uri $uri/ /index.html;') },
  { id: 'integration-only-alias', variant: 'integration', config: integration.replace('root /data/catalogo;', 'alias /data/catalogo/;') },
  { id: 'integration-only-route', variant: 'integration', config: integration.replace('try_files $uri $uri/ =404;', 'try_files $uri $uri/ /index.html;') },
  { id: 'integration-lost-default', variant: 'integration', config: integration.replace('listen 80 default_server;', 'listen 80;').replace('server_name padrao.test;', 'server_name padrao.test;\n  }\n  server {\n    listen 80;\n    server_name loja-velha.test;').replace('root /data/catalogo;', 'alias /data/catalogo/;').replace('try_files $uri $uri/ =404;', 'try_files $uri $uri/ /index.html;') },
  { id: 'integration-wildcard', variant: 'integration', config: integration.replace('server_name loja.test;', 'server_name *.test;').replace('root /data/catalogo;', 'alias /data/catalogo/;').replace('try_files $uri $uri/ =404;', 'try_files $uri $uri/ /index.html;') }
]

function snapshot(config: string, seed: FileSeed, requests: SimulatedRequest[]) {
  const checked = checkConfig(config)
  return {
    check: { ok: checked.ok, output: checked.output, errorLine: checked.errorLine ?? null },
    responses: checked.ok && checked.config ? requests.map((request) => {
      const response = simulateRequest(checked.config!, request, { fs: new VirtualFileSystem(seed) })
      return {
        status: response.status,
        body: response.body,
        filePath: response.filePath ?? null,
        serverId: response.serverId ?? null,
        location: response.location ?? null,
        headers: Object.fromEntries(Object.entries(response.headers).filter(([name]) => name === 'Location' || name.startsWith('X-')))
      }
    }) : []
  }
}

function missionRequests(variant: MissionVariant): SimulatedRequest[] {
  const scenario = missionScenarios[variant]
  const host = scenario.host ?? 'localhost'
  return [
    { path: '/', host },
    { path: scenario.imageUri, host },
    ...(scenario.extraUri ? [{ path: scenario.extraUri, host }] : []),
    ...(scenario.fallbackHost ? [{ path: '/', host: scenario.fallbackHost }] : [])
  ]
}

function parity() {
  const extraConfigs = [
    'events {}\nhttp {\n  server {\n    listen 8080;\n    server_name a.test;\n    location / { return 301 https://$host$request_uri; }\n  }\n  server {\n    listen 80;\n    server_name www.*;\n    rewrite ^/antigo/(.*)$ /novo/$1 permanent;\n    return 200 "www $uri";\n  }\n}',
    'events {}\nhttp {\n  server {\n    listen 80;\n    root /data;\n    location / { index nada.html; }\n    location = /exato { return 204; }\n  }\n}',
    'events {}\nhttp {\n  server {\n    listen 80;\n    location /x { root /data; }\n    location /x { root /outro; }\n  }\n}',
    'events {}\nhttp {\n  server {\n    listen 80 ssl_like;\n  }\n}',
    'http {\n  server { listen 80; }\n}',
    'events {}\nhttp {\n  server {\n    listen 80;\n    location / {\n      return 200 "texto com \\"aspas\\" e # cerquilha";\n    }\n  }\n}\n# fim',
    'events {}\nhttp {\n  server {\n    listen 80;\n    root /vazio;\n    location / { try_files $uri /faltando; }\n  }\n}'
  ]
  return {
    checks: [
      ...configCases.map((testCase) => ({ id: `fidelity-${testCase.id}`, config: testCase.config, ...snapshot(testCase.config, {}, []).check })),
      ...missionCases.map((testCase) => ({ id: testCase.id, config: testCase.config, ...snapshot(testCase.config, {}, []).check })),
      ...extraConfigs.map((config, index) => ({ id: `extra-${index + 1}`, config, ...snapshot(config, {}, []).check }))
    ],
    requests: [
      ...requestCases.map((testCase) => ({ id: `fidelity-${testCase.id}`, config: testCase.config, files: files(testCase.files), requests: testCase.requests, responses: snapshot(testCase.config, testCase.files, testCase.requests).responses })),
      ...missionCases.map((testCase) => {
        const requests = missionRequests(testCase.variant)
        return { id: testCase.id, config: testCase.config, files: files(missionScenarios[testCase.variant].files), requests, responses: snapshot(testCase.config, missionScenarios[testCase.variant].files, requests).responses }
      }),
      {
        id: 'extra-1', config: extraConfigs[0]!, files: {},
        requests: [{ path: '/qualquer?x=1', host: 'a.test', port: 8080 }, { path: '/antigo/pagina', host: 'www.loja.test' }, { path: '/./a/../b//c', host: 'www.loja.test' }, { path: '/', host: 'a.test' }],
        responses: snapshot(extraConfigs[0]!, {}, [{ path: '/qualquer?x=1', host: 'a.test', port: 8080 }, { path: '/antigo/pagina', host: 'www.loja.test' }, { path: '/./a/../b//c', host: 'www.loja.test' }, { path: '/', host: 'a.test' }]).responses
      },
      {
        id: 'extra-2', config: extraConfigs[1]!, files: files({ '/data/pasta/arquivo.txt': 'oi', '/data/index.html': 'raiz' }),
        requests: [{ path: '/pasta/' }, { path: '/exato' }, { path: '/', method: 'HEAD' }, { path: '/pasta/arquivo.txt' }],
        responses: snapshot(extraConfigs[1]!, { '/data/pasta/arquivo.txt': 'oi', '/data/index.html': 'raiz' }, [{ path: '/pasta/' }, { path: '/exato' }, { path: '/', method: 'HEAD' }, { path: '/pasta/arquivo.txt' }]).responses
      },
      {
        id: 'extra-6', config: extraConfigs[5]!, files: {}, requests: [{ path: '/' }],
        responses: snapshot(extraConfigs[5]!, {}, [{ path: '/' }]).responses
      },
      {
        id: 'extra-7', config: extraConfigs[6]!, files: {}, requests: [{ path: '/x' }],
        responses: snapshot(extraConfigs[6]!, {}, [{ path: '/x' }]).responses
      }
    ],
    missions: missionCases.map((testCase) => {
      const checked = checkConfig(testCase.config)
      return { id: testCase.id, variant: testCase.variant, config: testCase.config, checkOk: checked.ok, expected: checked.ok ? validateMission(testCase.config, testCase.variant) : null }
    })
  }
}

function compare(file: URL, value: unknown) {
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (process.env.UPDATE_CONTRACT === '1') {
    mkdirSync(dirname(file.pathname), { recursive: true })
    writeFileSync(file, text)
  }
  expect(existsSync(file), `${file.pathname} ausente; rode npm run contract:update`).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8')), 'contrato desatualizado; rode npm run contract:update').toEqual(JSON.parse(text))
}

describe('contrato do simulador com o backend Java', () => {
  it('mantém os cenários das missões iguais aos do servidor', () => compare(scenarioFile, scenarios()))
  it('mantém os casos de paridade iguais ao simulador TypeScript', () => compare(parityFile, parity()))
  it('cobre soluções aceitas e recusadas de todas as missões', () => {
    const results = parity().missions
    for (const variant of Object.keys(missionScenarios)) {
      expect(results.some((item) => item.variant === variant && item.expected?.ok)).toBe(true)
      expect(results.some((item) => item.variant === variant && !item.expected?.ok)).toBe(true)
    }
  })
})
