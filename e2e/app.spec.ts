import { expect, test, type Page } from '@playwright/test'

async function openWithoutConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  return () => expect(errors, 'browser console errors').toEqual([])
}

async function answerAndContinue(page: Page, answer: string) {
  await page.getByRole('button', { name: new RegExp(answer) }).click()
  await expect(page.getByText('Compreensão confirmada')).toBeVisible()
  await page.getByRole('button', { name: /Entendi o resultado/ }).click()
}

test('opens the workspace and copies the command when its guided step arrives', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5180' })
  const assertNoErrors = await openWithoutConsoleErrors(page)
  await expect(page.getByRole('link', { name: /NginxLearn/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'nginx.conf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terminal' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Caminho da requisição' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1. Um servidor que entrega arquivos' })).toBeVisible()
  await expect(page.getByText('Siga o passo a passo à direita')).toBeVisible()
  await answerAndContinue(page, 'No palco central')
  await answerAndContinue(page, 'root')
  await expect(page.getByText('curl -i http://localhost/', { exact: true })).toHaveCSS('user-select', 'text')
  await page.getByLabel('Copiar comando do passo 3').click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('curl -i http://localhost/')
  assertNoErrors()
})

test('guides a beginner before completing the first lesson', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5180' })
  const assertNoErrors = await openWithoutConsoleErrors(page)
  const terminal = page.getByLabel('Comando do terminal')

  // A command entered too early is useful feedback, but it does not skip the lesson.
  await terminal.fill('curl -i http://localhost/')
  await terminal.press('Enter')
  await expect(page.getByText('HTTP/1.1 200 OK')).toBeVisible()
  await expect(page.getByText('Lição concluída')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conheça a bancada' })).toBeVisible()

  await page.getByRole('button', { name: /No editor/ }).click()
  await expect(page.getByText(/Ainda não/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conheça a bancada' })).toBeVisible()
  await answerAndContinue(page, 'No palco central')
  await expect(page.getByRole('heading', { name: 'Leia a configuração como uma frase' })).toBeVisible()
  await answerAndContinue(page, 'root')
  await expect(page.getByRole('heading', { name: 'Faça sua primeira requisição' })).toBeVisible()
  await page.getByRole('button', { name: 'Executar e observar' }).click()
  await expect(page.getByText('Evidência encontrada')).toBeVisible()
  await expect(page.getByText(/O nginx recebeu a URI/)).toBeVisible()
  await page.getByRole('button', { name: /Entendi o resultado/ }).click()
  await expect(page.getByRole('heading', { name: 'Entenda o que voltou' })).toBeVisible()
  await answerAndContinue(page, 'No corpo da resposta')
  await expect(page.getByRole('heading', { name: 'Compare com um arquivo ausente' })).toBeVisible()
  await page.getByRole('button', { name: 'Executar e observar' }).click()
  await expect(page.getByText('HTTP/1.1 404 Not Found')).toBeVisible()
  await expect(page.getByText(/O servidor estava acessível/)).toBeVisible()
  await page.getByRole('button', { name: /Entendi o resultado/ }).click()
  await expect(page.getByText('Lição concluída')).toBeVisible()
  await expect(page.getByText('server localhost escolhido')).toBeVisible()
  await expect(page.getByLabel('Copiar trace')).toBeVisible()
  await expect(page.locator('.trace-card').first()).toHaveCSS('user-select', 'text')
  await page.getByRole('button', { name: 'ver tudo' }).click()
  const title = page.locator('.trace-title').first()
  const box = await title.boundingBox()
  if (!box) throw new Error('Trace title has no bounding box')
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.getSelection()?.toString().trim())).not.toBe('')
  await page.getByLabel('Copiar trace').click()
  await expect(page.getByLabel('Trace copiado')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('server localhost escolhido')
  assertNoErrors()
})

test('keeps an edited config pending until reload', async ({ page }) => {
  const assertNoErrors = await openWithoutConsoleErrors(page)
  const editor = page.getByLabel('Editor do nginx.conf')
  await editor.fill(`events {}
http {
  server {
    listen 80;
    return 200 "recarregou";
  }
}`)
  await expect(page.getByText('não recarregada')).toBeVisible()
  const terminal = page.getByLabel('Comando do terminal')
  await terminal.fill('nginx -t')
  await terminal.press('Enter')
  await expect(page.getByText(/test is successful/)).toBeVisible()
  await terminal.fill('nginx -s reload')
  await terminal.press('Enter')
  await expect(page.getByText('ativa', { exact: true })).toBeVisible()
  await terminal.fill('curl http://localhost/')
  await terminal.press('Enter')
  await expect(page.getByText('recarregou', { exact: true })).toBeVisible()
  assertNoErrors()
})

test('stacks the workspace on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const assertNoErrors = await openWithoutConsoleErrors(page)
  await expect(page.getByLabel('Editor do nginx.conf')).toBeVisible()
  await expect(page.getByLabel('Comando do terminal')).toBeVisible()
  assertNoErrors()
})
