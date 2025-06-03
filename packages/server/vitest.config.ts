import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@listener/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    // Node.js environment for server-side testing
    environment: 'node',
    globals: true,
    setupFiles: ['./setupTests.ts'],
    // Enhanced TypeScript test patterns
    include: [
      '**/*.{test,spec}.{js,ts}',
      '**/__tests__/**/*.{js,ts}',
    ],
    exclude: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      'public/',
    ],
    // Coverage configuration optimized for TypeScript server code
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'coverage/',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/__tests__/**',
        'setupTests.{js,ts}',
        'vitest.config.{js,ts}',
        // Exclude main server entry point as it's hard to test in isolation
        'server.{js,ts}',
        // Exclude type definitions
        '**/*.d.ts',
        // Exclude public assets
        'public/**',
      ],
      include: [
        'lib/**/*.{js,ts}',
        'routes/**/*.{js,ts}',
        'middleware/**/*.{js,ts}',
        'services/**/*.{js,ts}',
      ],
      // Enhanced coverage thresholds for TypeScript server code
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Stricter thresholds for critical TypeScript server components
        'lib/**/*.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'routes/**/*.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'middleware/**/*.ts': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'services/**/*.ts': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },
    // TypeScript-specific test environment configuration
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },
    // Server-specific test timeout (longer for integration tests)
    testTimeout: 10000,
    // Hook timeout for async setup/teardown
    hookTimeout: 10000,
  },
}) 