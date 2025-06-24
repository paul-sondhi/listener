import { describe, it, expect } from 'vitest'
import { encryptedTokenHealthCheck } from '../../encryptedTokenHelpers.js'

/**
 * Integration guard: verifies that the PL/pgSQL helper functions required for
 * encrypted-token storage (update_encrypted_tokens, get_encrypted_tokens,
 * test_encryption) exist and work in the target database.  The test is
 * executed only in the DB-backed CI job, so it talks to a real Postgres
 * instance and will fail the deploy if a migration was missed.
 */

describe('Encrypted-token helper functions migration guard', () => {
  it('should be present and operational', async () => {
    const healthy = await encryptedTokenHealthCheck()
    expect(healthy).toBe(true)
  })
}) 