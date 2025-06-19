import { describe, it, expect } from 'vitest'
import { encryptedTokenHealthCheck } from '../lib/encryptedTokenHelpers.js'

/**
 * This test **must NOT** mock the Supabase client. It is intended to execute
 * against a *real* database (local `supabase start` during CI or the linked
 * project in production-like pipelines).
 *
 * It exists to guard against the exact regression that caused the 500 error in
 * production: a missing `update_encrypted_tokens` (or companion) function due
 * to unapplied migrations. If the helper functions are absent the health check
 * will return `false` which fails the test and blocks the deploy.
 */

describe('Database migrations', () => {
  // Only run when the test runner has the necessary credentials
  const hasCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Dynamically skip when credentials are missing to avoid local dev pain
  const maybeIt = hasCredentials ? it : it.skip

  maybeIt('all encrypted-token helper functions should be present', async () => {
    const healthy = await encryptedTokenHealthCheck()
    expect(healthy).toBe(true)
  })
}) 