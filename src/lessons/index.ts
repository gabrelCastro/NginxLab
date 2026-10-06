import type { Lesson, LessonEvent, LessonStep } from './types'

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

const lessonDefinitions: Omit<Lesson, 'steps'>[] = [
  {
    id: 'servidor-de-arquivos', number: 1, title: 'Um servidor que entrega arquivos', eyebrow: 'Primeiro contato',
    idea: 'Uma requisição chega a uma porta; o server transforma a URI em um caminho no disco e devolve uma resposta.',
    initialConfig: baseStart,
    files: { '/usr/share/nginx/html/index.html': '<h1>Olá, nginx!</h1>', '/usr/share/nginx/html/sobre.html': '<h1>Sobre</h1>' },
    objectives: [
      { id: 'home-200', label: 'Receba 200 ao pedir a página inicial', verify: requested((event) => event.response?.status === 200 && event.response.filePath?.endsWith('index.html') === true) },
      { id: 'see-headers', label: 'Veja status e headers com curl -i', verify: (events) => events.some((event) => event.command.startsWith('curl -i') && event.response?.status === 200) },
      { id: 'not-found', label: 'Compare com uma resposta 404', verify: requested((event) => event.response?.status === 404) }
    ],
    hints: ['Siga o cartão marcado “Agora”; ele libera uma ação de cada vez.', 'root define a pasta; index define o arquivo usado quando a URI aponta para um diretório.'],
    article: {
      paragraphs: ['HTTP é uma conversa: o cliente envia método, caminho e headers; o servidor devolve status, headers e corpo.', 'O nginx junta o root à URI. Para /, procura o arquivo configurado por index. Um arquivo encontrado gera 200; um caminho ausente gera 404.'],
      links: [{ label: 'Documentação de root', href: 'https://nginx.org/en/docs/http/ngx_http_core_module.html#root' }]
    },
    walkthrough: ['curl -i http://localhost/', 'curl -i http://localhost/nao-existe']
  },
  {
    id: 'teste-e-reload', number: 2, title: 'Mudei a config e nada mudou?', eyebrow: 'Ciclo seguro',
    idea: 'O arquivo editado não é a configuração ativa. Primeiro teste; depois recarregue sem derrubar o serviço.',
    initialConfig: baseStart,
    files: { '/usr/share/nginx/html/index.html': 'config antiga', '/usr/share/nginx/html/sobre.html': 'nova configuração' },
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

const gotStatus = (status: number, path?: string) => requested((event) => event.response?.status === status && (!path || event.command.includes(path)))

const guides: Record<string, LessonStep[]> = {
  'servidor-de-arquivos': [
    {
      id: 'tour',
      title: 'Conheça a bancada',
      explanation: 'Você está em um laboratório, não em um servidor real. À esquerda fica o arquivo que diz ao nginx como trabalhar e, abaixo, o terminal. No centro, o palco mostrará cada decisão. Este painel conduz o exercício. Você não precisa decorar nada agora.',
      check: {
        prompt: 'Onde você acompanha as decisões internas tomadas pelo nginx?',
        options: ['No editor', 'No palco central', 'No seletor de lições'],
        correctIndex: 1
      },
      takeaway: 'O editor contém as regras, o terminal envia ações e o palco transforma o processamento interno em uma sequência visível.'
    },
    {
      id: 'config',
      title: 'Leia a configuração como uma frase',
      explanation: 'No editor, server significa “um site”. listen 80 diz em qual porta ele recebe visitas. root aponta para a pasta dos arquivos. index diz qual arquivo abrir quando alguém pede apenas /. As chaves agrupam essas regras; o ; encerra cada instrução.',
      check: {
        prompt: 'Qual diretiva indica a pasta onde o nginx procurará os arquivos?',
        options: ['listen', 'root', 'index'],
        correctIndex: 1
      },
      takeaway: 'root define a pasta base. index apenas escolhe o nome do arquivo usado quando a URI aponta para um diretório.'
    },
    {
      id: 'first-request',
      title: 'Faça sua primeira requisição',
      explanation: 'Agora você será o cliente. curl é um pequeno navegador de terminal: ele envia uma requisição HTTP ao endereço e imprime a resposta. Execute o comando e acompanhe a partícula no palco.',
      command: 'curl -i http://localhost/',
      commandParts: [
        { text: 'curl', meaning: 'programa que faz a requisição' },
        { text: '-i', meaning: 'mostra status e headers da resposta' },
        { text: 'http://localhost/', meaning: 'este servidor, no caminho /' }
      ],
      lookFor: 'Procure HTTP/1.1 200 OK no terminal. 200 significa que o pedido deu certo. No palco, veja root e index virarem o caminho /usr/share/nginx/html/index.html.',
      takeaway: 'O nginx recebeu a URI /, combinou root com index.html, encontrou o arquivo e respondeu 200. O status, portanto, resume o resultado de todo esse caminho.',
      verify: gotStatus(200, 'localhost/')
    },
    {
      id: 'read-response',
      title: 'Entenda o que voltou',
      explanation: 'A primeira linha é o status. Os headers descrevem a resposta — por exemplo, o tipo e o tamanho. Depois da linha vazia vem o corpo: neste caso, o HTML do arquivo. Requisição é o pedido; resposta é o que o servidor devolve.',
      check: {
        prompt: 'Em qual parte você encontra o HTML devolvido pelo servidor?',
        options: ['No status', 'Nos headers', 'No corpo da resposta'],
        correctIndex: 2
      },
      takeaway: 'O status resume o resultado, os headers trazem metadados e o corpo carrega o conteúdo pedido.'
    },
    {
      id: 'compare-404',
      title: 'Compare com um arquivo ausente',
      explanation: 'Peça agora um caminho que não existe. A rede e o server continuam funcionando; só o recurso pedido não foi encontrado. Essa diferença é exatamente o que o status 404 comunica.',
      command: 'curl -i http://localhost/nao-existe',
      commandParts: [
        { text: '/nao-existe', meaning: 'URI que o nginx tentará encontrar no root' },
        { text: '404', meaning: 'o servidor respondeu, mas não encontrou o recurso' }
      ],
      lookFor: 'Compare 404 Not Found com o 200 anterior e observe no palco o caminho de arquivo que foi procurado.',
      takeaway: 'O servidor estava acessível e processou o pedido normalmente. O 404 informa apenas que o recurso calculado não existia — é diferente de uma falha de conexão.',
      verify: gotStatus(404, '/nao-existe')
    }
  ],
  'teste-e-reload': [
    {
      id: 'two-configs',
      title: 'Separe arquivo editado de configuração ativa',
      explanation: 'Editar nginx.conf não muda o servidor imediatamente. O nginx continua usando a última configuração carregada. Isso evita que um erro de digitação derrube um site que já funciona.',
      check: {
        prompt: 'Logo depois de editar nginx.conf, qual versão o servidor continua usando?',
        options: ['A última versão carregada', 'O texto ainda incompleto do editor', 'Nenhuma configuração'],
        correctIndex: 0
      },
      takeaway: 'O arquivo editado é apenas uma proposta até que um reload bem-sucedido o transforme na configuração ativa.'
    },
    {
      id: 'edit-index',
      title: 'Faça uma mudança visível',
      explanation: 'Vamos trocar o arquivo inicial de index.html para sobre.html. O botão altera apenas o editor; repare no aviso “não recarregada”. Se fizer uma requisição agora, a versão antiga ainda responderá.',
      applyEdit: { search: 'index index.html;', replace: 'index sobre.html;', label: 'Trocar index no editor' },
      takeaway: 'O texto do arquivo mudou, mas a configuração ativa ainda não. Editar e aplicar são duas ações separadas.'
    },
    {
      id: 'test-config',
      title: 'Teste antes de aplicar',
      explanation: 'nginx -t analisa sintaxe, quantidade de argumentos e onde cada diretiva foi usada. Ele não ativa nada. Esse é o cinto de segurança antes de todo reload.',
      command: 'nginx -t',
      commandParts: [{ text: 'nginx', meaning: 'programa do servidor' }, { text: '-t', meaning: 'testa a configuração e termina' }],
      lookFor: 'As duas linhas finais devem dizer syntax is ok e test is successful.',
      takeaway: 'O teste aprovou a configuração candidata sem alterar o servidor em execução. Agora existe segurança para tentar o reload.',
      verify: commandSucceeded('test')
    },
    {
      id: 'reload-config',
      title: 'Ative sem derrubar o servidor',
      explanation: 'Com o teste verde, reload pede ao nginx que adote a nova configuração de forma controlada. Só agora a edição passa a valer.',
      command: 'nginx -s reload',
      commandParts: [{ text: '-s reload', meaning: 'envia o sinal de recarga ao processo nginx' }],
      lookFor: 'O indicador acima do editor volta de “não recarregada” para “ativa”.',
      takeaway: 'O reload promoveu a configuração testada a configuração ativa sem interromper o laboratório.',
      verify: commandSucceeded('reload')
    },
    {
      id: 'prove-reload',
      title: 'Prove que mudou',
      explanation: 'Uma boa operação termina com verificação. Faça a mesma requisição da lição anterior e confirme que o corpo agora vem de sobre.html.',
      command: 'curl -i http://localhost/',
      lookFor: 'O corpo deve dizer “nova configuração” e o palco deve mostrar /usr/share/nginx/html/sobre.html.',
      takeaway: 'A requisição final comprova a mudança do ponto de vista do usuário. Testar e recarregar não substituem essa verificação.',
      verify: requested((event) => event.response?.body === 'nova configuração')
    }
  ],
  'varios-sites': [
    {
      id: 'host-concept',
      title: 'Uma porta pode receber vários sites',
      explanation: 'Dois sites podem compartilhar o mesmo IP e a porta 80. Para saber qual deles queremos, o cliente envia o header Host — como escrever o nome do destinatário no envelope.',
      check: {
        prompt: 'Se dois sites usam o mesmo IP e a porta 80, o que diferencia o destinatário?',
        options: ['O header Host', 'O corpo da resposta', 'O tamanho do arquivo'],
        correctIndex: 0
      },
      takeaway: 'Host leva o nome do site dentro da requisição e permite ao nginx escolher um server entre vários na mesma porta.'
    },
    {
      id: 'named-host',
      title: 'Enderece a loja',
      explanation: 'O endereço da conexão continua localhost, mas -H troca o Host dentro da requisição. nginx compara esse valor com cada server_name.',
      command: 'curl -i -H "Host: loja.test" http://localhost/',
      commandParts: [{ text: '-H', meaning: 'adiciona um header HTTP' }, { text: 'Host: loja.test', meaning: 'nome do site desejado' }],
      lookFor: 'No palco, server loja.test deve ser escolhido porque corresponde ao Host.',
      takeaway: 'A conexão chegou ao mesmo endereço e porta de sempre; foi o header Host que selecionou o site loja.test.',
      verify: requested((event) => event.response?.serverId === 'loja.test')
    },
    {
      id: 'default-host',
      title: 'Veja o plano B',
      explanation: 'E se nenhum server_name combinar? nginx usa o bloco marcado default_server. Isso impede que a escolha fique ambígua.',
      command: 'curl -i -H "Host: desconhecido.test" http://localhost/',
      lookFor: 'O corpo será “site padrão”; o trace explica que não houve correspondência de nome.',
      takeaway: 'Quando nenhum server_name corresponde, default_server é a escolha previsível. Ele funciona como destino de reserva da porta.',
      verify: requested((event) => event.response?.serverId === 'padrao.test')
    },
    {
      id: 'host-summary',
      title: 'Guarde a ordem da escolha',
      explanation: 'Primeiro a porta seleciona os blocos candidatos. Depois o Host é comparado com server_name. Sem correspondência, default_server vence. É assim que um único nginx hospeda muitos domínios.',
      check: {
        prompt: 'O que acontece quando nenhum server_name corresponde ao Host?',
        options: ['A conexão sempre falha', 'default_server atende', 'O primeiro arquivo do disco atende'],
        correctIndex: 1
      },
      takeaway: 'A seleção segue porta → Host/server_name → default_server. Essa ordem torna previsível qual site responderá.'
    }
  ],
  'caminhos-e-arquivos': [
    {
      id: 'uri-path',
      title: 'URI não é caminho de disco',
      explanation: 'A pessoa pede uma URI, como /docs/guia.txt. nginx usa a configuração para transformá-la em um caminho físico. root e alias fazem essa transformação de maneiras diferentes.',
      check: {
        prompt: 'O que é /docs/guia.txt quando chega na requisição?',
        options: ['Uma URI', 'Obrigatoriamente um caminho físico', 'Um header HTTP'],
        correctIndex: 0
      },
      takeaway: 'A URI é o nome pedido pelo cliente. Só depois de aplicar root ou alias o nginx obtém um caminho no sistema de arquivos.'
    },
    {
      id: 'root-path',
      title: 'root conserva a URI inteira',
      explanation: 'Dentro de location /docs/, root /srv mantém /docs/guia.txt e coloca /srv na frente. Resultado: /srv/docs/guia.txt.',
      command: 'curl -i http://localhost/docs/guia.txt',
      lookFor: 'No passo de disco do palco, confirme /srv/docs/guia.txt.',
      takeaway: 'Com root, a URI inteira é anexada à pasta configurada: /srv + /docs/guia.txt.',
      verify: requested((event) => event.response?.filePath === '/srv/docs/guia.txt')
    },
    {
      id: 'alias-path',
      title: 'alias substitui o prefixo',
      explanation: 'alias /data/images/ troca a parte /imagens/ que correspondeu à location. Sobra logo.txt; o resultado é /data/images/logo.txt.',
      command: 'curl -i http://localhost/imagens/logo.txt',
      lookFor: 'Compare o caminho mostrado agora com o caminho produzido por root.',
      takeaway: 'Com alias, o prefixo da location é substituído: /imagens/ sai e /data/images/ entra. Por isso o resultado não contém /imagens/.',
      verify: requested((event) => event.response?.filePath === '/data/images/logo.txt')
    },
    {
      id: 'read-error-log',
      title: 'Use o erro como pista',
      explanation: 'Quando um arquivo não existe, o error.log registra exatamente qual caminho foi tentado. Isso transforma um 404 genérico em uma pista concreta para depuração.',
      command: 'curl -i http://localhost/docs/ausente.txt',
      lookFor: 'Depois, experimente tail /var/log/nginx/error.log no terminal para ver o open() failed.',
      takeaway: 'O 404 mostra o efeito para o cliente; o error.log mostra a causa operacional, inclusive o caminho exato que o nginx tentou abrir.',
      verify: gotStatus(404, '/docs/ausente.txt')
    }
  ],
  'location-vencedora': [
    {
      id: 'location-map',
      title: 'Pense em location como regras de caminho',
      explanation: 'Cada location é candidata a tratar a URI. nginx não usa simplesmente a primeira do arquivo: ele segue uma ordem específica. O palco testará cada candidata sem esconder as derrotadas.',
      check: {
        prompt: 'Como o nginx escolhe uma location?',
        options: ['Sempre usa a primeira escrita', 'Segue regras de prioridade', 'Escolhe aleatoriamente'],
        correctIndex: 1
      },
      takeaway: 'A posição no arquivo não basta para prever a vencedora: tipo de correspondência e especificidade participam da decisão.'
    },
    {
      id: 'exact-location',
      title: 'A igualdade exata encerra a disputa',
      explanation: 'O modificador = exige que a URI inteira seja igual. Se combinar, nginx para de procurar porque nenhuma regra pode ser mais específica.',
      command: 'curl -i http://localhost/health',
      commandParts: [{ text: 'location = /health', meaning: 'somente a URI /health, sem caracteres extras' }],
      lookFor: 'A location exata acende e vence imediatamente.',
      takeaway: 'location = /health é uma correspondência completa. Quando ela existe, o nginx não precisa avaliar prefixos nem expressões regulares.',
      verify: requested((event) => event.response?.location === '= /health')
    },
    {
      id: 'regex-location',
      title: 'Regex pode superar um prefixo',
      explanation: 'Sem uma exata, nginx guarda o maior prefixo e testa regex na ordem em que aparecem. .php$ significa “termina em .php”.',
      command: 'curl -i http://localhost/index.php',
      lookFor: 'location / combina, mas a regex ~ \\.php$ vence depois.',
      takeaway: 'O maior prefixo serviu como candidato temporário. Como ele não tinha ^~, a regex foi avaliada e assumiu a requisição PHP.',
      verify: requested((event) => event.response?.location?.startsWith('~ ') === true)
    },
    {
      id: 'prefix-stop',
      title: '^~ protege um prefixo das regex',
      explanation: 'Para /static/app.php, a regex também poderia combinar. Mas ^~ diz: se este for o maior prefixo, não teste regex. Isso é útil para áreas estritamente estáticas.',
      command: 'curl -i http://localhost/static/app.php',
      lookFor: 'O trace deve parar em location ^~ /static/ e devolver “estático”.',
      takeaway: '^~ transforma o maior prefixo em vencedor antes da etapa de regex. Mesmo terminando em .php, esta URI permaneceu na área estática.',
      verify: requested((event) => event.response?.location === '^~ /static/')
    }
  ],
  'spa-try-files': [
    {
      id: 'spa-problem',
      title: 'Separe arquivo de rota do aplicativo',
      explanation: 'Em uma SPA, /assets/app.js é um arquivo real. Já /dashboard é uma tela conhecida pelo JavaScript do navegador, não um arquivo chamado dashboard no servidor.',
      check: {
        prompt: 'Na SPA deste laboratório, o que é /dashboard?',
        options: ['Um arquivo físico obrigatório', 'Uma rota interpretada pelo aplicativo', 'O endereço do backend'],
        correctIndex: 1
      },
      takeaway: 'Arquivos estáticos existem no disco; rotas da SPA existem na lógica do aplicativo carregado pelo navegador.'
    },
    {
      id: 'real-asset',
      title: 'Primeiro, deixe o arquivo real vencer',
      explanation: 'try_files testa os candidatos da esquerda para a direita. $uri representa a URI recebida. Como o asset existe, a busca termina nele.',
      command: 'curl -i http://localhost/assets/app.js',
      commandParts: [{ text: '$uri', meaning: 'variável com /assets/app.js nesta requisição' }],
      lookFor: 'O primeiro candidato existe e /app/assets/app.js é servido.',
      takeaway: 'try_files parou no primeiro arquivo existente. Recursos reais não precisam passar pelo fallback da aplicação.',
      verify: requested((event) => event.response?.filePath === '/app/assets/app.js')
    },
    {
      id: 'spa-fallback',
      title: 'Agora use o fallback da SPA',
      explanation: 'Para /dashboard, nem $uri nem $uri/ existem. O último candidato, /index.html, causa uma busca interna. Esse HTML inicia o app, que então interpreta /dashboard.',
      command: 'curl -i http://localhost/dashboard',
      lookFor: 'Veja as duas tentativas falharem antes do fallback interno encontrar /app/index.html.',
      takeaway: 'A rota /dashboard não virou um arquivo. O nginx entregou index.html, e a partir daí o JavaScript da SPA assume a navegação.',
      verify: requested((event) => event.command.includes('/dashboard') && event.response?.filePath === '/app/index.html')
    },
    {
      id: 'spa-boundary',
      title: 'Entenda o limite',
      explanation: 'nginx não sabe quais telas existem no React. Ele apenas devolve index.html. Depois disso, o roteador da SPA decide se /dashboard é uma rota válida.',
      check: {
        prompt: 'Quem decide se /dashboard é uma tela válida depois que index.html chega?',
        options: ['O roteador da SPA', 'A diretiva listen', 'O sistema de arquivos'],
        correctIndex: 0
      },
      takeaway: 'O nginx garante a entrega do ponto de entrada; a aplicação no navegador é responsável por reconhecer suas próprias rotas.'
    }
  ],
  redirecionar: [
    {
      id: 'redirect-concept',
      title: 'Redirecionar é responder, não transportar',
      explanation: 'nginx não busca a nova página nesta requisição. Ele responde “procure em outro endereço”. O cliente lê o status 3xx e o header Location e decide fazer uma segunda requisição.',
      check: {
        prompt: 'Quem inicia a requisição para o novo endereço indicado por Location?',
        options: ['O cliente', 'O arquivo nginx.conf', 'O sistema de arquivos'],
        correctIndex: 0
      },
      takeaway: 'O servidor apenas devolve a instrução de redirecionamento; o cliente decide segui-la em uma nova requisição.'
    },
    {
      id: 'verbose-redirect',
      title: 'Veja os dois lados da conversa',
      explanation: 'curl -v mostra linhas com > para o pedido enviado e < para a resposta recebida. Isso deixa claro que o redirect veio do servidor.',
      command: 'curl -v http://localhost/antiga',
      commandParts: [{ text: '-v', meaning: 'modo verbose: mostra pedido e resposta' }, { text: '301', meaning: 'mudança permanente' }],
      lookFor: 'Encontre HTTP/1.1 301 e Location: https://localhost/antiga.',
      takeaway: 'O 301 não contém a página nova: ele contém uma instrução no header Location. Cabe ao cliente iniciar outra requisição para HTTPS.',
      verify: requested((event) => event.response?.status === 301 && Boolean(event.response.headers.Location))
    },
    {
      id: 'redirect-rule',
      title: 'Leia a regra que produziu o Location',
      explanation: 'return 301 encerra o processamento. $host vira localhost e $request_uri preserva /antiga. Em produção, essa regra é comum para levar HTTP a HTTPS.',
      check: {
        prompt: 'Qual variável preserva o caminho /antiga no novo endereço?',
        options: ['$host', '$request_uri', '$remote_addr'],
        correctIndex: 1
      },
      takeaway: '$host preserva o nome do site e $request_uri preserva o caminho pedido, formando o destino HTTPS completo.'
    }
  ],
  'proxy-reverso': [
    {
      id: 'proxy-concept',
      title: 'Há dois saltos, não um',
      explanation: 'O cliente conversa com nginx. nginx então vira cliente do backend app. A resposta volta pelo caminho inverso. O visitante não precisa conhecer o endereço interno da aplicação.',
      check: {
        prompt: 'Quem abre a conexão com o backend interno?',
        options: ['O navegador diretamente', 'O nginx', 'O DNS público'],
        correctIndex: 1
      },
      takeaway: 'No segundo salto, nginx atua como cliente do backend. Para o visitante, o único endereço público continua sendo o do nginx.'
    },
    {
      id: 'proxy-request',
      title: 'Envie uma requisição pela porta pública',
      explanation: 'A location /api/ captura a URI. proxy_pass decide o destino. Como termina em /v1/, essa parte substitui o prefixo /api/.',
      command: 'curl -i http://localhost/api/users',
      commandParts: [{ text: '/api/users', meaning: 'URI vista pelo nginx' }, { text: '/v1/users', meaning: 'URI que o backend receberá' }],
      lookFor: 'No palco, siga nginx → backend app. O corpo JSON confirma path /v1/users.',
      takeaway: 'O cliente falou apenas com nginx. Internamente, proxy_pass substituiu /api/ por /v1/ e criou uma segunda conversa com o backend.',
      verify: requested((event) => event.response?.backend === 'app' && event.response.body.includes('/v1/users'))
    },
    {
      id: 'forwarded-headers',
      title: 'Preserve o contexto original',
      explanation: 'proxy_set_header Host informa qual site o cliente pediu. X-Forwarded-For carrega o IP original, pois para o backend a conexão veio do nginx. Esses headers permitem logs e regras corretas na aplicação.',
      check: {
        prompt: 'Qual header ajuda o backend a conhecer o IP original do cliente?',
        options: ['Content-Type', 'X-Forwarded-For', 'Location'],
        correctIndex: 1
      },
      takeaway: 'Sem X-Forwarded-For, o backend enxerga apenas o proxy como origem. O header conserva contexto útil para logs e segurança.'
    },
    {
      id: 'slash-rule',
      title: 'A barra final muda a URI',
      explanation: 'proxy_pass http://app/v1/ possui uma URI e substitui /api/. Já proxy_pass http://app, sem parte de URI, repassaria /api/users inteiro. Essa pequena barra é uma fonte clássica de bugs.',
      check: {
        prompt: 'Neste exemplo, qual caminho chega ao backend com proxy_pass http://app/v1/?',
        options: ['/api/users', '/v1/users', '/users/v1'],
        correctIndex: 1
      },
      takeaway: 'Como proxy_pass inclui /v1/, essa URI substitui o prefixo /api/ que correspondeu à location.'
    }
  ],
  'mais-de-um-backend': [
    {
      id: 'pool-concept',
      title: 'Um nome representa várias máquinas',
      explanation: 'upstream api agrupa três peers. proxy_pass usa o nome do grupo, e nginx escolhe um peer saudável para cada requisição. Assim a URL pública não muda quando a infraestrutura cresce.',
      check: {
        prompt: 'O que o nome upstream api representa?',
        options: ['Um único arquivo', 'Um grupo de backends', 'Um status HTTP'],
        correctIndex: 1
      },
      takeaway: 'O upstream cria um nome estável para um conjunto variável de backends e concentra a política de distribuição.'
    },
    {
      id: 'weighted-a',
      title: 'Observe o peso',
      explanation: 'api-a tem weight=2, então aparece duas vezes no ciclo de distribuição. Faça a primeira requisição e anote qual backend respondeu.',
      command: 'curl -i http://localhost/',
      lookFor: 'O palco deve encaminhar para api-a:80.',
      takeaway: 'A primeira vaga do ciclo pertence a api-a. O peso 2 significa que esse peer aparece duas vezes na distribuição.',
      verify: requested((event) => event.response?.backend === 'api-a:80')
    },
    {
      id: 'second-slot',
      title: 'O peso mantém api-a por mais um turno',
      explanation: 'Uma segunda vaga do ciclo também pertence a api-a. Isso não significa afinidade com o usuário; é apenas a proporção configurada.',
      command: 'curl -i http://localhost/',
      lookFor: 'Compare o backend com a primeira requisição.',
      takeaway: 'api-a respondeu novamente porque ainda estávamos na segunda vaga determinada por weight=2 — não porque o cliente ficou preso a ele.',
      verify: (events) => events.filter((event) => event.response?.backend === 'api-a:80').length >= 2
    },
    {
      id: 'skip-failed',
      title: 'Pule o peer indisponível',
      explanation: 'api-b está fora do ar. No próximo avanço do round-robin, nginx não consegue usá-lo e tenta um peer saudável. O visitante recebe resposta de api-c em vez de um erro.',
      command: 'curl -i http://localhost/',
      lookFor: 'O backend escolhido deve ser api-c:80; api-b não responde.',
      takeaway: 'O ciclo alcançou api-b, detectou que ele não estava disponível e continuou para api-c. O pool protegeu o cliente da falha de um peer.',
      verify: requested((event) => event.response?.backend === 'api-c:80')
    }
  ],
  'cache-e-limites': [
    {
      id: 'protect-backend',
      title: 'Resolva dois problemas diferentes',
      explanation: 'Cache reduz trabalho repetido: uma resposta pronta evita chamar o backend. Limite de requisições controla quantas tentativas uma origem pode fazer em pouco tempo. Um melhora desempenho; o outro protege capacidade.',
      check: {
        prompt: 'Qual recurso impede uma rajada excessiva antes de ela alcançar o backend?',
        options: ['proxy_cache', 'limit_req', 'server_name'],
        correctIndex: 1
      },
      takeaway: 'Cache elimina trabalho repetido; limit_req controla pressão de entrada. Eles se complementam, mas resolvem problemas diferentes.'
    },
    {
      id: 'cache-miss',
      title: 'A primeira resposta ainda não está guardada',
      explanation: 'Na primeira requisição, a chave não existe no cache. nginx chama catalog, devolve a resposta e guarda uma cópia. Isso é um MISS esperado, não um erro.',
      command: 'curl -i http://localhost/',
      lookFor: 'Encontre X-Cache-Status: MISS e o passo que chama o backend catalog.',
      takeaway: 'MISS significa que ainda não havia cópia armazenada. O nginx chamou catalog e guardou a resposta para uma próxima requisição igual.',
      verify: requested((event) => event.response?.headers['X-Cache-Status'] === 'MISS')
    },
    {
      id: 'cache-hit',
      title: 'A segunda resposta vem do cache',
      explanation: 'A mesma chave agora tem uma resposta pronta. nginx responde sem pedir novo trabalho ao backend.',
      command: 'curl -i http://localhost/',
      lookFor: 'X-Cache-Status muda para HIT; no palco, o backend não é chamado.',
      takeaway: 'HIT confirma que a resposta veio do cache. O mesmo resultado chegou ao cliente sem gerar novo trabalho para catalog.',
      verify: requested((event) => event.response?.headers['X-Cache-Status'] === 'HIT')
    },
    {
      id: 'rate-limit',
      title: 'Exceda a pequena rajada permitida',
      explanation: 'A regra aceita a taxa normal mais burst=1. Uma terceira requisição imediata passa desse espaço e é recusada antes de alcançar catalog. limit_req_status configurou 429 no lugar do 503 padrão.',
      command: 'curl -i http://localhost/',
      lookFor: 'A resposta deve ser 429 Too Many Requests e o trace deve dizer que o limite foi excedido.',
      takeaway: 'O limite bloqueou a rajada antes do backend. O 429 comunica ao cliente que ele enviou requisições demais em pouco tempo.',
      verify: gotStatus(429)
    }
  ]
}

export const lessons: Lesson[] = lessonDefinitions.map((lesson) => ({
  ...lesson,
  steps: guides[lesson.id] ?? []
}))

export function lessonById(id: string) {
  return lessons.find((lesson) => lesson.id === id) ?? lessons[0]!
}

export type { Lesson, LessonEvent, LessonStep } from './types'
