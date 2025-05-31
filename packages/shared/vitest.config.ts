/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // or 'node' if your shared code is backend only
    globals: true, // if you want vitest globals (describe, it, expect, etc.) available without imports
    // setupFiles: ['./src/setupTests.ts'], // if you have a test setup file
  },
}); 