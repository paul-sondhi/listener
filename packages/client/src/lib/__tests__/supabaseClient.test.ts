import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@listener/shared'

/**
 * Test suite for supabaseClient.ts
 * Verifies the correct initialization of the Supabase client with proper environment variables
 */
describe('Supabase Client (supabaseClient.ts)', () => {
  let supabase: SupabaseClient<Database>

  beforeEach(async () => {
    // Reset modules to ensure supabaseClient is re-evaluated with fresh (mocked) env vars
    vi.resetModules()

    // Stub the environment variables BEFORE importing the module
    vi.stubEnv('VITE_SUPABASE_URL', 'http://mock-supabase-url.com')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-supabase-anon-key')
    
    // Dynamically import supabaseClient after mocks are in place
    // This ensures that supabaseClient gets the mocked import.meta.env
    const module = await import('../supabaseClient.js') as { supabase: SupabaseClient<Database> }
    supabase = module.supabase
  })

  afterEach(() => {
    // Clean up the stubbed environment variables after each test
    vi.unstubAllEnvs()
  })

  it('should be initialized', () => {
    // Check if the supabase client object exists
    expect(supabase).toBeDefined()
    expect(typeof supabase).toBe('object')
  })

  it('should have an auth object', () => {
    // Check for the presence of the auth namespace
    expect(supabase.auth).toBeDefined()
    expect(typeof supabase.auth).toBe('object')
  })

  it('should have a from method for querying tables', () => {
    // Check for the presence of the 'from' method
    expect(typeof supabase.from).toBe('function')
  })

  it('should have been created with the correct URL and key (mocked values)', () => {
    // Check that the supabase client was initialized with the mocked environment variables
    // These properties are typically present on the Supabase client instance
    expect(supabase).toHaveProperty('supabaseUrl')
    expect(supabase).toHaveProperty('supabaseKey')
    
    // Verify the mocked values were used
    expect((supabase as any).supabaseUrl).toBe('http://mock-supabase-url.com')
    expect((supabase as any).supabaseKey).toBe('mock-supabase-anon-key')
  })

  it('should have proper authentication configuration', () => {
    // Verify that auth is properly configured
    expect(supabase.auth).toBeDefined()
    
    // Check for common auth methods
    expect(typeof supabase.auth.signInWithOAuth).toBe('function')
    expect(typeof supabase.auth.signOut).toBe('function')
    expect(typeof supabase.auth.getSession).toBe('function')
    expect(typeof supabase.auth.onAuthStateChange).toBe('function')
  })

  it('should throw error if VITE_SUPABASE_URL is missing', async () => {
    // Reset modules and environment
    vi.resetModules()
    vi.unstubAllEnvs()
    
    // Only set the anon key, not the URL (leaving URL undefined/empty)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-supabase-anon-key')
    // Explicitly stub the URL as empty/undefined
    vi.stubEnv('VITE_SUPABASE_URL', '')
    
    // Importing should throw an error due to missing URL
    await expect(async () => {
      await import('../supabaseClient.js?t=' + Date.now()) // Add timestamp to force reload
    }).rejects.toThrow('Missing VITE_SUPABASE_URL environment variable')
  })

  it('should throw error if VITE_SUPABASE_ANON_KEY is missing', async () => {
    // Reset modules and environment
    vi.resetModules()
    vi.unstubAllEnvs()
    
    // Only set the URL, not the anon key (leaving anon key undefined/empty)
    vi.stubEnv('VITE_SUPABASE_URL', 'http://mock-supabase-url.com')
    // Explicitly stub the anon key as empty/undefined
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    
    // Importing should throw an error due to missing anon key
    await expect(async () => {
      await import('../supabaseClient.js?t=' + Date.now()) // Add timestamp to force reload
    }).rejects.toThrow('Missing VITE_SUPABASE_ANON_KEY environment variable')
  })

  it('should use the Database type from shared package', () => {
    // Verify that the client is properly typed
    // This is more of a compile-time check, but we can verify the structure
    expect(supabase).toBeDefined()
    
    // The from method should work with table names that would be in our Database type
    // This doesn't make an actual query, just verifies the method exists and accepts strings
    const queryBuilder = supabase.from('shows')
    expect(queryBuilder).toBeDefined()
    expect(typeof queryBuilder.select).toBe('function')
  })
}) 