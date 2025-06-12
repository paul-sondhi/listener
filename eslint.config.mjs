import js from '@eslint/js'
import globals from 'globals'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  // Global ignores for all configurations
  { 
    ignores: [
      '**/dist/**',
      '**/build/**', 
      '**/coverage/**',
      '**/node_modules/**',
      '**/.vercel/**',
      '**/.temp/**',
      '**/.branches/**',
      '**/supabase/.temp/**',
      '**/supabase/.branches/**',
      '**/html/assets/**', // Exclude bundled assets
      '**/*.bundle.js',    // Exclude bundled JavaScript files
      '**/*-*.js'          // Exclude files with hash patterns like index-Br0wpA4B.js
    ] 
  },
  
  // Base JavaScript configuration for all JS files
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Common JavaScript rules
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // TypeScript configuration for all TS files (without strict project checking)
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
        // Add Node.js globals for server-side code
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Remove strict project checking for now to avoid path issues
        // project: true,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      
      // Disable JS rules that conflict with TS rules
      'no-unused-vars': 'off',
      'no-undef': 'off', // TypeScript handles this better
      
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-empty-object-type': 'warn', // Allow empty interfaces for now
      
      // General code quality rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // React/Browser-specific configuration for client code
  {
    files: ['packages/client/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // Add React globals
        React: 'readonly',
        JSX: 'readonly',
      },
    },
    rules: {
      // Browser-specific rules
      'no-console': 'warn', // Allow console in development
      // React-specific rules would go here
    },
  },

  // Node.js specific configuration for server code
  {
    files: ['packages/server/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Node.js specific rules
      'no-console': 'off', // Allow console.log in server code
    },
  },

  // Test files configuration
  {
    files: ['**/__tests__/**/*.{js,ts,tsx}', '**/*.{test,spec}.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2022,
      },
    },
    rules: {
      // Test-specific rules
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Configuration files
  {
    files: ['**/eslint.config.{js,mjs,cjs}', '**/vite.config.{js,ts}', '**/vitest.config.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow console in config files
      'no-console': 'off',
    },
  },

  // Scripts directory
  {
    files: ['scripts/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': 'off', // Allow console in scripts
    },
  },
] 