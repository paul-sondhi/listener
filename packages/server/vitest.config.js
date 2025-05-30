import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Specify the environment for Node.js testing
    environment: 'node',
    // You can add other server-specific configurations here if needed
    // For example, if you want to enable globals similar to the client:
    // globals: true,
    // setupFiles: ['./setupTests.js'], // if you need a setup file for server tests
  },
}); 