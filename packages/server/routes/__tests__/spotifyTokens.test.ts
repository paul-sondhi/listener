/**
 * Unit tests for packages/server/routes/spotifyTokens.ts
 * Tests the Spotify token storage endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import spotifyTokensRouter from '../spotifyTokens.js'
import * as vaultHelpers from '../../lib/vaultHelpers.js'

// Set up required environment variables for testing
// These need to be present to pass the environment check in the route handler
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-testing'

// Type definitions for test utilities
interface MockUser {
  id: string
  email: string
}

interface MockTokens {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type: string
  scope: string
}

interface _MockSupabaseResponse {
  data?: { user: MockUser | null }
  error?: { message: string } | null
}

interface _MockSupabaseUpdateResponse {
  error?: { message: string } | null
}

// Mock Supabase client methods used by the route
const mockSupabaseAuthGetUser = vi.fn() as MockInstance
const mockSupabaseFrom = vi.fn()
const mockSupabaseUpsert = vi.fn()
const mockSupabaseSelect = vi.fn() as MockInstance

const mockSupabaseClient = {
  auth: {
    getUser: mockSupabaseAuthGetUser,
  },
  from: mockSupabaseFrom,
}

// Setup chaining for the mock client
mockSupabaseFrom.mockImplementation(() => ({
  upsert: mockSupabaseUpsert,
}))
mockSupabaseUpsert.mockImplementation(() => ({
  select: mockSupabaseSelect,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock vault helpers - Update to mock storeUserSecret instead of createUserSecret
vi.mock('../../lib/vaultHelpers', () => ({
  storeUserSecret: vi.fn()
}))

// Create a test app
const app = express()
app.use(cookieParser())
app.use(express.json())

// Apply a simplified auth mock
app.use(async (req, res, next) => {
  const token = req.cookies['sb-access-token'] || req.headers.authorization?.split(' ')[1]
  // The route handler itself does the critical getUser call which is what we mock and test
  if (!token) {
    // This case is handled by the route itself
  }
  next()
})

app.use('/spotify-tokens', spotifyTokensRouter)

describe('POST /spotify-tokens', () => {
  const mockUser: MockUser = { id: 'user-uuid-123', email: 'test@example.com' }
  const mockTokens: MockTokens = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
    token_type: 'Bearer',
    scope: 'user-read-email user-library-read'
  }

  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks()

    // Re-establish the Supabase method chaining that was cleared above
    mockSupabaseFrom.mockImplementation(() => ({
      upsert: mockSupabaseUpsert,
    }))
    mockSupabaseUpsert.mockImplementation(() => ({
      select: mockSupabaseSelect,
    }))

    // Default successful getUser mock
    mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    // Default successful update mock
    mockSupabaseSelect.mockResolvedValue({ error: null })
    // Default successful vault operation mock - Update to use storeUserSecret
    vi.mocked(vaultHelpers.storeUserSecret).mockResolvedValue({
      success: true,
      data: mockTokens,
      elapsed_ms: 100
    })
  })

  it('should store tokens successfully with valid token in cookie and valid body', async () => {
    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ 
      success: true, 
      message: 'Tokens stored securely',
      vault_latency_ms: 100
    })
    expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith('user_supabase_token')
    expect(vi.mocked(vaultHelpers.storeUserSecret)).toHaveBeenCalledWith(mockUser.id, {
      access_token: mockTokens.access_token,
      refresh_token: mockTokens.refresh_token,
      expires_at: mockTokens.expires_at,
      token_type: 'Bearer',
      scope: 'user-read-email user-library-read'
    })
  })

  it('should store tokens successfully with valid token in Authorization header', async () => {
    // Arrange - Ensure mocks are properly set up for this test
    mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseSelect.mockResolvedValue({ error: null })
    vi.mocked(vaultHelpers.storeUserSecret).mockResolvedValue({
      success: true,
      data: mockTokens,
      elapsed_ms: 100
    })

    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Authorization', 'Bearer user_supabase_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ 
      success: true, 
      message: 'Tokens stored securely',
      vault_latency_ms: 100
    })
    expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith('user_supabase_token')
  })

  it('should return 401 if no auth token is provided', async () => {
    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('should return 401 if Supabase getUser fails or returns no user', async () => {
    // Arrange
    mockSupabaseAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Auth error' } })

    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=invalid_user_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ success: false, error: 'User authentication failed' })
  })

  it('should return 400 if token fields are missing in the request body', async () => {
    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send({ access_token: 'test' }) // Missing refresh_token and expires_at

    // Assert
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ success: false, error: 'Missing token fields' })
  })

  it('should return 500 if Supabase update fails', async () => {
    // Arrange - Mock vault failure
    vi.mocked(vaultHelpers.storeUserSecret).mockResolvedValueOnce({
      success: false,
      error: 'Vault operation failed',
      elapsed_ms: 50
    })

    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ success: false, error: 'Failed to store tokens securely' })
  })

  it('should return 500 for unexpected errors during Supabase getUser', async () => {
    // Arrange
    mockSupabaseAuthGetUser.mockRejectedValueOnce(new Error('Unexpected Supabase error'))

    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ success: false, error: 'Internal server error' })
  })

  it('should return 500 for unexpected errors during Supabase update', async () => {
    // Arrange - Make the .select call fail unexpectedly
    mockSupabaseSelect.mockRejectedValueOnce(new Error('Unexpected DB error'))

    // Act
    const response = await (request(app) as any)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens)

    // Assert
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ success: false, error: 'Internal server error' })
  })
}) 