import base from './vitest.config'
import { defineConfig } from 'vitest/config'

// This lightweight override clears the global `exclude` so we can
// discover *.integration.test.ts files that live outside the default
// include globs (e.g. in __tests__/). It is used exclusively by the
// CI migration-tests job via npm run test:integration.

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['**/*.integration.test.ts', '**/*Integration.test.ts'],
    exclude: [],
  },
}) 