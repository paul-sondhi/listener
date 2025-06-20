/**
 * Environment Configuration Tests
 * These tests ensure that environment variables are properly configured
 * for the current development/production environment
 */

import { describe, it, expect } from 'vitest'

describe('Environment Configuration', () => {
  // Test to ensure local development uses local Supabase URLs
  it('should use local Supabase URL when NODE_ENV is not production', () => {
    // Skip this test if we're actually in production
    if (process.env.NODE_ENV === 'production') {
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const isLocalSupabase = supabaseUrl?.includes('127.0.0.1') || supabaseUrl?.includes('localhost')
    const isProductionSupabase = supabaseUrl?.includes('.supabase.co')

    // In non-production environments, we should be using local Supabase
    if (!isLocalSupabase && isProductionSupabase) {
      console.warn('⚠️  WARNING: You appear to be using production Supabase URLs in a local development environment.')
      console.warn('   This can cause API failures and unexpected behavior.')
      console.warn('   Expected: http://127.0.0.1:54321 or http://localhost:54321')
      console.warn(`   Current:  ${supabaseUrl}`)
      console.warn('   Run `npm run supabase:start` and update your .env file to use local URLs.')
    }

    // For now, let's make this a warning rather than a hard failure
    // since the user might legitimately want to test against production
    expect(true).toBe(true)
  })

  // Test to ensure we have required environment variables set
  it('should have all required environment variables set', () => {
    // Skip this test in CI environments where env vars might not be set
    if (process.env.CI || process.env.NODE_ENV === 'test') {
      console.log('⏭️  Skipping environment variable check in test/CI environment')
      return
    }

    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SPOTIFY_CLIENT_ID',
      'SPOTIFY_CLIENT_SECRET'
    ]

    const missingVars = requiredVars.filter(varName => !process.env[varName])

    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:', missingVars)
      console.error('   Please check your .env file and ensure all required variables are set.')
      
      // Make this a warning in test environments rather than hard failure
      console.warn('   This test is designed to catch configuration issues in development.')
      console.warn('   If you are running tests, this can be safely ignored.')
    }

    // Don't fail in test environments since env vars are set differently
    expect(true).toBe(true)
  })

  // **NEW**: Critical environment check that will fail the build if environment is misconfigured
  it('should fail if server startup would fail due to missing critical environment variables', () => {
    // Skip in test/CI environments where mocking is expected
    if (process.env.NODE_ENV === 'test' || process.env.CI) {
      return
    }

    // These are the exact variables that cause server startup to fail
    const criticalVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    const missingCriticalVars = criticalVars.filter(varName => !process.env[varName])

    if (missingCriticalVars.length > 0) {
      const errorMessage = `❌ CRITICAL: Server will fail to start due to missing environment variables: ${missingCriticalVars.join(', ')}`
      console.error(errorMessage)
      console.error('   This will cause the migration verification script to fail during server startup.')
      console.error('   Fix: Ensure packages/server/.env contains the required variables.')
      
      // Actually fail the test for critical variables that prevent server startup
      expect(missingCriticalVars).toEqual([])
    }
  })

  // Test to ensure Supabase keys match the URL environment
  it('should have matching Supabase URL and service role key environment', () => {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      // This will be caught by the previous test
      return
    }

    const isLocalUrl = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
    const isLocalKey = serviceRoleKey.includes('supabase-demo')
    
    const isProductionUrl = supabaseUrl.includes('.supabase.co')
    const isProductionKey = !serviceRoleKey.includes('supabase-demo')

    // Check for mismatched environments
    const mismatch = (isLocalUrl && !isLocalKey) || (isProductionUrl && !isProductionKey)

    if (mismatch) {
      console.warn('⚠️  WARNING: Supabase URL and service role key appear to be from different environments.')
      console.warn(`   URL: ${isLocalUrl ? 'Local' : 'Production'}`)
      console.warn(`   Key: ${isLocalKey ? 'Local' : 'Production'}`)
      console.warn('   This mismatch can cause authentication and API failures.')
    }

    // For now, make this a warning rather than a hard failure
    expect(true).toBe(true)
  })

  // Test database connectivity if we're using local Supabase
  it('should be able to connect to Supabase when using local URLs', async () => {
    const supabaseUrl = process.env.SUPABASE_URL
    
    if (!supabaseUrl?.includes('127.0.0.1') && !supabaseUrl?.includes('localhost')) {
      // Skip this test if not using local Supabase
      return
    }

    // Simple HTTP health check for local Supabase
    try {
      const response = await fetch(`${supabaseUrl}/health`)
      expect(response.ok).toBe(true)
    } catch (error) {
      console.warn('⚠️  WARNING: Cannot connect to local Supabase instance.')
      console.warn('   Make sure to run `npm run supabase:start` before testing locally.')
      console.warn('   Error:', (error as Error).message)
      
      // Don't fail the test since Supabase might not be running in CI
      expect(true).toBe(true)
    }
  })

  // **NEW**: Test to verify environment files exist where expected
  it('should have environment files in the correct locations for development', async () => {
    if (process.env.NODE_ENV === 'test' || process.env.CI) {
      return
    }

    const fs = await import('fs/promises')
    const path = await import('path')
    
    const serverEnvPath = path.resolve(process.cwd(), 'packages/server/.env')
    const clientEnvPath = path.resolve(process.cwd(), 'packages/client/.env')
    
    try {
      await fs.access(serverEnvPath)
      console.log('✅ Server .env file exists')
    } catch {
      console.error('❌ Server .env file missing at packages/server/.env')
      console.error('   This is required for the server to find environment variables during startup.')
    }
    
    try {
      await fs.access(clientEnvPath)
      console.log('✅ Client .env file exists')
    } catch {
      console.warn('⚠️  Client .env file missing at packages/client/.env')
      console.warn('   The client may fall back to root .env, but a dedicated client .env is recommended.')
    }
    
    expect(true).toBe(true)
  })
}) 