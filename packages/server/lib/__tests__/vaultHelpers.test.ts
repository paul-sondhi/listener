/**
 * Unit tests for packages/server/lib/vaultHelpers.ts
 * Tests the vault helper functions with proper mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { storeUserSecret, createUserSecret, updateUserSecret, getUserSecret, vaultHealthCheck } from '../vaultHelpers.js'

// Mock Supabase client
const mockSupabaseRpc = vi.fn()
const mockSupabaseFrom = vi.fn()
const mockSupabaseSelect = vi.fn()
const mockSupabaseUpdate = vi.fn()
const mockSupabaseEq = vi.fn()
const mockSupabaseSingle = vi.fn()

// Mock the Supabase client creation
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockSupabaseRpc,
    from: mockSupabaseFrom,
    auth: {
      getUser: vi.fn()
    }
  }))
}))

// Mock environment variables
const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key'
  }
  
  // Clear all mocks
  vi.clearAllMocks()
  mockSupabaseRpc.mockReset()
  mockSupabaseFrom.mockReset()
  mockSupabaseSelect.mockReset()
  mockSupabaseUpdate.mockReset()
  mockSupabaseEq.mockReset()
  mockSupabaseSingle.mockReset()
  
  // Set up the default method chaining for .from().select().eq().single()
  mockSupabaseSingle.mockResolvedValue({ data: null, error: null })
  mockSupabaseEq.mockReturnValue({ single: mockSupabaseSingle })
  mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq })
  mockSupabaseFrom.mockReturnValue({ 
    select: mockSupabaseSelect,
    update: mockSupabaseUpdate 
  })
  
  // Set up the default method chaining for .from().update().eq()
  mockSupabaseUpdate.mockReturnValue({ eq: mockSupabaseEq })
})

afterEach(() => {
  process.env = originalEnv
})

describe('vaultHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when vault RPC functions exist and work correctly', async () => {
    // Arrange - Mock expected "Secret not found" error which indicates vault is working
    mockSupabaseRpc.mockResolvedValue({
      error: { message: 'Secret not found or inaccessible: 00000000-0000-0000-0000-000000000000' }
    })

    // Act
    const result = await vaultHealthCheck()

    // Assert
    expect(result).toBe(true)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_read_user_secret', {
      p_secret_id: '00000000-0000-0000-0000-000000000000'
    })
  })

  it('should return false when vault RPC functions do not exist', async () => {
    // Arrange - Mock "function does not exist" error
    mockSupabaseRpc.mockResolvedValue({
      error: { message: 'function vault_read_user_secret does not exist' }
    })

    // Act
    const result = await vaultHealthCheck()

    // Assert
    expect(result).toBe(false)
  })

  it('should return false when vault operations fail with unexpected errors', async () => {
    // Arrange - Mock unexpected error
    mockSupabaseRpc.mockResolvedValue({
      error: { message: 'Connection timeout' }
    })

    // Act
    const result = await vaultHealthCheck()

    // Assert
    expect(result).toBe(false)
  })

  it('should return false when an exception is thrown', async () => {
    // Arrange - Mock exception
    mockSupabaseRpc.mockRejectedValue(new Error('Network error'))

    // Act
    const result = await vaultHealthCheck()

    // Assert
    expect(result).toBe(false)
  })

  it('should return true when no error occurs (unexpected but valid)', async () => {
    // Arrange - Mock no error (unexpected but should be handled)
    mockSupabaseRpc.mockResolvedValue({ error: null })

    // Act
    const result = await vaultHealthCheck()

    // Assert
    expect(result).toBe(true)
  })
})

describe('storeUserSecret', () => {
  const mockUserId = 'test-user-123'
  const mockTokenData = {
    access_token: 'test_access',
    refresh_token: 'test_refresh',
    expires_at: 1234567890,
    token_type: 'Bearer',
    scope: 'test-scope'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call updateUserSecret when user has existing vault secret ID', async () => {
    // Arrange - Mock user with existing secret ID
    mockSupabaseSingle.mockResolvedValue({
      data: { spotify_vault_secret_id: 'existing-secret-id' },
      error: null
    })
    mockSupabaseRpc.mockResolvedValue({
      data: true,
      error: null
    })

    // Act
    const result = await storeUserSecret(mockUserId, mockTokenData)

    // Assert
    expect(result.success).toBe(true)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_update_user_secret', {
      p_secret_id: 'existing-secret-id',
      p_secret_data: JSON.stringify(mockTokenData)
    })
  })

  it('should call createUserSecret when user has no existing vault secret ID', async () => {
    // Arrange - Reset and setup mocks specifically for this test
    vi.clearAllMocks()
    
    // Set up the method chaining for .from().select().eq().single()
    mockSupabaseSingle.mockResolvedValue({
      data: { spotify_vault_secret_id: null },
      error: null
    })
    mockSupabaseEq.mockReturnValue({ single: mockSupabaseSingle })
    mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq })
    
    // Set up the method chaining for .from().update().eq()  
    const mockEqForUpdate = vi.fn().mockResolvedValue({ error: null })
    mockSupabaseUpdate.mockReturnValue({ eq: mockEqForUpdate })
    
    // Set up the from() method to return both select and update
    mockSupabaseFrom.mockReturnValue({ 
      select: mockSupabaseSelect,
      update: mockSupabaseUpdate 
    })
    
    // Mock RPC calls for vault operations
    mockSupabaseRpc.mockResolvedValueOnce({
      data: 'new-secret-id',
      error: null
    })

    // Act
    const result = await storeUserSecret(mockUserId, mockTokenData)

    // Assert
    expect(result.success).toBe(true)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_create_user_secret', {
      p_secret_name: `spotify:${mockUserId}:tokens`,
      p_secret_data: JSON.stringify(mockTokenData),
      p_description: `Spotify tokens for user ${mockUserId}`
    })
  })

  it('should handle errors gracefully', async () => {
    // Arrange - Mock error
    mockSupabaseSingle.mockRejectedValue(new Error('Database error'))

    // Act
    const result = await storeUserSecret(mockUserId, mockTokenData)

    // Assert
    expect(result.success).toBe(false)
    expect(result.error).toBe('Database error')
    expect(typeof result.elapsed_ms).toBe('number')
  })
})

describe('createUserSecret', () => {
  const mockUserId = 'test-user-123'
  const mockTokenData = {
    access_token: 'test_access',
    refresh_token: 'test_refresh',
    expires_at: 1234567890,
    token_type: 'Bearer',
    scope: 'test-scope'
  }

  it('should create a new secret successfully', async () => {
    const secretId = 'new-secret-id'

    // Mock RPC create secret
    mockSupabaseRpc.mockResolvedValueOnce({
      data: secretId,
      error: null
    })

    // Mock user update
    mockSupabaseEq.mockResolvedValue({ error: null })
    mockSupabaseUpdate.mockReturnValue({ eq: mockSupabaseEq })
    mockSupabaseFrom.mockReturnValue({ update: mockSupabaseUpdate })

    const result = await createUserSecret(mockUserId, mockTokenData)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockTokenData)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_create_user_secret', {
      p_secret_name: `spotify:${mockUserId}:tokens`,
      p_secret_data: JSON.stringify(mockTokenData),
      p_description: `Spotify tokens for user ${mockUserId}`
    })
  })
})

describe('updateUserSecret', () => {
  const mockUserId = 'test-user-123'
  const mockTokenData = {
    access_token: 'test_access',
    refresh_token: 'test_refresh',
    expires_at: 1234567890,
    token_type: 'Bearer',
    scope: 'test-scope'
  }

  it('should update existing secret successfully', async () => {
    const existingSecretId = 'existing-secret-id'

    // Mock user lookup
    mockSupabaseSingle.mockResolvedValue({
      data: { spotify_vault_secret_id: existingSecretId },
      error: null
    })
    mockSupabaseEq.mockReturnValue({ single: mockSupabaseSingle })
    mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq })
    mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect })

    // Mock RPC update secret
    mockSupabaseRpc.mockResolvedValueOnce({
      data: true,
      error: null
    })

    const result = await updateUserSecret(mockUserId, mockTokenData)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockTokenData)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_update_user_secret', {
      p_secret_id: existingSecretId,
      p_secret_data: JSON.stringify(mockTokenData)
    })
  })
})

describe('getUserSecret', () => {
  const mockUserId = 'test-user-123'
  const mockTokenData = {
    access_token: 'test_access',
    refresh_token: 'test_refresh',
    expires_at: 1234567890,
    token_type: 'Bearer',
    scope: 'test-scope'
  }

  it('should retrieve secret successfully', async () => {
    const existingSecretId = 'existing-secret-id'

    // Mock user lookup
    mockSupabaseSingle.mockResolvedValue({
      data: { spotify_vault_secret_id: existingSecretId },
      error: null
    })
    mockSupabaseEq.mockReturnValue({ single: mockSupabaseSingle })
    mockSupabaseSelect.mockReturnValue({ eq: mockSupabaseEq })
    mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect })

    // Mock RPC read secret
    mockSupabaseRpc.mockResolvedValueOnce({
      data: JSON.stringify(mockTokenData),
      error: null
    })

    const result = await getUserSecret(mockUserId)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(mockTokenData)
    expect(mockSupabaseRpc).toHaveBeenCalledWith('vault_read_user_secret', {
      p_secret_id: existingSecretId
    })
  })
}) 