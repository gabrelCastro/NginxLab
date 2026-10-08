import { createTerminalState } from '../sim/terminal'
import { simulateRequest } from '../sim/request'
import { VirtualFileSystem, type FileSeed } from '../sim/fs'

export type MissionVariant = 'catalog' | 'transfer' | 'integration'
export type MissionStage = 'observe' | 'predict' | 'investigate' | 'repair' | 'transfer-intro' | 'transfer' | 'complete' | 'integration' | 'campaign-complete'

export interface MissionScenario {
  title: string
  imageUri: string
  expectedFile: string
  expectedBody: string
  initialConfig: string
  files: FileSeed
  prediction: string[]
  correctPrediction: number
  explanations: string[]
  hints: string[]
  host?: string
  extraUri?: string
  expectedExtraFile?: string
  fallbackHost?: string
  expectedFallbackServer?: string
  expectedFallbackStatus?: number
}

const cup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect width="240" height="180" rx="18" fill="#e9d9c0"/><path d="M70 58h90v72q0 23-45 23T70 130z" fill="#79533a"/><path d="M160 75h22q25 0 13 26-7 14-35 15" fill="none" stroke="#79533a" stroke-width="13"/><path d="M95 48q-10-13 0-25m30 25q-10-13 0-25" fill="none" stroke="#fff8ef" stroke-width="5"/></svg>'
const vase = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect width="240" height="180" rx="18" fill="#dce7d6"/><path d="M90 60h60l-6 70q-4 28-24 28t-24-28z" fill="#497e69"/><path d="M120 66q-31-24-18-43 23 1 18 43m0 0q31-24 18-43-23 1-18 43" fill="#65996b"/></svg>'

function page(imageUri: string, product: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>body{margin:0;padding:28px;font:15px system-ui;background:#f7f4ef;color:#26352f}.brand{font-weight:800;letter-spacing:.09em;color:#497e69}h1{font-size:25px;margin:18px 0 7px}.card{max-width:270px;background:white;border:1px solid #e2dfd6;border-radius:15px;padding:15px;box-shadow:0 8px 30px #26352f12}img{display:block;width:100%;height:160px;object-fit:contain;background:#f0eee7;border-radius:9px}small{color:#68776c}</style></head><body><div class="brand">VERDE & CO.</div><h1>Catálogo</h1><p>Produtos escolhidos para o seu dia.</p><div class="card"><img src="{{IMAGE_SRC}}" data-uri="${imageUri}" alt="${product}"><h2>${product}</h2><small>Disponível na loja</small></div></body></html>`
}

export const missionScenarios: Record<MissionVariant, MissionScenario> = {
  catalog: {
    title: 'As imagens da loja sumiram',
    imageUri: '/imagens/caneca.svg',
    expectedFile: '/data/catalogo/caneca.svg',
    expectedBody: cup,
    initialConfig: 'events {}\nhttp {\n  server {\n    listen 80;\n    server_name localhost;\n    root /srv/loja;\n    index index.html;\n    location /imagens/ {\n      root /data/catalogo;\n    }\n  }\n}',
    files: { '/srv/loja/index.html': page('/imagens/caneca.svg', 'Caneca artesanal'), '/data/catalogo/caneca.svg': { content: cup, contentType: 'image/svg+xml' } },
    prediction: ['/data/catalogo/caneca.svg', '/data/catalogo/imagens/caneca.svg', '/srv/loja/imagens/caneca.svg'],
    correctPrediction: 1,
    explanations: [
      'Esse é o arquivo existente. Com root, porém, o nginx acrescenta a URI inteira à pasta configurada.',
      'Isso mesmo: root /data/catalogo + /imagens/caneca.svg. Esse caminho não existe.',
      'A location /imagens/ define outro root; o root do server não é usado nessa requisição.'
    ],
    hints: [
      'Compare o caminho do 404 no trace ou no error.log com o arquivo listado em /data/catalogo.',
      'root conserva toda a URI. alias troca o prefixo da location pelo diretório indicado.',
      'Uma possibilidade é trocar root /data/catalogo; por alias /data/catalogo; dentro de location /imagens/. Depois teste e recarregue.'
    ]
  },
  transfer: {
    title: 'Um novo produto, outro caminho',
    imageUri: '/midia/vaso.svg',
    expectedFile: '/opt/produtos/vaso.svg',
    expectedBody: vase,
    initialConfig: 'events {}\nhttp {\n  server {\n    listen 80;\n    server_name localhost;\n    root /srv/loja;\n    index index.html;\n    location /midia/ {\n      root /opt/produtos;\n    }\n  }\n}',
    files: { '/srv/loja/index.html': page('/midia/vaso.svg', 'Vaso de cerâmica'), '/opt/produtos/vaso.svg': { content: vase, contentType: 'image/svg+xml' } },
    prediction: ['/opt/produtos/vaso.svg', '/opt/produtos/midia/vaso.svg', '/srv/loja/midia/vaso.svg'],
    correctPrediction: 1,
    explanations: [],
    hints: [
      'Faça uma requisição para /midia/vaso.svg e observe o caminho tentado.',
      'Compare o prefixo /midia/ com a pasta real /opt/produtos/.',
      'Uma solução é substituir o root da location por alias /opt/produtos; e recarregar.'
    ]
  },
  integration: {
    title: 'A loja voltou, mas duas rotas falham',
    imageUri: '/imagens/caneca.svg',
    expectedFile: '/data/catalogo/caneca.svg',
    expectedBody: cup,
    host: 'loja.test',
    extraUri: '/dashboard',
    expectedExtraFile: '/srv/loja/index.html',
    fallbackHost: 'desconhecido.test',
    expectedFallbackServer: 'padrao.test',
    expectedFallbackStatus: 404,
    initialConfig: 'events {}\nhttp {\n  server {\n    listen 80 default_server;\n    server_name padrao.test;\n    return 404 "site desconhecido";\n  }\n  server {\n    listen 80;\n    server_name loja.test;\n    root /srv/loja;\n    index index.html;\n    location /imagens/ { root /data/catalogo; }\n    location / { try_files $uri $uri/ =404; }\n  }\n}',
    files: { '/srv/loja/index.html': page('/imagens/caneca.svg', 'Caneca artesanal'), '/data/catalogo/caneca.svg': { content: cup, contentType: 'image/svg+xml' } },
    prediction: [],
    correctPrediction: 0,
    explanations: [],
    hints: [
      'Teste a imagem e /dashboard com Host: loja.test. Compare os caminhos e estados no mapa.',
      'A imagem precisa trocar o prefixo /imagens/ pela pasta real. Uma rota da aplicação precisa entregar index.html sem transformar os assets em HTML.',
      'Revise alias na location /imagens/ e o último argumento de try_files na location /. Teste, recarregue e confirme também o site padrão.'
    ]
  }
}

export interface MissionValidation {
  ok: boolean
  home: boolean
  image: boolean
  message: string
  route?: boolean
  fallback?: boolean
}

export function validateMission(activeSource: string, variant: MissionVariant): MissionValidation {
  const scenario = missionScenarios[variant]
  const session = createTerminalState(activeSource, scenario.files)
  const fs = new VirtualFileSystem(scenario.files)
  const home = simulateRequest(session.activeConfig, { path: '/', host: scenario.host ?? 'localhost' }, { fs })
  const image = simulateRequest(session.activeConfig, { path: scenario.imageUri, host: scenario.host ?? 'localhost' }, { fs })
  const route = scenario.extraUri ? simulateRequest(session.activeConfig, { path: scenario.extraUri, host: scenario.host ?? 'localhost' }, { fs }) : undefined
  const fallback = scenario.fallbackHost ? simulateRequest(session.activeConfig, { path: '/', host: scenario.fallbackHost }, { fs }) : undefined
  const homeOk = home.status === 200 && home.filePath === '/srv/loja/index.html' && home.body === (scenario.files['/srv/loja/index.html'] as string)
  const imageOk = image.status === 200 && image.filePath === scenario.expectedFile && image.body === scenario.expectedBody
  const routeOk = !scenario.extraUri || (route?.status === 200 && route.filePath === scenario.expectedExtraFile && route.body === home.body)
  const fallbackOk = !scenario.fallbackHost || (fallback?.status === scenario.expectedFallbackStatus && fallback?.serverId === scenario.expectedFallbackServer)
  return {
    ok: homeOk && imageOk && routeOk && fallbackOk,
    home: homeOk,
    image: imageOk,
    route: routeOk,
    fallback: fallbackOk,
    message: !homeOk ? 'A página inicial precisa continuar vindo de /srv/loja/index.html.' : !imageOk ? `A imagem ainda não vem de ${scenario.expectedFile}. Consulte o caminho no trace.` : !routeOk ? `A rota ${scenario.extraUri} precisa entregar index.html sem quebrar os recursos reais.` : !fallbackOk ? 'Um Host desconhecido deve continuar chegando ao servidor padrão.' : 'Página, imagem, rota da aplicação e site padrão respondem corretamente.'
  }
}
