import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure'
  },
  webServer: process.env.PLAYWRIGHT_REUSE === '1' ? undefined : {
    command: 'node scripts/serve-dist.mjs',
    port: 5180,
    reuseExistingServer: true
  }
})
