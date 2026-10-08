import { defineConfig } from '@playwright/test'

// E2E contra a stack real; veja e2e/stack/stack.spec.ts e docs/DEPLOY.md.
export default defineConfig({
  testDir: './e2e/stack',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.NGINXLEARN_STACK_URL ?? 'http://127.0.0.1:8088',
    trace: 'retain-on-failure'
  }
})
