import type { Lesson, LessonEvent } from './types'

const baseStart = `events {}
http {
  server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
  }
}`

const requested = (predicate: (event: LessonEvent) => boolean) => (events: LessonEvent[]) => events.some((event) => event.action === 'request' && predicate(event))
const commandSucceeded = (action: LessonEvent['action']) => (events: LessonEvent[]) => events.some((event) => event.action === action && event.success)

export const lessons: Lesson[] = [
  {
    id: 'servidor-de-arquivos', number: 1, title: 'Um servidor que entrega arquivos', eyebrow: 'Primeiro contato',
    idea: 'Uma requisição chega a uma porta; o server transforma a URI em um caminho no disco e devolve uma resposta.',
    initialConfig: baseStart,
    files: { '/usr/share/nginx/html/index.html': '<h1>Olá, nginx!</h1>', '/usr/share/nginx/html/sobre.html': '<h1>Sobre</h1>' },
    objectives: [
      { id: 'home-200', label: 'Receba 200 ao pedir a página inicial', verify: requested((event) => event.response?.status === 200 && event.response.filePath?.endsWith('index.html') === true) },
      { id: 'see-headers', label: 'Veja status e headers com curl -i', verify: (events) => events.some((event) => event.command.startsWith('curl -i') && event.response?.status === 200) }
    ],
    hints: ['Rode curl -i http://localhost/.', 'root define a pasta; index define o arquivo usado quando a URI aponta para um diretório.'],
    article: {
      paragraphs: ['HTTP é uma conversa: o cliente envia método, caminho e headers; o servidor devolve status, headers e corpo.', 'O nginx junta o root à URI. Para /, procura o arquivo configurado por index. Um arquivo encontrado gera 200; um caminho ausente gera 404.'],
      links: [{ label: 'Documentação de root', href: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#root' }]
    },
    walkthrough: ['curl -i http://localhost/']
  },
  {
    id: 'teste-e-reload', number: 2, title: 'Mudei a config e nada mudou?', eyebrow: 'Ciclo seguro',
    idea: 'O arquivo editado não é a configuração ativa. Primeiro teste; depois recarregue sem derrubar o serviço.',
    initialConfig: baseStart,
    files: { '/usr/share/nginx/html/index.html': 'config ativa' },
    objectives: [
      { id: 'test', label: 'Teste a configuração com nginx -t', verify: commandSucceeded('test') },
      { id: 'reload', label: 'Ative a configuração com nginx -s reload', verify: commandSucceeded('reload') }
    ],
    hints: ['Use nginx -t antes do reload.', 'Se houver erro, a configuração anterior continua respondendo.'],
    article: {
      paragraphs: ['nginx -t lê a configuração e valida sintaxe e contexto. A linha indicada é onde o parser percebeu o problema — às vezes uma linha depois do ponto em que faltou ;.', 'nginx -s reload só troca os workers quando a nova configuração é válida.'],
      links: [{ label: 'Controlando o nginx', href: 'https://nginx.org/en/docs/control.html' }]
    },
    walkthrough: ['nginx -t', 'nginx -s reload']
  },
  {
    id: 'varios-sites', number: 3, title: 'Vários sites no mesmo servidor', eyebrow: 'Virtual hosts',
    idea: 'A porta cria o grupo de candidatos; o header Host escolhe o server_name dentro desse grupo.',
    initialConfig: `events {}
http {
  server { listen 80 default_server; server_name padrao.test; return 200 "site padrão"; }
  server { listen 80; server_name loja.test; return 200 "loja"; }
}`,
    files: {},
    objectives: [
      { id: 'named', label: 'Acesse loja.test pelo header Host', verify: requested((event) => event.response?.serverId === 'loja.test') },
      { id: 'default', label: 'Veja o default_server responder a um Host desconhecido', verify: requested((event) => event.response?.serverId === 'padrao.test') }
    ],
    hints: ['Use curl -i -H "Host: loja.test" http://localhost/.', 'Troque loja.test por desconhecido.test para observar o fallback.'],
    article: {
      paragraphs: ['Vários blocos server podem ouvir a mesma porta. nginx compara Host com server_name; sem correspondência, usa default_server ou o primeiro bloco daquela porta.'],
      links: [{ label: 'Como nginx processa uma requisição', href: 'https://nginx.org/en/docs/http/request_processing.html' }]
    },
    walkthrough: ['curl -i -H "Host: loja.test" http://localhost/', 'curl -i -H "Host: desconhecido.test" http://localhost/']
  },
  {
    id: 'caminhos-e-arquivos', number: 4, title: 'Caminhos e arquivos', eyebrow: 'Disco virtual',
    idea: 'root preserva a URI; alias substitui o prefixo da location. O caminho final é o que realmente importa.',
    initialConfig: `events {}
http { server {
  listen 80; root /var/www;
  location /docs/ { root /srv; }
  location /imagens/ { alias /data/images/; }
} }`,
    files: { '/srv/docs/guia.txt': 'guia', '/data/images/logo.txt': 'logo' },
    objectives: [
      { id: 'root', label: 'Encontre um arquivo usando root', verify: requested((event) => event.response?.filePath === '/srv/docs/guia.txt') },
      { id: 'alias', label: 'Encontre um arquivo usando alias', verify: requested((event) => event.response?.filePath === '/data/images/logo.txt') }
    ],
    hints: ['Peça /docs/guia.txt.', 'Depois peça /imagens/logo.txt e compare o caminho no palco.'],
    article: {
      paragraphs: ['Com root, nginx concatena o caminho inteiro da URI. Com alias, substitui a parte que correspondeu à location.', 'Um diretório sem index e sem autoindex responde 403; um caminho inexistente responde 404. O error.log revela o caminho tentado.'],
      links: [{ label: 'Documentação de alias', href: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#alias' }]
    },
    walkthrough: ['curl -i http://localhost/docs/guia.txt', 'curl -i http://localhost/imagens/logo.txt']
  },
  {
    id: 'location-vencedora', number: 5, title: 'Qual location venceu?', eyebrow: 'Algoritmo de seleção',
    idea: 'Exata vence já; ^~ protege o maior prefixo; depois a primeira regex correspondente; por fim o maior prefixo.',
    initialConfig: `events {}
http { server {
  listen 80;
  location / { return 200 "prefixo"; }
  location ~ \\.php$ { return 200 "regex"; }
  location ^~ /static/ { return 200 "estático"; }
  location = /health { return 200 "exata"; }
} }`,
    files: {},
    objectives: [
      { id: 'exact', label: 'Faça a location exata vencer', verify: requested((event) => event.response?.location === '= /health') },
      { id: 'regex', label: 'Faça a regex vencer do maior prefixo', verify: requested((event) => event.response?.location?.startsWith('~ ') === true) }
    ],
    hints: ['Peça /health para a correspondência exata.', 'Peça /index.php e avance pelo trace.'],
    article: {
      paragraphs: ['nginx guarda o maior prefixo enquanto avalia locations. Uma correspondência exata encerra a busca. ^~ também impede regex; sem ele, regex são testadas na ordem do arquivo.'],
      links: [{ label: 'Seleção de location', href: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#location' }]
    },
    walkthrough: ['curl -i http://localhost/health', 'curl -i http://localhost/index.php']
  },
  {
    id: 'spa-try-files', number: 6, title: 'SPAs e try_files', eyebrow: 'Fallback interno',
    idea: 'Arquivos reais continuam sendo servidos; rotas do app caem em index.html para o roteador do navegador.',
    initialConfig: `events {}
http { server {
  listen 80; root /app;
  location / { try_files $uri $uri/ /index.html; }
} }`,
    files: { '/app/index.html': '<div id="root">App</div>', '/app/assets/app.js': 'start()' },
    objectives: [
      { id: 'asset', label: 'Sirva um asset que existe', verify: requested((event) => event.response?.filePath === '/app/assets/app.js') },
      { id: 'fallback', label: 'Faça uma rota da SPA cair em index.html', verify: requested((event) => event.command.includes('/dashboard') && event.response?.filePath === '/app/index.html') }
    ],
    hints: ['Peça /assets/app.js.', 'Depois peça /dashboard, que não existe no disco.'],
    article: {
      paragraphs: ['try_files verifica candidatos em ordem. O último argumento pode ser um status, como =404, ou uma URI para redirecionamento interno.', 'Em uma SPA, /dashboard não é arquivo: /index.html inicia o app, e o roteador do navegador interpreta a rota.'],
      links: [{ label: 'Documentação de try_files', href: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files' }]
    },
    walkthrough: ['curl -i http://localhost/assets/app.js', 'curl -i http://localhost/dashboard']
  },
  {
    id: 'redirecionar', number: 7, title: 'Redirecionar', eyebrow: 'Nova localização',
    idea: 'Um redirect não entrega a página: responde 3xx e indica outra URL no header Location.',
    initialConfig: `events {}
http { server {
  listen 80;
  return 301 https://$host$request_uri;
} }`,
    files: {},
    objectives: [
      { id: 'redirect', label: 'Observe 301 e o header Location', verify: requested((event) => event.response?.status === 301 && Boolean(event.response.headers.Location)) },
      { id: 'verbose', label: 'Inspecione a conversa com curl -v', verify: (events) => events.some((event) => event.command.startsWith('curl -v') && event.response?.status === 301) }
    ],
    hints: ['Use curl -v http://localhost/antiga.', 'Sem TLS real no laboratório, não use -L neste exercício.'],
    article: {
      paragraphs: ['return 301 encerra o processamento e envia Location. O navegador faz uma segunda requisição; o servidor não “move” o corpo da primeira.', 'rewrite é útil quando a URL de destino depende de uma expressão regular; prefira return para redirects simples.'],
      links: [{ label: 'Documentação de return', href: 'https://nginx.org/en/docs/http/ngx_http_rewrite_module.html#return' }]
    },
    walkthrough: ['curl -v http://localhost/antiga']
  },
  {
    id: 'proxy-reverso', number: 8, title: 'Proxy reverso', eyebrow: 'Outra aplicação responde',
    idea: 'nginx recebe a conexão pública, cria outra requisição para o backend e devolve a resposta dele.',
    initialConfig: `events {}
http { server {
  listen 80;
  location /api/ {
    proxy_pass http://app/v1/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
} }`,
    files: {},
    backends: [{ address: 'app', respond: (request) => ({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: request.path, host: request.headers.Host }) }) }],
    objectives: [
      { id: 'proxy', label: 'Envie uma requisição ao backend', verify: requested((event) => event.response?.backend === 'app') },
      { id: 'slash', label: 'Observe a URI substituída pela barra do proxy_pass', verify: requested((event) => event.response?.body.includes('/v1/users') === true) }
    ],
    hints: ['Peça /api/users.', 'Compare location /api/ com proxy_pass terminado em /v1/.'],
    article: {
      paragraphs: ['Com URI em proxy_pass, a parte que correspondeu à location é substituída. Sem URI, o caminho original é repassado.', 'Headers como Host e X-Forwarded-For dão ao backend contexto sobre a requisição original.'],
      links: [{ label: 'Documentação de proxy_pass', href: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass' }]
    },
    walkthrough: ['curl -i http://localhost/api/users']
  },
  {
    id: 'mais-de-um-backend', number: 9, title: 'Mais de um backend', eyebrow: 'Upstream',
    idea: 'Um upstream distribui requisições entre peers; pesos alteram a proporção e peers indisponíveis são evitados.',
    initialConfig: `events {}
http {
  upstream api { server api-a:80 weight=2; server api-b:80 max_fails=1; server api-c:80; }
  server { listen 80; location / { proxy_pass http://api; } }
}`,
    files: {},
    backends: [
      { address: 'api-a:80', respond: () => ({ status: 200, body: 'api-a' }) },
      { address: 'api-b:80', available: false, respond: () => ({ status: 200, body: 'api-b' }) },
      { address: 'api-c:80', respond: () => ({ status: 200, body: 'api-c' }) }
    ],
    objectives: [
      { id: 'a', label: 'Receba uma resposta de api-a', verify: requested((event) => event.response?.backend === 'api-a:80') },
      { id: 'c', label: 'Veja o balanceamento alcançar api-c', verify: requested((event) => event.response?.backend === 'api-c:80') }
    ],
    hints: ['Faça três requisições para /.', 'api-b está indisponível; o simulador deve seguir para um peer saudável.'],
    article: {
      paragraphs: ['Por padrão, upstream usa round-robin. weight repete um peer na distribuição. max_fails participa da retirada temporária de peers que falham.', 'Sem peer disponível, nginx responde 502; um backend que aceita a conexão mas demora demais leva a 504.'],
      links: [{ label: 'Upstream HTTP', href: 'https://nginx.org/en/docs/http/ngx_http_upstream_module.html' }]
    },
    walkthrough: ['curl http://localhost/', 'curl http://localhost/', 'curl http://localhost/']
  },
  {
    id: 'cache-e-limites', number: 10, title: 'Cache e limites', eyebrow: 'Proteção e desempenho',
    idea: 'Cache evita trabalho repetido no backend; limit_req controla rajadas por chave antes que elas cheguem à aplicação.',
    initialConfig: `events {}
http {
  proxy_cache_path /cache keys_zone=learn:10m;
  limit_req_zone $remote_addr zone=per_ip:10m rate=1r/s;
  server { listen 80; location / {
    proxy_pass http://catalog;
    proxy_cache learn;
    limit_req zone=per_ip burst=1;
    limit_req_status 429;
  } }
}`,
    files: {},
    backends: [{ address: 'catalog', respond: () => ({ status: 200, body: 'catálogo' }) }],
    objectives: [
      { id: 'hit', label: 'Observe MISS e depois HIT no cache', verify: (events) => events.some((event) => event.response?.headers['X-Cache-Status'] === 'MISS') && events.some((event) => event.response?.headers['X-Cache-Status'] === 'HIT') },
      { id: 'limit', label: 'Exceda a rajada e receba 429', verify: requested((event) => event.response?.status === 429) }
    ],
    hints: ['Faça duas requisições: a primeira é MISS e a segunda é HIT.', 'Uma terceira requisição imediata excede burst=1 e recebe o status configurado.'],
    article: {
      paragraphs: ['proxy_cache guarda respostas elegíveis e atende pedidos futuros sem chamar o upstream. HIT e MISS tornam isso observável.', 'limit_req usa uma zona compartilhada e a chave escolhida. burst tolera uma pequena rajada; limit_req_status muda o 503 padrão, por exemplo para 429.'],
      links: [
        { label: 'Cache de proxy', href: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache' },
        { label: 'Limite de requisições', href: 'https://nginx.org/en/docs/http/ngx_http_limit_req_module.html' }
      ]
    },
    walkthrough: ['curl -i http://localhost/', 'curl -i http://localhost/', 'curl -i http://localhost/']
  }
]

export function lessonById(id: string) {
  return lessons.find((lesson) => lesson.id === id) ?? lessons[0]!
}

export type { Lesson, LessonEvent } from './types'
