import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/globalSetup.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    fileParallelism: false,
    restoreMocks: true,
  },
})
