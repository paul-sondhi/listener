import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { storeUserSecret, createUserSecret, updateUserSecret, getUserSecret, SpotifyTokenData } from '../vaultHelpers.js'

// Mock the Supabase client
const mockSupabaseClient = {
  rpc: vi.fn(),
  from: vi.fn()
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}))

// Mock environment variables
const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key'
  }
  
  // Clear all mocks
  vi.clearAllMocks()
  mockSupabaseClient.rpc.mockReset()
  mockSupabaseClient.from.mockReset()
})

afterEach(() => {
  process.env = originalEnv
})

describe('VaultHelpers', () => {
  const mockUserId = 'test-user-id'
  const mockTokenData: SpotifyTokenData = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    token_type: 'Bearer',
    scope: 'user-read-email'
  }

  describe('storeUserSecret', () => {
    it('should create a new secret when user has no existing secret ID', async () => {
      // Mock no existing secret ID
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { spotify_vault_secret_id: null },
            error: null
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock RPC create secret
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: 'new-secret-id',
        error: null
      })

      // Mock user update
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect })
        .mockReturnValueOnce({ update: mockUpdate })

      const result = await storeUserSecret(mockUserId, mockTokenData)

      expect(result.success).toBe(true)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_create_user_secret', {
        p_secret_name: `spotify:${mockUserId}:tokens`,
        p_secret_data: JSON.stringify(mockTokenData),
        p_description: `Spotify tokens for user ${mockUserId}`
      })
    })

    it('should update existing secret when user has a secret ID', async () => {
      const existingSecretId = 'existing-secret-id'

      // Mock existing secret ID - called twice (once in storeUserSecret, once in updateUserSecret)
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { spotify_vault_secret_id: existingSecretId },
            error: null
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock RPC update secret
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: true,
        error: null
      })

      const result = await storeUserSecret(mockUserId, mockTokenData)

      expect(result.success).toBe(true)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_update_user_secret', {
        p_secret_id: existingSecretId,
        p_secret_data: JSON.stringify(mockTokenData)
      })
    })

    it('should handle user lookup errors gracefully', async () => {
      // Mock user lookup error
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'User not found' }
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock create secret fallback
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: 'new-secret-id',
        error: null
      })

      // Mock user update
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockSupabaseClient.from.mockReturnValueOnce({ select: mockSelect })
        .mockReturnValueOnce({ update: mockUpdate })

      const result = await storeUserSecret(mockUserId, mockTokenData)

      // Should fall back to create since no existing secret ID
      expect(result.success).toBe(true)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_create_user_secret', expect.any(Object))
    })

    it('should handle vault operation failures', async () => {
      // Mock no existing secret ID
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { spotify_vault_secret_id: null },
            error: null
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock RPC create secret failure
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Vault operation failed' }
      })

      const result = await storeUserSecret(mockUserId, mockTokenData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Vault operation failed')
    })
  })

  describe('createUserSecret', () => {
    it('should create a new secret successfully', async () => {
      const secretId = 'new-secret-id'

      // Mock RPC create secret
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: secretId,
        error: null
      })

      // Mock user update
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
      mockSupabaseClient.from.mockReturnValue({ update: mockUpdate })

      const result = await createUserSecret(mockUserId, mockTokenData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTokenData)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_create_user_secret', {
        p_secret_name: `spotify:${mockUserId}:tokens`,
        p_secret_data: JSON.stringify(mockTokenData),
        p_description: `Spotify tokens for user ${mockUserId}`
      })
    })
  })

  describe('updateUserSecret', () => {
    it('should update existing secret successfully', async () => {
      const existingSecretId = 'existing-secret-id'

      // Mock user lookup
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { spotify_vault_secret_id: existingSecretId },
            error: null
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock RPC update secret
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: true,
        error: null
      })

      const result = await updateUserSecret(mockUserId, mockTokenData)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTokenData)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_update_user_secret', {
        p_secret_id: existingSecretId,
        p_secret_data: JSON.stringify(mockTokenData)
      })
    })
  })

  describe('getUserSecret', () => {
    it('should retrieve secret successfully', async () => {
      const existingSecretId = 'existing-secret-id'

      // Mock user lookup
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { spotify_vault_secret_id: existingSecretId },
            error: null
          })
        })
      })
      mockSupabaseClient.from.mockReturnValue({ select: mockSelect })

      // Mock RPC read secret
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: JSON.stringify(mockTokenData),
        error: null
      })

      const result = await getUserSecret(mockUserId)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTokenData)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('vault_read_user_secret', {
        p_secret_id: existingSecretId
      })
    })
  })
}) 