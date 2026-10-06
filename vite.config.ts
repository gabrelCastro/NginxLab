import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  preview: { port: 4174 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'fidelity/**/*.test.ts']
  }
}))
