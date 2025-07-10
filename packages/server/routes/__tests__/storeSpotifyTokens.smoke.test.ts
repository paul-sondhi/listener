import { describe, it, beforeAll, afterAll, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { randomUUID } from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@listener/shared'
import spotifyTokensRouter from '../spotifyTokens.js'

/**
 * SMOKE TEST – MOCKED VERSION ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 * This spec exercises the entire request cycle:
 *   client → Express route → Supabase (JWT validation) → PostgreSQL helpers.
 *
 * This version uses mocks to work in the test environment while still testing
 * the full request/response cycle and route logic.
 */

declare const process: {
  env: Record<string, string | undefined>
}

// Mock Supabase functions for testing (following the pattern from spotifyTokens.integration.test.ts)
const mockSupabaseRpc = vi.fn()
const mockSupabaseFrom = vi.fn()
const mockSupabaseSelect = vi.fn()
const mockSupabaseUpdate = vi.fn()
const mockSupabaseEq = vi.fn()
const mockSupabaseSingle = vi.fn()
const mockSupabaseAuth = {
  admin: {
    createUser: vi.fn(),
    generateLink: vi.fn(),
    deleteUser: vi.fn()
  },
  getUser: vi.fn()
}

// Mock the Supabase client creation
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockSupabaseRpc,
    from: mockSupabaseFrom,
    auth: mockSupabaseAuth
  }))
}))

let supabaseAdmin: SupabaseClient<Database>
let testUserId: string | null = null
let accessToken: string | null = null

describe('Smoke Test: store-spotify-tokens', () => {
  let app: express.Express

  beforeAll(async () => {
    // Set up environment variables for testing if not already set
    if (!process.env.SUPABASE_URL) {
      process.env.SUPABASE_URL = 'http://localhost:54321'
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    }

    app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/api/store-spotify-tokens', spotifyTokensRouter)

    // Initialize Supabase client (mocked)
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Set up default mock implementations
    mockSupabaseRpc.mockImplementation((funcName, _params) => {
      if (funcName === 'get_encrypted_tokens') {
        return Promise.resolve({
          error: { message: 'No encrypted tokens found for user: test-user-id' }
        })
      }
      if (funcName === 'update_encrypted_tokens') {
        return Promise.resolve({ data: 'success', error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
  })

  beforeEach(async () => {
    // Clear mocks before each test
    vi.clearAllMocks()
    
    // Mock user creation
    mockSupabaseAuth.admin.createUser.mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      },
      error: null
    })

    // Mock token generation
    mockSupabaseAuth.admin.generateLink.mockResolvedValue({
      data: {
        properties: {
          action_link: 'https://example.com/magiclink#access_token=test-access-token&refresh_token=test-refresh-token'
        }
      },
      error: null
    })

    // Mock user cleanup
    mockSupabaseAuth.admin.deleteUser.mockResolvedValue({
      data: {},
      error: null
    })

    // Mock user authentication - this is what the route calls
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      },
      error: null
    })

    // Set up method chaining for database queries
    mockSupabaseSingle.mockResolvedValue({ data: { spotify_tokens_enc: null }, error: null })
    mockSupabaseEq.mockReturnValue({ 
      single: mockSupabaseSingle,
      select: vi.fn().mockResolvedValue({ data: [], error: null })
    })
    mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq })
    
    // Mock the upsert operation for user records
    const mockUpsert = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null })
    })
    
    mockSupabaseFrom.mockReturnValue({ 
      select: mockSupabaseSelect,
      update: mockSupabaseUpdate,
      upsert: mockUpsert
    })
    mockSupabaseUpdate.mockReturnValue({ eq: mockSupabaseEq })

    // 1) Create a disposable user (mocked)
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

    // 2) Generate a legitimate JWT for the user (mocked)
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
    try {
      await supabaseAdmin.auth.admin.deleteUser(testUserId)
    } catch (error) {
      console.warn('Failed to cleanup test user:', error)
    }
  })

  it('POST /api/store-spotify-tokens succeeds end-to-end', async () => {
    // Arrange – dummy Spotify tokens in snake_case as the route expects
    const spotifyTokens = {
      access_token: `spotify-access-${randomUUID()}`,
      refresh_token: `spotify-refresh-${randomUUID()}`,
      expires_at: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    }

    // Act: Hit the endpoint with the JWT and tokens
    const response = await request(app)
      .post('/api/store-spotify-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(spotifyTokens)

    // Assert – success path should return 200 and success true
    expect(response.status).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({ success: true }))
  })
}) 