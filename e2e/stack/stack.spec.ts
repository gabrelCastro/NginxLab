import { expect, test, type Page } from '@playwright/test'

// Roda contra a stack real (deploy/compose.yaml): nginx, API Java e PostgreSQL.
// npm run e2e:stack  (com NGINXLEARN_STACK_URL apontando para o serviço web)
test.skip(!process.env.NGINXLEARN_STACK_URL, 'defina NGINXLEARN_STACK_URL para testar a stack real')

const status = (page: Page) => page.locator('.sync-menu summary')
const editor = (page: Page) => page.getByLabel('Editor do nginx.conf')

async function open(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/status of 401/.test(message.text())) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  return () => expect(errors, 'browser console errors').toEqual([])
}

test('syncs, verifies a mission in Java and restores it in another browser', async ({ page, browser }) => {
  const assertNoErrors = await open(page)
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  const headers = (await page.request.get('/')).headers()
  expect(headers['content-security-policy']).toContain("script-src 'self'")
  expect((await page.request.get('/actuator/prometheus')).status()).toBe(404)

  await page.getByRole('button', { name: 'Missão: imagens da loja' }).click()
  await page.getByRole('button', { name: 'Abrir a loja' }).click()
  await page.getByRole('button', { name: '/data/catalogo/imagens/caneca.svg' }).click()
  await page.getByRole('button', { name: 'Entendi a evidência' }).click()
  await editor(page).fill((await editor(page).inputValue()).replace('root /data/catalogo;', 'alias /data/catalogo/;'))
  await page.getByRole('button', { name: 'Recarregar nginx' }).click()
  await page.getByRole('button', { name: 'Abrir ou atualizar a loja' }).click()
  await page.getByRole('button', { name: 'Validar solução' }).click()
  await expect(page.getByText('Verificado pelo servidor', { exact: false })).toBeVisible()
  await expect(status(page)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')

  const email = `aluna-${Date.now()}@exemplo.test`
  await status(page).click()
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-bem-longa')
  await page.locator('.account-form').getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByText(email)).toBeVisible()
  assertNoErrors()

  const elsewhere = await browser.newContext()
  const other = await elsewhere.newPage()
  const assertOther = await open(other)
  await expect(status(other)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await status(other).click()
  await other.getByRole('button', { name: 'Entrar' }).click()
  await other.getByLabel('E-mail').fill(email)
  await other.getByLabel('Senha').fill('senha-bem-longa')
  await other.locator('.account-form').getByRole('button', { name: 'Entrar' }).click()
  await expect(other.getByText(email)).toBeVisible()
  await expect(status(other)).toHaveAttribute('aria-label', 'Progresso: Sincronizado')
  await other.getByRole('button', { name: 'Missão: imagens da loja' }).click()
  await expect(other.getByRole('heading', { name: 'Você restaurou a imagem' })).toBeVisible()
  await expect(other.getByText('Verificado pelo servidor', { exact: false })).toBeVisible()
  assertOther()
  await elsewhere.close()
})
