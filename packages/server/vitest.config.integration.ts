import { defineConfig, mergeConfig } from 'vitest/config';
import defaultConfig from './vitest.config';

export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      // Override the include pattern to only run integration and smoke tests
      include: [
        '__tests__/**/*.test.ts',
        'routes/__tests__/**/*.smoke.test.ts',
      ],
      // We don't want to mock supabase for these tests
      alias: [],
    },
    // we don't want to mock supabase for these tests
    resolve: {
      alias: [],
    },
  }),
); 