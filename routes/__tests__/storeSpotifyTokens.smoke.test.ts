import { it, beforeAll, afterAll, expect } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { randomUUID } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@listener/shared'
import spotifyTokensRouter from '../spotifyTokens.js'

/**
 * SMOKE TEST – NO MOCKS ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 * This spec exercises the entire request cycle:
 *   client → Express route → Supabase (JWT validation) → PostgreSQL helpers.
 *
 * Preconditions (CI or local):
 *   • SUPABASE_URL
 *   • SUPABASE_SERVICE_ROLE_KEY
 *   • SUPABASE_DB_PASSWORD (for `update_encrypted_tokens` → pgcrypto)
 *
 * This test now requires a packages/server/.env file with credentials.
 */

declare const process: {
  env: Record<string, string | undefined>
}

let supabaseAdmin: SupabaseClient<Database>
let testUserId: string | null = null
let accessToken: string | null = null


// Build an express app that mounts the real router (no mocks)
const app = express()
app.use(cookieParser())
app.use(express.json())
app.use('/api/store-spotify-tokens', spotifyTokensRouter)

beforeAll(async () => {
  supabaseAdmin = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  // 1) Create a disposable user
  const email = `smoke+${Date.now()}@example.com`
  const password = `P${randomUUID().slice(0, 12)}!`

  const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr) {
    throw new Error(`Smoke test user creation failed: ${createErr.message}`)
  }

  testUserId = createData.user.id

  // 2) Generate a legitimate JWT for the user
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkErr) {
    throw new Error(`Magic link generation failed: ${linkErr.message}`)
  }

  // The access_token is embedded in the URL fragment
  const url = new URL(linkData.properties.action_link)
  const hash = new URLSearchParams(url.hash.substring(1))
  accessToken = hash.get('access_token')

  if (!accessToken) {
    throw new Error('Failed to extract access token from magic link')
  }
})

afterAll(async () => {
  if (!testUserId) return
  await supabaseAdmin.auth.admin.deleteUser(testUserId)
})

it('POST /api/store-spotify-tokens succeeds end-to-end', async () => {
  // Arrange – dummy Spotify tokens
  const spotifyTokens = {
    accessToken: `spotify-access-${randomUUID()}`,
    refreshToken: `spotify-refresh-${randomUUID()}`,
  }

  // Act: Hit the endpoint with the JWT and tokens
  const response = await request(app)
    .post('/api/store-spotify-tokens')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(spotifyTokens)

  // Assert
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ success: true })
}) 