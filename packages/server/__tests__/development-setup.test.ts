import { describe, it, expect } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

/**
 * Development Setup Tests
 * 
 * These tests validate that the development environment is properly configured
 * and all necessary dependencies are available for running the server locally.
 * This helps catch configuration issues that would prevent developers from
 * starting the server during local development.
 */
describe('Development Setup', () => {
  
  /**
   * Test that tsx (TypeScript runner) is available and functional
   * This is critical because the dev script uses tsx to run TypeScript directly
   */
  it('should have tsx available for running TypeScript', async () => {
    try {
      // Check if tsx is available in node_modules
      const { stdout } = await execAsync('npx tsx --version', { 
        cwd: path.join(__dirname, '..') 
      })
      
      expect(stdout).toMatch(/\d+\.\d+\.\d+/) // Should return a version number
    } catch (_error) {
      throw new Error(`tsx is not available or not working: ${_error}`)
    }
  })

  /**
   * Test that the package.json dev script is properly configured
   * This ensures the dev script uses a valid TypeScript runner
   */
  it('should have a valid dev script configuration', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Check that dev script exists
    expect(packageJson.scripts.dev).toBeDefined()
    
    // Check that it uses tsx (not ts-node which isn't installed)
    expect(packageJson.scripts.dev).toContain('tsx')
    expect(packageJson.scripts.dev).not.toContain('ts-node')
  })

  /**
   * Test that tsx dependency is properly listed in package.json
   * This ensures tsx is available as a dependency
   */
  it('should have tsx as a dependency', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // tsx should be in devDependencies
    expect(packageJson.devDependencies?.tsx).toBeDefined()
    expect(packageJson.devDependencies.tsx).toMatch(/^\d+\.\d+\.\d+$|^\^\d+\.\d+\.\d+$/) // Valid version format
  })

  /**
   * Test that the server file exists and is accessible
   * This validates the main server entry point exists
   */
  it('should have server.ts file in the correct location', async () => {
    const serverPath = path.join(__dirname, '..', 'server.ts')
    
    try {
      await fs.access(serverPath)
      const serverContent = await fs.readFile(serverPath, 'utf-8')
      
      // Basic validation that it's a proper server file
      expect(serverContent).toContain('express')
      expect(serverContent).toContain('app.listen') // or similar server startup logic
    } catch (_error) {
      throw new Error(`Server file is not accessible: ${_error}`)
    }
  })

  /**
   * Test that essential dependencies are available for development
   * This checks that critical packages needed for development are installed
   */
  it('should have essential development dependencies available', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Check for nodemon (for development server auto-restart)
    expect(packageJson.devDependencies?.nodemon).toBeDefined()
    
    // Check for TypeScript
    expect(packageJson.devDependencies?.typescript).toBeDefined()
  })

})

/**
 * Development Setup Tests
 * 
 * These tests are specifically designed to catch common development setup issues
 * that cause server startup failures or runtime errors that aren't caught by
 * unit tests due to mocking.
 * 
 * These tests are skipped in CI/test environments since they test real environment
 * configuration rather than application logic.
 */

describe('Development Setup Validation', () => {
  // Skip all these tests in test/CI environments since they test real environment setup
  const shouldSkip = process.env.NODE_ENV === 'test' || process.env.CI
  
  it('should detect server startup environment issues that cause migration script failures', () => {
    if (shouldSkip) {
      console.log('⏭️  Skipping development setup test in test/CI environment')
      return
    }

    // This test specifically addresses the issue where:
    // 1. Server tries to start
    // 2. Migration verification script runs first (verify-database-migrations.mjs)
    // 3. Script can't find SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
    // 4. Server startup fails
    // 5. Client can't connect to server APIs -> 500 errors

    const requiredForMigrationScript = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ]

    const missingVars = requiredForMigrationScript.filter(varName => !process.env[varName])

    if (missingVars.length > 0) {
      console.error('❌ CRITICAL: Migration verification script will fail during server startup')
      console.error(`   Missing variables: ${missingVars.join(', ')}`)
      console.error('   This causes:')
      console.error('     1. Server fails to start')
      console.error('     2. Client gets 500 errors when calling APIs')
      console.error('     3. "Unexpected end of JSON input" errors in browser console')
      console.error('')
      console.error('   Fix: Ensure packages/server/.env contains:')
      console.error('   SUPABASE_URL=http://127.0.0.1:54321')
      console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
      
      // Fail the test to prevent broken development environment
      expect(missingVars).toEqual([])
    }
  })

  it('should detect environment file location issues', async () => {
    if (shouldSkip) {
      return
    }

    const fs = await import('fs/promises')
    const path = await import('path')

    // Server environment file should exist for server package to load variables
    const serverEnvPath = path.resolve(process.cwd(), 'packages/server/.env')
    
    try {
      const serverEnvContent = await fs.readFile(serverEnvPath, 'utf-8')
      
      // Check if server .env has the critical variables
      const hasSupabaseUrl = serverEnvContent.includes('SUPABASE_URL=')
      const hasServiceRoleKey = serverEnvContent.includes('SUPABASE_SERVICE_ROLE_KEY=')
      
      if (!hasSupabaseUrl || !hasServiceRoleKey) {
        console.error('❌ Server .env file exists but missing critical variables')
        console.error(`   Has SUPABASE_URL: ${hasSupabaseUrl}`)
        console.error(`   Has SUPABASE_SERVICE_ROLE_KEY: ${hasServiceRoleKey}`)
        
        expect(hasSupabaseUrl && hasServiceRoleKey).toBe(true)
      }
    } catch (_error) {
      console.error('❌ Server .env file not found at packages/server/.env')
      console.error('   The server looks for environment variables in ../../.env and packages/server/.env')
      console.error('   Without packages/server/.env, the migration script may not find required variables')
      
      expect(false).toBe(true) // Fail the test
    }
  })

  it('should detect production/local environment mismatches that cause runtime failures', () => {
    if (shouldSkip) {
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      // This will be caught by the previous test
      return
    }

    const isLocalUrl = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')
    const isProductionUrl = supabaseUrl.includes('.supabase.co')
    const isLocalKey = serviceRoleKey.includes('supabase-demo')
    
    // Check for the dangerous mismatch: production URL with local key or vice versa
    const dangerousMismatch = (isProductionUrl && isLocalKey) || (isLocalUrl && !isLocalKey)

    if (dangerousMismatch) {
      console.error('❌ CRITICAL: Environment mismatch detected that will cause runtime failures')
      console.error(`   SUPABASE_URL: ${isLocalUrl ? 'Local' : 'Production'} (${supabaseUrl})`)
      console.error(`   Service Role Key: ${isLocalKey ? 'Local' : 'Production'}`)
      console.error('   This mismatch causes:')
      console.error('     1. Authentication failures')
      console.error('     2. Database connection errors')
      console.error('     3. 500 errors in API calls')
      console.error('')
      console.error('   For local development, use:')
      console.error('   SUPABASE_URL=http://127.0.0.1:54321')
      console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
      
      expect(dangerousMismatch).toBe(false)
    }
  })

  it('should verify local Supabase is accessible when using local URLs', async () => {
    if (shouldSkip) {
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL

    if (!supabaseUrl?.includes('127.0.0.1') && !supabaseUrl?.includes('localhost')) {
      // Not using local Supabase, skip this check
      return
    }

    // Test if local Supabase is actually running
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`${supabaseUrl}/health`, {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        console.error('❌ Local Supabase is not responding properly')
        console.error(`   URL: ${supabaseUrl}/health`)
        console.error(`   Status: ${response.status}`)
        console.error('   Fix: Run `npm run supabase:start` to start local Supabase')
        
        expect(response.ok).toBe(true)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Cannot connect to local Supabase')
      console.error(`   URL: ${supabaseUrl}`)
      console.error(`   Error: ${errorMessage}`)
      console.error('   This will cause server startup to fail and APIs to return 500 errors')
      console.error('   Fix: Run `npm run supabase:start` to start local Supabase')
      
      expect(false).toBe(true) // Fail the test
    }
  })
}) 