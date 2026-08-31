import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
    },
  },
  plugins: [solid()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    restoreMocks: true,
  },
})
