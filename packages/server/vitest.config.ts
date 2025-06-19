/**
 * Vitest Configuration for Server Package
 * 
 * This configuration sets up comprehensive testing for the server package
 * including unit tests, integration tests, and coverage reporting.
 * 
 * Configuration Features:
 * - TypeScript support with path mapping
 * - Test environment setup for Node.js
 * - Coverage reporting with detailed metrics
 * - Test file patterns and exclusions
 * - Mock configurations for external services
 * - Timeout and performance settings
 */

import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Test configuration
  test: {
    // Test environment - Node.js for server-side testing
    environment: 'node',
    
    // Test file patterns
    include: [
      // Unit tests in services directory
      'services/**/*.test.ts',
      'lib/**/*.test.ts',
      'middleware/**/*.test.ts',
      'routes/**/*.test.ts',
      
      // Integration tests in __tests__ directory
      '__tests__/**/*.test.ts',
      
      // Any test files with .test. or .spec. naming
      '**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    
    // Exclude patterns
    exclude: [
      // Standard exclusions
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      
      // Build and coverage directories
      '**/build/**',
      '**/coverage/**',
      
      // Configuration files
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],
    
    // Global test setup and teardown
    globalSetup: './tests/globalSetup.ts',
    setupFiles: ['./tests/setupTests.ts'],
    
    // Test timeouts
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 10000, // 10 seconds for setup/teardown hooks
    
    // Concurrent test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use multiple threads for faster test execution
        minThreads: 1,
        maxThreads: 4
      }
    },
    
    // Reporter configuration
    reporters: [
      'basic', // Less verbose console reporter (instead of 'default')
      // Only generate JSON and HTML reports in CI or when explicitly requested
      ...(process.env.CI ? ['json', 'html'] : [])
    ],
    
    // Reduce output noise
    logHeapUsage: false, // Don't show memory usage
    passWithNoTests: true, // Don't warn when no tests found
    
    // Coverage configuration
    coverage: {
      // Coverage provider
      provider: 'v8',
      
      // Reporter types
      reporter: [
        'text', // Console output
        'text-summary', // Summary in console
        'html', // HTML coverage report
        'lcov', // For CI/CD integration
        'json' // Machine-readable format
      ],
      
      // Coverage output directory
      reportsDirectory: './coverage',
      
      // Files to include in coverage
      include: [
        'services/**/*.ts',
        'lib/**/*.ts',
        'middleware/**/*.ts',
        'routes/**/*.ts'
      ],
      
      // Files to exclude from coverage
      exclude: [
        // Test files
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        
        // Configuration files
        '**/*.config.ts',
        '**/vitest.config.ts',
        
        // Type definition files
        '**/*.d.ts',
        
        // Build output
        '**/dist/**',
        '**/build/**',
        
        // Development files
        '**/dev/**',
        '**/temp/**',
        
        // Mock files
        '**/__mocks__/**',
        '**/mocks/**'
      ],
      
      // Coverage thresholds
      thresholds: {
        global: {
          // Overall coverage targets
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85
        },
        
        // Specific file patterns with higher requirements
        'services/subscriptionRefreshService.ts': {
          branches: 90,
          functions: 95,
          lines: 95,
          statements: 95
        },
        
        'services/backgroundJobs.ts': {
          branches: 85,
          functions: 90,
          lines: 90,
          statements: 90
        }
      },
      
      // Skip coverage for certain files during development
      skipFull: false,
      
      // Clean coverage directory before running
      clean: true
    },
    
    // Environment variables for testing
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error', // Suppress logs during testing
      
      // Test database configuration
      TEST_SUPABASE_URL: 'http://localhost:54321',
      TEST_SUPABASE_ANON_KEY: 'test-anon-key',
      
      // Disable external services for tests
      SPOTIFY_CLIENT_ID: 'test-client-id',
      SPOTIFY_CLIENT_SECRET: 'test-client-secret',
      OPENAI_API_KEY: 'test-openai-key',
      DEEPGRAM_API_KEY: 'test-deepgram-key',
      
      // Test-specific configurations
      DAILY_REFRESH_ENABLED: 'false',
      BACKGROUND_JOBS_ENABLED: 'false',
      USE_ALIAS_SUPABASE_MOCK: 'true'
    },
    
    // Mock configurations
    deps: {
      // External modules to mock
      external: [
        // Don't mock these Node.js modules
        /^node:/
      ]
    },
    
    // Watch mode configuration
    watch: false, // Disable watch mode in CI
    
    // Bail on first test failure in CI
    bail: process.env.CI ? 1 : 0,
    
    // Retry failed tests
    retry: process.env.CI ? 2 : 0,
    
    // Test isolation
    isolate: true,
    
    // Pool restart conditions
    restartTimeout: 5000,
    
    // Silent mode for CI
    silent: process.env.CI === 'true',
    
    // Snapshot serializers
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      // Path aliases for cleaner imports
      '@': path.resolve(__dirname, './'),
      '@services': path.resolve(__dirname, './services'),
      '@lib': path.resolve(__dirname, './lib'),
      '@middleware': path.resolve(__dirname, './middleware'),
      '@routes': path.resolve(__dirname, './routes'),
      '@types': path.resolve(__dirname, '../shared/src/types'),
      // Redirect all Supabase SDK imports to our in-memory test mock
      '@supabase/supabase-js': path.resolve(__dirname, 'tests/supabaseMock')
    }
  },
  
  // TypeScript configuration
  esbuild: {
    target: 'node18', // Match Node.js version
    sourcemap: true, // Enable source maps for debugging
    keepNames: true // Preserve function names for better stack traces
  },
  
  // Define global constants
  define: {
    // Environment-specific constants
    __TEST__: true,
    __DEV__: false,
    __PROD__: false
  },
  
  // CSS handling (if needed for server-side rendering)
  css: {
    // Skip CSS processing in server tests
    modules: false
  }
}) 