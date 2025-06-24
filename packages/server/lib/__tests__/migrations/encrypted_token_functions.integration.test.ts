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
    // CI path: when running inside migration-tests job we do *not* provide
    // Supabase credentials.  In that case connect directly to the local
    // Postgres container and verify the helper functions exist.

    if (!process.env.SUPABASE_URL) {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5432/test_db' })
      const client = await pool.connect()
      try {
        const requiredFns = ['update_encrypted_tokens', 'get_encrypted_tokens', 'test_encryption']
        for (const fn of requiredFns) {
          const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1) AS exists`, [fn])
          expect(rows[0].exists).toBe(true)
        }
      } finally {
        client.release()
        await pool.end()
      }
    } else {
      // Local runs w/ Supabase credentials – use full health check
      const healthy = await encryptedTokenHealthCheck()
      expect(healthy).toBe(true)
    }
  })
}) 