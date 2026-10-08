import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  // A API roda em outro processo; o proxy mantém a mesma origem e dispensa CORS.
  server: { port: 5174, proxy: { '/api': process.env.NGINXLEARN_API_URL ?? 'http://localhost:8080' } },
  preview: { port: 4174 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'fidelity/**/*.test.ts']
  }
}))
