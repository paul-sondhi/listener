import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./setupTests.js'],
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
        'setupTests.js',
        'vite.config.js',
        'vitest.config.js',
        'eslint.config.js',
        // Exclude main.jsx from coverage as it's hard to test in isolation
        'src/main.jsx',
        // Exclude CSS files
        '**/*.css',
        // Exclude assets
        'src/assets/**',
        'public/**',
      ],
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
      ],
      // Set coverage thresholds to encourage good test coverage
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        // More specific thresholds for critical files
        'src/components/**': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
        'src/contexts/**': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'src/lib/**': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },
  },
}) 