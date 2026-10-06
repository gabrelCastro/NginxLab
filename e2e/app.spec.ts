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

test('opens the complete learning workspace', async ({ page }) => {
  const assertNoErrors = await openWithoutConsoleErrors(page)
  await expect(page.getByRole('link', { name: /NginxLearn/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'nginx.conf' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Terminal' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Caminho da requisição' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1. Um servidor que entrega arquivos' })).toBeVisible()
  assertNoErrors()
})

test('runs curl, renders and copies the selectable trace', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5180' })
  const assertNoErrors = await openWithoutConsoleErrors(page)
  const terminal = page.getByLabel('Comando do terminal')
  await terminal.fill('curl -i http://localhost/')
  await terminal.press('Enter')
  await expect(page.getByText('HTTP/1.1 200 OK')).toBeVisible()
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
