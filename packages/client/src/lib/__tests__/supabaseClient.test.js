// Test suite for supabaseClient.js
// This file verifies the correct initialization of the Supabase client.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// REMOVED OLD MOCK: vi.mock('vite', ...)
// The environment variables will now be stubbed in beforeEach.

describe('Supabase Client (supabaseClient.js)', () => {
  let supabase;

  beforeEach(async () => {
    // Reset modules to ensure supabaseClient is re-evaluated with fresh (mocked) env vars
    vi.resetModules();

    // Stub the environment variables BEFORE importing the module
    vi.stubEnv('VITE_SUPABASE_URL', 'http://mock-supabase-url.com');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-supabase-anon-key');
    
    // Dynamically import supabaseClient after mocks are in place
    // This ensures that supabaseClient gets the mocked import.meta.env
    const module = await import('../supabaseClient.js');
    supabase = module.supabase;
  });

  afterEach(() => {
    // Clean up the stubbed environment variables after each test
    vi.unstubAllEnvs();
  });

  it('should be initialized', () => {
    // Check if the supabase client object exists
    expect(supabase).toBeDefined();
  });

  it('should have an auth object', () => {
    // Check for the presence of the auth namespace
    expect(supabase.auth).toBeDefined();
  });

  it('should have a from method for querying tables', () => {
    // Check for the presence of the 'from' method
    expect(typeof supabase.from).toBe('function');
  });

  it('should have been created with the correct URL and key (mocked values)', () => {
    // This part is a bit indirect. We can't directly inspect the URL and key
    // used in the createClient call from the resulting 'supabase' object easily.
    // However, the fact that it's initialized and has expected methods implies
    // createClient was called. The mock ensures it was called with *some* URL and key.
    // For more direct testing, you'd need to mock '@supabase/supabase-js' itself.
    // For this library, confirming it's a client instance is usually sufficient.
    expect(supabase).toHaveProperty('supabaseUrl'); 
    expect(supabase).toHaveProperty('supabaseKey');
    
    // Note: Accessing supabase.supabaseUrl and supabase.supabaseKey directly is not
    // a standard documented API of the Supabase client, but they are often present.
    // If these properties are not available or change, this part of the test might fail.
    // A more robust check for this would be to mock '@supabase/supabase-js'
    // and assert that 'createClient' was called with the mocked env variables.
    // However, for simplicity and given it's mostly config, this is a reasonable start.
    
    // To make it more robust without full module mocking:
    // We are essentially trusting that if createClient gets called with *any* string arguments
    // (which our mock ensures they are), it will produce an object with .auth and .from.
    // The critical part is that import.meta.env was mocked BEFORE the import.
    expect(supabase.supabaseUrl).toBe('http://mock-supabase-url.com');
    expect(supabase.supabaseKey).toBe('mock-supabase-anon-key');
  });
}); 