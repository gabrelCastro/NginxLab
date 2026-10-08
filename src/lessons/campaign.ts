import type { Lesson } from './types'

export interface RecallQuestion {
  prompt: string
  options: [string, string, string]
  correctIndex: number
  feedback: [string, string, string]
}

export interface ChapterStory {
  title: string
  situation: string
  goal: string
  outcome: string
  recall?: RecallQuestion
}

export const campaign: Record<Lesson['id'], ChapterStory> = {
  'servidor-de-arquivos': {
    title: 'A loja abre as portas',
    situation: 'A Verde & Co. precisa publicar sua primeira página. Você assume a configuração do servidor e confere o que o visitante recebe.',
    goal: 'Entregar a página inicial e reconhecer a diferença entre uma resposta 200 e uma 404.',
    outcome: 'A primeira vitrine está no ar. O próximo passo é publicar mudanças com segurança.'
  },
  'teste-e-reload': {
    title: 'Uma mudança que precisa entrar no ar',
    situation: 'A equipe atualizou a vitrine, mas os visitantes ainda veem o conteúdo anterior. A configuração em edição e a configuração ativa podem ser diferentes.',
    goal: 'Testar, recarregar e verificar a mudança do ponto de vista do visitante.',
    outcome: 'A loja agora tem um processo seguro de publicação.',
    recall: {
      prompt: 'Se a página inicial responde 200, o que isso prova?',
      options: ['Que o arquivo pedido foi encontrado', 'Que toda mudança no editor já está ativa', 'Que nunca haverá uma resposta 404'],
      correctIndex: 0,
      feedback: ['Isso mesmo: a requisição terminou com um recurso encontrado.', 'A resposta pode ter vindo da configuração anterior; editar não aplica a mudança.', '200 descreve uma requisição específica. Outro caminho ainda pode não existir.']
    }
  },
  'varios-sites': {
    title: 'A loja ganha um endereço',
    situation: 'O mesmo nginx atende mais de um site. A equipe quer que loja.test chegue à vitrine sem mudar a porta pública.',
    goal: 'Identificar como Host e server_name selecionam o site e como funciona o destino padrão.',
    outcome: 'A loja pode dividir a mesma infraestrutura com outros sites.',
    recall: {
      prompt: 'Você editou o arquivo nginx.conf. Qual ação faz a mudança responder a novas requisições?',
      options: ['Apenas salvar o arquivo', 'Executar um reload bem-sucedido', 'Fazer curl antes de testar'],
      correctIndex: 1,
      feedback: ['O arquivo foi salvo, mas o nginx ainda usa a configuração ativa.', 'Correto: o reload promove a configuração válida à versão ativa.', 'curl observa o servidor; não aplica a configuração editada.']
    }
  },
  'caminhos-e-arquivos': {
    title: 'O catálogo perde as imagens',
    situation: 'Documentos e imagens da loja moram em pastas diferentes. Uma URI pública precisa ser traduzida para o arquivo correto.',
    goal: 'Comparar root e alias, consultar o caminho tentado e reparar um 404.',
    outcome: 'Você sabe investigar recursos ausentes. Depois da aula, a missão das imagens aplica isso a uma loja visível.',
    recall: {
      prompt: 'Dois sites escutam a porta 80. Qual dado da requisição ajuda a escolher o bloco server?',
      options: ['O header Host', 'O tamanho do arquivo', 'O status da resposta'],
      correctIndex: 0,
      feedback: ['Correto: o Host é comparado com server_name.', 'O tamanho só é conhecido depois de localizar o conteúdo.', 'O status é produzido depois que o servidor foi escolhido.']
    }
  },
  'location-vencedora': {
    title: 'Rotas diferentes, regras diferentes',
    situation: 'A loja tem páginas, recursos estáticos e uma área antiga em PHP. Uma requisição pode combinar com várias locations.',
    goal: 'Prever a regra vencedora, incluindo correspondência exata, prefixo protegido e regex.',
    outcome: 'Você consegue explicar por que uma rota entrou na regra certa.',
    recall: {
      prompt: 'Se /imagens/caneca.svg responde 404, qual evidência ajuda a achar o erro?',
      options: ['A cor do navegador', 'O caminho tentado no trace ou error.log', 'A ordem dos headers da resposta'],
      correctIndex: 1,
      feedback: ['A aparência mostra o sintoma, mas não o caminho procurado.', 'Correto: compare o caminho tentado com o arquivo que existe.', 'A ordem dos headers não revela o mapeamento no disco.']
    }
  },
  'spa-try-files': {
    title: 'A vitrine vira uma aplicação',
    situation: 'A equipe adicionou uma rota /dashboard. Ela funciona dentro da aplicação, mas ao atualizar a página o servidor procura um arquivo chamado dashboard.',
    goal: 'Servir arquivos reais e entregar index.html para rotas da aplicação.',
    outcome: 'O navegador pode abrir rotas internas diretamente sem perder os recursos estáticos.',
    recall: {
      prompt: 'Se /static/app.php combinar com uma location ^~ /static/, o que acontece?',
      options: ['A regex .php sempre vence', 'O maior prefixo ^~ impede a busca por regex', 'O arquivo é enviado sem selecionar location'],
      correctIndex: 1,
      feedback: ['^~ protege o maior prefixo da etapa de regex.', 'Correto: a busca termina no prefixo protegido.', 'A seleção de location acontece antes da busca pelo arquivo.']
    }
  },
  redirecionar: {
    title: 'Endereços antigos ainda chegam',
    situation: 'Clientes têm links antigos da loja. O servidor precisa informar o endereço novo para que o próprio cliente faça outra requisição.',
    goal: 'Inspecionar o status 301 e o header Location.',
    outcome: 'A mudança de endereço preserva o caminho de quem chega pelos links antigos.',
    recall: {
      prompt: 'Quem decide se /dashboard é uma rota válida depois de receber index.html?',
      options: ['O roteador da aplicação no navegador', 'A diretiva listen', 'O error.log'],
      correctIndex: 0,
      feedback: ['Correto: o nginx entrega o ponto de entrada; o aplicativo reconhece suas rotas.', 'listen define onde o servidor recebe conexões.', 'O log registra eventos, mas não roteia a aplicação.']
    }
  },
  'proxy-reverso': {
    title: 'O catálogo passa a consultar uma API',
    situation: 'A vitrine precisa buscar dados de outro processo. O nginx recebe a requisição pública e conversa com a aplicação interna.',
    goal: 'Ver a URI encaminhada e os headers que chegam ao backend.',
    outcome: 'A API responde pela mesma entrada pública da loja.',
    recall: {
      prompt: 'Em um redirecionamento 301, quem faz a requisição ao novo endereço?',
      options: ['O cliente', 'O disco virtual', 'O upstream antes de responder'],
      correctIndex: 0,
      feedback: ['Correto: o cliente lê Location e inicia uma nova requisição.', 'O disco não executa requisições HTTP.', 'Um 301 não exige contato com um upstream.']
    }
  },
  'mais-de-um-backend': {
    title: 'A loja cresce além de uma instância',
    situation: 'Uma única aplicação já não basta. Há várias instâncias da API, e uma delas pode ficar indisponível.',
    goal: 'Acompanhar o balanceamento e a escolha de um peer saudável.',
    outcome: 'A loja mantém um destino público estável enquanto distribui o trabalho.',
    recall: {
      prompt: 'Com proxy_pass http://app/v1/ dentro de location /api/, que URI chega ao backend para /api/users?',
      options: ['/api/users', '/v1/users', '/users/v1'],
      correctIndex: 1,
      feedback: ['O prefixo correspondente é substituído porque proxy_pass contém uma URI.', 'Correto: /api/ é substituído por /v1/.', 'O nginx não acrescenta /v1/ ao final do caminho.']
    }
  },
  'cache-e-limites': {
    title: 'Chegou o dia da promoção',
    situation: 'Muitas pessoas consultam o catálogo ao mesmo tempo. A equipe precisa reduzir trabalho repetido e conter rajadas excessivas.',
    goal: 'Distinguir MISS, HIT e requisições bloqueadas pelo limite.',
    outcome: 'A infraestrutura está pronta para atender o pico com sinais claros de cache e proteção.',
    recall: {
      prompt: 'Se uma instância do upstream está fora do ar, o que você deve procurar no trace?',
      options: ['Qual peer saudável respondeu', 'O nome do arquivo index.html', 'O header Location de um 301'],
      correctIndex: 0,
      feedback: ['Correto: o trace mostra o backend escolhido depois da falha.', 'index.html pertence à entrega de arquivos, não à escolha do peer.', 'Location é relevante para redirecionamentos.']
    }
  }
}
