import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Specify the environment for Node.js testing
    environment: 'node',
    // Add coverage configuration to identify test gaps
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        '**/*.test.{js,jsx,ts,tsx}',
        '**/__tests__/**',
        'vitest.config.js',
        // Exclude the main server.js from coverage as it's hard to test in isolation
        'server.js',
        // Exclude public assets
        'public/**',
      ],
      include: [
        'lib/**/*.{js,ts}',
        'routes/**/*.{js,ts}',
        'middleware/**/*.{js,ts}',
        'services/**/*.{js,ts}',
      ],
      // Set coverage thresholds to encourage good test coverage
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // More specific thresholds for critical files
        'lib/**': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'routes/**': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        'middleware/**': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        'services/**': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },
    // You can add other server-specific configurations here if needed
    // For example, if you want to enable globals similar to the client:
    // globals: true,
    // setupFiles: ['./setupTests.js'], // if you need a setup file for server tests
  },
}); 