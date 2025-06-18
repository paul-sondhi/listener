import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getValidTokens, refreshTokens, getMetrics, healthCheck, clearRateLimit } from '../tokenService.js'
import * as vaultHelpers from '../../lib/vaultHelpers.js'
import * as tokenCache from '../../lib/tokenCache.js'

// Mock dependencies
vi.mock('../../lib/vaultHelpers')
vi.mock('../../lib/tokenCache')

// Mock the Supabase client
const mockSupabaseClient = {
  rpc: vi.fn(),
  from: vi.fn()
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock environment variables
const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    SPOTIFY_CLIENT_ID: 'test-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-client-secret',
    TOKEN_REFRESH_THRESHOLD_MINUTES: '5',
    MAX_REFRESH_RETRIES: '3',
    TOKEN_CACHE_TTL_SECONDS: '60',
    RATE_LIMIT_PAUSE_SECONDS: '30'
  }
  
  // Clear rate limit state to prevent test pollution
  clearRateLimit()
  
  // Clear all mocks and reset implementations
  vi.clearAllMocks()
  mockSupabaseClient.rpc.mockReset()
  mockSupabaseClient.from.mockReset()
  mockFetch.mockReset()
})

afterEach(() => {
  process.env = originalEnv
})

describe('TokenService', () => {
  const mockUserId = 'test-user-id'
  const mockTokenData = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    token_type: 'Bearer',
    scope: 'user-read-email'
  }

  // Mock token data for testing
  const _mockSpotifyTokens = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'Bearer',
    scope: 'user-read-email'
  }

  describe('getValidTokens', () => {
    it('should return cached tokens when valid and not needing refresh', async () => {
      // Mock cache hit with valid tokens
      const mockCache = {
        get: vi.fn().mockResolvedValue(mockTokenData),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      const result = await getValidTokens(mockUserId)

      expect(result.success).toBe(true)
      expect(result.tokens).toBeDefined()
      expect(result.requires_reauth).toBe(false)
      expect(mockCache.get).toHaveBeenCalledWith(mockUserId)
    })

    it('should fetch from vault when cache miss', async () => {
      // Mock cache miss
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock vault success
      vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
        success: true,
        data: mockTokenData,
        elapsed_ms: 100
      })

      const result = await getValidTokens(mockUserId)

      expect(result.success).toBe(true)
      expect(vaultHelpers.getUserSecret).toHaveBeenCalledWith(mockUserId)
      expect(mockCache.set).toHaveBeenCalledWith(mockUserId, mockTokenData, 60)
    })

    it('should require reauth when no tokens found in vault', async () => {
      // Mock cache miss
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock vault failure
      vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
        success: false,
        error: 'No tokens found',
        elapsed_ms: 50
      })

      const result = await getValidTokens(mockUserId)

      expect(result.success).toBe(false)
      expect(result.requires_reauth).toBe(true)
      expect(result.error).toContain('No tokens found')
    })

    it('should refresh tokens when they are near expiry', async () => {
      // Mock tokens that expire in 2 minutes (less than 5 minute threshold)
      const expiredTokenData = {
        ...mockTokenData,
        expires_at: Math.floor(Date.now() / 1000) + 120 // 2 minutes from now
      }

      const mockCache = {
        get: vi.fn().mockResolvedValue(expiredTokenData),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock successful refresh
      mockSupabaseClient.rpc.mockResolvedValue({ data: { success: true }, error: null })
      mockSupabaseClient.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })
      vi.mocked(vaultHelpers.updateUserSecret).mockResolvedValue({
        success: true,
        data: mockTokenData,
        elapsed_ms: 200
      })

      // Mock Spotify token refresh
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user-read-email'
        })
      })

      const result = await getValidTokens(mockUserId)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://accounts.spotify.com/api/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      )
    })
  })

  describe('refreshTokens', () => {
    it('should successfully refresh tokens', async () => {
      // Mock database locking
      mockSupabaseClient.rpc.mockResolvedValue({ data: { success: true }, error: null })
      mockSupabaseClient.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })

      // Mock vault update
      vi.mocked(vaultHelpers.updateUserSecret).mockResolvedValue({
        success: true,
        data: mockTokenData,
        elapsed_ms: 150
      })

      // Mock cache
      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock successful Spotify response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user-read-email'
        })
      })

      const result = await refreshTokens(mockUserId, 'old-refresh-token')

      expect(result.success).toBe(true)
      expect(result.tokens).toBeDefined()
      expect(result.requires_reauth).toBe(false)
      expect(vaultHelpers.updateUserSecret).toHaveBeenCalled()
      expect(mockCache.set).toHaveBeenCalled()
    })

    it('should require reauth on invalid refresh token', async () => {
      // Mock database locking
      mockSupabaseClient.rpc.mockResolvedValue({ data: { success: true }, error: null })
      
      // Mock the from() chain for user updates (setting reauth flag)
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate
      })

      // Mock cache
      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock 401 response from Spotify
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        })
      })

      const result = await refreshTokens(mockUserId, 'invalid-refresh-token')

      expect(result.success).toBe(false)
      expect(result.requires_reauth).toBe(true)
      expect(result.error).toContain('Invalid refresh token')
      expect(mockCache.delete).toHaveBeenCalledWith(mockUserId)
      expect(mockUpdate).toHaveBeenCalledWith({ spotify_reauth_required: true })
    })

    it('should handle rate limiting from Spotify', async () => {
      // Mock database locking first
      mockSupabaseClient.rpc.mockResolvedValue({ data: { success: true }, error: null })
      
      // Mock 429 response from Spotify that includes retry-after header
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: {
          get: (header: string) => header === 'retry-after' ? '60' : null
        }
      })

      const result = await refreshTokens(mockUserId, 'test-refresh-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Spotify rate limited')
    })

    it('should require reauth on 400 invalid_request error', async () => {
      // Mock database locking
      mockSupabaseClient.rpc.mockResolvedValue({ data: { success: true }, error: null })
      
      // Mock the from() chain for user updates (setting reauth flag)
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockSupabaseClient.from.mockReturnValue({
        update: mockUpdate
      })

      // Mock cache
      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        getStats: vi.fn()
      }
      vi.mocked(tokenCache.getTokenCache).mockReturnValue(mockCache)

      // Mock 400 invalid_request response from Spotify (common when refresh token is expired)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'invalid_request',
          error_description: ''
        })
      })

      const result = await refreshTokens(mockUserId, 'expired-refresh-token')

      expect(result.success).toBe(false)
      expect(result.requires_reauth).toBe(true)
      expect(result.error).toContain('Invalid refresh token (400 invalid_request)')
      expect(mockCache.delete).toHaveBeenCalledWith(mockUserId)
      expect(mockUpdate).toHaveBeenCalledWith({ spotify_reauth_required: true })
    })
  })

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const metrics = getMetrics()

      expect(metrics).toHaveProperty('spotify_token_refresh_failed_total')
      expect(metrics).toHaveProperty('vault_write_total')
      expect(metrics).toHaveProperty('cache_hits')
      expect(metrics).toHaveProperty('cache_misses')
      expect(typeof metrics.spotify_token_refresh_failed_total).toBe('number')
    })
  })

  describe('healthCheck', () => {
    it('should return true when vault is accessible via RPC', async () => {
      // Mock successful RPC call to test_vault_count
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: 6, // Mock count of secrets in vault
        error: null 
      })

      const result = await healthCheck()

      expect(result).toBe(true)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('test_vault_count')
    })

    it('should return false when vault RPC call fails', async () => {
      // Mock RPC call error
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: null,
        error: { message: 'Connection failed' } 
      })

      const result = await healthCheck()

      expect(result).toBe(false)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('test_vault_count')
    })

    it('should return false when RPC returns invalid response format', async () => {
      // Mock RPC call with invalid response (not a number)
      mockSupabaseClient.rpc.mockResolvedValue({ 
        data: 'invalid', // Should be a number
        error: null 
      })

      const result = await healthCheck()

      expect(result).toBe(false)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('test_vault_count')
    })

    it('should handle unexpected errors during health check', async () => {
      // Mock RPC call throwing an exception
      mockSupabaseClient.rpc.mockRejectedValue(new Error('Network error'))

      const result = await healthCheck()

      expect(result).toBe(false)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('test_vault_count')
    })
  })
}) 