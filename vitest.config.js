import path from 'path'
import { loadEnv } from 'payload/node'
import { fileURLToPath } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { configDefaults, defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    plugins: [
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
    ],
    test: {
      environment: 'node',
      // e2e.spec.ts is a Playwright suite (run by playwright.config.js); importing
      // @playwright/test inside vitest throws at collection time
      exclude: [...configDefaults.exclude, 'dev/e2e.spec.ts'],
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }
})
