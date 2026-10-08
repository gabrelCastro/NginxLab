import { expect, test, type Page } from '@playwright/test'
import { FakeApi } from './fakeApi'

const chapter = 'servidor-de-arquivos'

// Um 409 é parte do contrato; o Chromium o registra como erro de recurso, e só ele é tolerado por padrão.
async function open(page: Page, expected = /status of 409/) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !expected.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  return () => expect(errors, 'browser console errors').toEqual([])
}

const status = (page: Page) => page.locator('.sync-menu summary')

async function openSyncMenu(page: Page) {
  if (await page.locator('.sync-menu').getAttribute('open') === null) await status(page).click()
}
const editor = (page: Page) => page.getByLabel('Editor do nginx.conf')

async function editIndex(page: Page, from: RegExp, to: string) {
  await editor(page).fill((await editor(page).inputValue()).replace(from, `index ${to};`))
}

async function syncedWith(page: Page, api: FakeApi, file: string) {
  await editIndex(page, /index [\w.-]+;/, file)
  await expect.poll(() => String(api.row('CHAPTER', chapter)?.payload.draftSource)).toContain(`index ${file};`)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
}

test('imports existing local progress once, after the server becomes reachable', async ({ page }) => {
  const api = new FakeApi()
  api.mode = 'static-html'
  await api.install(page)
  const assertNoErrors = await open(page)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Offline')
  await editIndex(page, /index index\.html;/, 'local.html')
  await status(page).click()
  await expect(page.getByText(/1 checkpoint aguardando envio/)).toBeVisible()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Offline')

  api.mode = 'up'
  await page.getByRole('button', { name: 'Tentar agora' }).click()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  expect(api.log).toEqual(['POST /guests', `PUT CHAPTER/${chapter}@0`])
  expect(api.row('CHAPTER', chapter)?.payload.draftSource).toContain('index local.html;')

  await page.reload()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await expect(editor(page)).toHaveValue(/index local\.html;/)
  expect(api.log.slice(2)).toEqual(['GET /checkpoints'])
  assertNoErrors()
})

test('restores a newer server checkpoint when the page opens', async ({ page }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertNoErrors = await open(page)
  await syncedWith(page, api, 'primeira.html')
  api.writeElsewhere('CHAPTER', chapter, (payload) => ({ ...payload, draftSource: String(payload.draftSource).replace('index primeira.html;', 'index outra-aba.html;') }))

  await page.reload()
  await expect(editor(page)).toHaveValue(/index outra-aba\.html;/)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await status(page).click()
  await expect(page.getByText('1 checkpoint restaurado do servidor nesta sessão.')).toBeVisible()
  expect(api.row('CHAPTER', chapter)?.revision).toBe(2)
  assertNoErrors()
})

test('keeps working offline and sends the queue when the connection returns', async ({ page, context }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertNoErrors = await open(page)
  await syncedWith(page, api, 'online.html')

  await context.setOffline(true)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Offline')
  await editIndex(page, /index online\.html;/, 'offline.html')
  const terminal = page.getByLabel('Comando do terminal')
  await terminal.fill('nginx -t')
  await terminal.press('Enter')
  await expect(page.getByText(/test is successful/)).toBeVisible()
  await status(page).click()
  await expect(page.getByText(/1 checkpoint aguardando envio/)).toBeVisible()
  expect(api.row('CHAPTER', chapter)?.payload.draftSource).toContain('index online.html;')

  await context.setOffline(false)
  await expect.poll(() => String(api.row('CHAPTER', chapter)?.payload.draftSource)).toContain('index offline.html;')
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  expect(api.row('CHAPTER', chapter)?.payload.commandHistory).toEqual(['nginx -t'])
  assertNoErrors()
})

test('shows both versions on a conflict and applies the server copy only when chosen', async ({ page }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertNoErrors = await open(page)
  await syncedWith(page, api, 'base.html')
  api.writeElsewhere('CHAPTER', chapter, (payload) => ({ ...payload, draftSource: String(payload.draftSource).replace('index base.html;', 'index servidor.html;') }))
  await editIndex(page, /index base\.html;/, 'local.html')

  const alert = page.getByRole('alert').filter({ hasText: 'Há duas versões' })
  await expect(alert).toBeVisible()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Conflito de versões')
  await expect(editor(page)).toHaveValue(/index local\.html;/)
  expect(api.row('CHAPTER', chapter)?.payload.draftSource).toContain('index servidor.html;')

  await page.getByRole('button', { name: 'Comparar e escolher' }).click()
  await expect(page.getByRole('heading', { name: 'Neste navegador' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /No servidor/ })).toBeVisible()
  await page.getByRole('button', { name: 'Usar a versão do servidor' }).click()
  await expect(editor(page)).toHaveValue(/index servidor\.html;/)
  await expect(alert).not.toBeVisible()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  expect(api.row('CHAPTER', chapter)?.revision).toBe(2)
  await status(page).click()
  await expect(page.getByRole('button', { name: 'Baixar cópias preservadas (1)' })).toBeVisible()

  // A escolha sobrevive a um recarregamento.
  await page.reload()
  await expect(editor(page)).toHaveValue(/index servidor\.html;/)
  await expect(alert).not.toBeVisible()
  assertNoErrors()
})

test('keeps this browser version on a conflict without silently overwriting', async ({ page }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertNoErrors = await open(page)
  await syncedWith(page, api, 'base.html')
  api.writeElsewhere('CHAPTER', chapter, (payload) => ({ ...payload, draftSource: String(payload.draftSource).replace('index base.html;', 'index servidor.html;') }))
  await editIndex(page, /index base\.html;/, 'local.html')
  await expect(page.getByRole('alert').filter({ hasText: 'Há duas versões' })).toBeVisible()

  // Conflito pendente sobrevive ao recarregamento e continua sem envio.
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'Há duas versões' })).toBeVisible()
  await expect(editor(page)).toHaveValue(/index local\.html;/)
  expect(api.row('CHAPTER', chapter)?.revision).toBe(2)

  await page.getByRole('button', { name: 'Comparar e escolher' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar as duas versões (JSON)' }).click()
  expect((await download).suggestedFilename()).toBe(`nginxlearn-conflito-${chapter}.json`)
  await page.getByRole('button', { name: 'Manter a versão deste navegador' }).click()
  await expect.poll(() => api.row('CHAPTER', chapter)?.revision).toBe(3)
  expect(api.row('CHAPTER', chapter)?.payload.draftSource).toContain('index local.html;')
  expect(api.log).toContain(`PUT CHAPTER/${chapter}@2`)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  assertNoErrors()
})

test('keeps two open tabs coherent and creates a single guest', async ({ context }) => {
  const api = new FakeApi()
  const first = await context.newPage()
  const second = await context.newPage()
  await api.install(first)
  await api.install(second)
  const assertFirst = await open(first)
  const assertSecond = await open(second)
  await expect(status(first)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await expect(status(second)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  expect(api.log.filter((entry) => entry === 'POST /guests')).toHaveLength(1)

  // Capítulos diferentes em cada aba: nenhuma apaga o progresso da outra.
  await second.locator('.campaign-menu summary').click()
  await second.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja ganha um endereço/ }).click()
  await editIndex(first, /index index\.html;/, 'aba-um.html')
  await second.getByRole('button', { name: 'Apenas salvar o arquivo' }).click()
  await expect.poll(() => String(api.row('CHAPTER', chapter)?.payload.draftSource)).toContain('index aba-um.html;')
  await first.reload()
  await first.locator('.campaign-menu summary').click()
  await first.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja abre as portas/ }).click()
  await expect(editor(first)).toHaveValue(/index aba-um\.html;/)
  await first.locator('.campaign-menu summary').click()
  await first.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja ganha um endereço/ }).click()
  await expect(first.getByText('O arquivo foi salvo, mas o nginx ainda usa a configuração ativa.')).toBeVisible()
  await first.locator('.campaign-menu summary').click()
  await first.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja abre as portas/ }).click()

  // Mesmo capítulo nas duas abas: a outra aba mostra a versão mais recente e avisa.
  await second.locator('.campaign-menu summary').click()
  await second.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja abre as portas/ }).click()
  await expect(editor(second)).toHaveValue(/index aba-um\.html;/)
  await editIndex(second, /index aba-um\.html;/, 'aba-dois.html')
  await expect(editor(first)).toHaveValue(/index aba-dois\.html;/)
  await expect(first.getByText('Este capítulo foi alterado em outra aba aberta.', { exact: false })).toBeVisible()
  await expect.poll(() => String(api.row('CHAPTER', chapter)?.payload.draftSource)).toContain('index aba-dois.html;')
  await expect(status(first)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await expect(status(second)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await expect(first.getByRole('alert').filter({ hasText: 'Há duas versões' })).toHaveCount(0)
  assertFirst()
  assertSecond()
})

async function solveCatalog(page: Page) {
  await page.getByRole('button', { name: 'Missão: imagens da loja' }).click()
  await page.getByRole('button', { name: 'Abrir a loja' }).click()
  await page.getByRole('button', { name: '/data/catalogo/imagens/caneca.svg' }).click()
  await page.getByRole('button', { name: 'Entendi a evidência' }).click()
  await editor(page).fill((await editor(page).inputValue()).replace('root /data/catalogo;', 'alias /data/catalogo/;'))
  await page.getByRole('button', { name: 'Recarregar nginx' }).click()
  await page.getByRole('button', { name: 'Abrir ou atualizar a loja' }).click()
  await page.getByRole('button', { name: 'Validar solução' }).click()
  await expect(page.getByRole('heading', { name: 'Você restaurou a imagem' })).toBeVisible()
}

test('verifies a mission solution on the server, even after solving it offline', async ({ page, context }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertNoErrors = await open(page)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await context.setOffline(true)
  await solveCatalog(page)
  await expect(page.getByText('Aguardando verificação do servidor', { exact: false })).toBeVisible()
  expect(api.attempts).toHaveLength(0)
  await context.setOffline(false)
  await expect(page.getByText('Verificado pelo servidor', { exact: false })).toBeVisible()
  expect(api.attempts).toMatchObject([{ missionId: 'catalog', status: 'VERIFIED' }])
  assertNoErrors()
})

test('shows when the server does not confirm a solution the browser accepted', async ({ page }) => {
  const api = new FakeApi()
  api.rejectAll = true
  await api.install(page)
  const assertNoErrors = await open(page)
  await solveCatalog(page)
  await expect(page.getByText('O servidor não confirmou esta solução: A configuração reexecutada não entregou a imagem esperada.')).toBeVisible()
  assertNoErrors()
})

test('protects progress with an account and continues in another browser', async ({ page, browser }) => {
  const api = new FakeApi()
  await api.install(page)
  const assertHome = await open(page)
  await syncedWith(page, api, 'casa.html')
  await status(page).click()
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('E-mail').fill('aluna@exemplo.test')
  await page.getByLabel('Senha').fill('curta')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByLabel('Senha')).toBeVisible()
  await page.getByLabel('Senha').fill('senha-bem-longa')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByText('Conta:')).toBeVisible()
  await expect(page.getByText('aluna@exemplo.test')).toBeVisible()
  assertHome()

  // Outro navegador, com progresso próprio em outro capítulo.
  const school = await browser.newContext()
  const other = await school.newPage()
  await api.install(other)
  // A senha errada responde 401 de propósito.
  const assertSchool = await open(other, /status of (409|401)/)
  await other.locator('.campaign-menu summary').click()
  await other.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja ganha um endereço/ }).click()
  await other.getByRole('button', { name: 'Apenas salvar o arquivo' }).click()
  await expect(status(other)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await status(other).click()
  await other.getByRole('button', { name: 'Entrar' }).click()
  await other.getByLabel('E-mail').fill('aluna@exemplo.test')
  await other.getByLabel('Senha').fill('senha-errada-1')
  await other.locator('.account-form').getByRole('button', { name: 'Entrar' }).click()
  await expect(other.getByText('E-mail ou senha incorretos.')).toBeVisible()
  await other.getByLabel('Senha').fill('senha-bem-longa')
  await other.locator('.account-form').getByRole('button', { name: 'Entrar' }).click()
  await expect(other.getByText('Conta:')).toBeVisible()
  await expect(status(other)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')

  // O capítulo 1 vem da conta; o capítulo 3 da escola passa a fazer parte dela.
  await expect.poll(() => api.row('CHAPTER', 'varios-sites', 'aluna@exemplo.test')?.revision).toBe(1)
  await other.locator('.campaign-menu summary').click()
  await other.getByRole('navigation', { name: 'Capítulos da loja' }).getByRole('button', { name: /A loja abre as portas/ }).click()
  await expect(editor(other)).toHaveValue(/index casa\.html;/)

  // Sair apagando este navegador: o progresso fica só na conta.
  await openSyncMenu(other)
  await other.getByRole('button', { name: 'Sair neste navegador' }).click()
  await other.getByRole('button', { name: 'Sair e apagar o progresso deste navegador' }).click()
  await expect(other.getByRole('heading', { name: '1. Um servidor que entrega arquivos' })).toBeVisible()
  await expect(editor(other)).not.toHaveValue(/casa\.html/)
  await expect(status(other)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  expect(api.log).toContain('DELETE /sessions/current')
  expect(api.row('CHAPTER', chapter, 'aluna@exemplo.test')?.payload.draftSource).toContain('index casa.html;')
  assertSchool()
  await school.close()
})
