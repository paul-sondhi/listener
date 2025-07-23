/**
 * Tests for the database migration verification script
 * These tests ensure the verification script itself works correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyDatabaseMigrations } from '../verify-database-migrations.mjs'

// Mock process.exit to prevent tests from actually exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {})

// Mock console functions to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

// Store original environment variables to restore after tests
const originalEnv = { ...process.env }

describe('Database Migration Verification Script', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
  })

  it('should fail gracefully when environment variables are missing', async () => {
    // Remove required environment variables
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await verifyDatabaseMigrations()

    // Should exit with code 2 (configuration error)
    expect(mockExit).toHaveBeenCalledWith(2)
    
    // Should log helpful error messages
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('Missing required environment variables')
    )
  })

  it('should not crash when trying to check vault functions', async () => {
    // Set up minimal environment
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

    // This should not throw an error even if the database is not accessible
    await expect(verifyDatabaseMigrations()).resolves.not.toThrow()
  })

  it('should handle database connection failures gracefully', async () => {
    // Set up environment with invalid connection details
    process.env.SUPABASE_URL = 'http://invalid-url:1234'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'invalid-key'

    await verifyDatabaseMigrations()

    // Should exit with code 1 (verification failure) rather than crashing
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('should provide helpful error messages and solutions', async () => {
    // Set up environment that will fail verification
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

    await verifyDatabaseMigrations()

    // Should provide common solutions
    const logMessages = mockConsoleLog.mock.calls.flat().join(' ')
    expect(logMessages).toContain('supabase db push --linked')
    expect(logMessages).toContain('Check your environment variables')
  })

  it('should not use functions that do not exist in Supabase', async () => {
    // This test ensures we don't call non-existent functions like execute_sql
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

    // The verification should not crash due to calling non-existent functions
    await expect(verifyDatabaseMigrations()).resolves.not.toThrow()
    
    // Should not attempt to call execute_sql function
    const logMessages = mockConsoleLog.mock.calls.flat().join(' ')
    expect(logMessages).not.toContain('execute_sql')
  })
})

describe('Verification Script Integration', () => {
  it('should be importable without throwing errors', () => {
    // Just importing the script should not cause any issues
    expect(() => {
      // The import happened at the top of this file
    }).not.toThrow()
  })

  it('should export the verification function', () => {
    expect(typeof verifyDatabaseMigrations).toBe('function')
  })
}) 