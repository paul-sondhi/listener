/**
 * Unit tests for packages/server/lib/spotify.ts
 * Tests the Spotify API token management functionality
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Type definitions for test utilities
interface MockTokenResponse {
  access_token: string
  expires_in: number
  token_type?: string
}

interface MockFetchResponse {
  ok: boolean
  status?: number
  json: () => Promise<MockTokenResponse>
  text?: () => Promise<string>
}

// Mock for querystring
const mockQsStringify = vi.fn() as MockInstance<[Record<string, string>], string>

vi.mock('querystring', () => ({
  __esModule: true,
  stringify: mockQsStringify,
  default: { stringify: mockQsStringify },
}))

// System Under Test will be imported dynamically
let getSpotifyAccessToken: () => Promise<string>

describe('Spotify Utilities', () => {
  describe('getSpotifyAccessToken', () => {
    const originalEnv = process.env
    let mockFetch: MockInstance<[string, any?], Promise<MockFetchResponse>>

    beforeEach(async () => {
      // Reset modules to ensure clean state
      vi.resetModules()

      // Create a mock for global fetch
      mockFetch = vi.fn() as MockInstance<[string, any?], Promise<MockFetchResponse>>
      global.fetch = mockFetch

      // Also override the global mockFetch to avoid conflicts
      if (global.mockFetch) {
        global.mockFetch = mockFetch
      }

      // Dynamically import the Spotify module to ensure fresh state
      const spotifyModule = await import('../spotify.js')
      getSpotifyAccessToken = spotifyModule.getSpotifyAccessToken

      // Reset local mocks
      mockFetch.mockReset()
      mockQsStringify.mockReset()
      mockQsStringify.mockReturnValue('grant_type=client_credentials')

      // Setup fake timers and test environment
      vi.useFakeTimers()
      process.env = {
        ...originalEnv,
        SPOTIFY_CLIENT_ID: 'test_client_id',
        SPOTIFY_CLIENT_SECRET: 'test_client_secret',
      }
    })

    afterEach(() => {
      // Restore environment and timers
      process.env = originalEnv
      vi.useRealTimers()
    })

    test('should fetch a new token if none is cached', async () => {
      // Arrange
      vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'))
      const mockTokenResponse: MockTokenResponse = { 
        access_token: 'new_fake_token', 
        expires_in: 3600 
      }
      const mockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => mockTokenResponse 
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const token = await getSpotifyAccessToken()

      // Assert
      expect(token).toBe('new_fake_token')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('https://accounts.spotify.com/api/token', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }))
      expect(mockQsStringify).toHaveBeenCalledWith({ grant_type: 'client_credentials' })
    })

    test('should return a cached token if it is still valid', async () => {
      // Arrange - First call to cache token
      vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'))
      const initialTokenResponse: MockTokenResponse = { 
        access_token: 'cached_token', 
        expires_in: 3600 
      }
      const initialMockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => initialTokenResponse 
      }
      mockFetch.mockResolvedValueOnce(initialMockResponse)
      await getSpotifyAccessToken() // Call 1: Caches 'cached_token'
      
      // Clear mocks after first call
      mockFetch.mockClear()
      mockQsStringify.mockClear()
      
      // Move time forward but within token validity
      vi.setSystemTime(new Date('2023-01-01T10:30:00.000Z'))

      // Act - Second call should use cache
      const token = await getSpotifyAccessToken()

      // Assert
      expect(token).toBe('cached_token')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockQsStringify).not.toHaveBeenCalled()
    })

    test('should fetch a new token if cached token is expired', async () => {
      // Arrange - First call to cache token
      vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'))
      const initialTokenResponse: MockTokenResponse = { 
        access_token: 'old_token', 
        expires_in: 3600 
      }
      const initialMockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => initialTokenResponse 
      }
      mockFetch.mockResolvedValueOnce(initialMockResponse)
      await getSpotifyAccessToken() // Call 1: Caches 'old_token'
      
      // Clear mocks and setup for second call
      mockFetch.mockClear()
      mockQsStringify.mockClear()
      mockQsStringify.mockReturnValue('grant_type=client_credentials')
      
      // Move time forward past token expiry
      vi.setSystemTime(new Date('2023-01-01T11:00:00.000Z'))
      
      const newTokenResponse: MockTokenResponse = { 
        access_token: 'refreshed_token', 
        expires_in: 3600 
      }
      const newMockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => newTokenResponse 
      }
      mockFetch.mockResolvedValueOnce(newMockResponse)

      // Act - Second call should fetch new token
      const token = await getSpotifyAccessToken()

      // Assert
      expect(token).toBe('refreshed_token')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockQsStringify).toHaveBeenCalledWith({ grant_type: 'client_credentials' })
    })

    test('should throw an error if SPOTIFY_CLIENT_ID is missing', async () => {
      // Arrange
      delete process.env.SPOTIFY_CLIENT_ID

      // Act & Assert
      await expect(getSpotifyAccessToken()).rejects.toThrow()
    })

    test('should throw an error if SPOTIFY_CLIENT_SECRET is missing', async () => {
      // Arrange
      delete process.env.SPOTIFY_CLIENT_SECRET

      // Act & Assert
      await expect(getSpotifyAccessToken()).rejects.toThrow()
    })

    test('should throw an error if fetching token fails', async () => {
      // Arrange
      vi.setSystemTime(new Date())
      const mockFailedResponse: MockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({ access_token: '', expires_in: 0 }),
        text: async () => 'Spotify API Error Response',
      }
      mockFetch.mockResolvedValueOnce(mockFailedResponse)

      // Act & Assert
      await expect(getSpotifyAccessToken()).rejects.toThrow('Failed to get Spotify access token')
    })

    test('token expiry calculation should refresh 1 minute early', async () => {
      // Arrange - Initial token fetch
      const currentTime = new Date('2023-01-01T12:00:00.000Z').getTime()
      vi.setSystemTime(currentTime)
      const expiresInSeconds = 300 // 5 minutes
      const tokenResponse: MockTokenResponse = { 
        access_token: 'token_for_expiry_test', 
        expires_in: expiresInSeconds 
      }
      const mockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => tokenResponse 
      }
      mockFetch.mockResolvedValueOnce(mockResponse)
      await getSpotifyAccessToken() // Call 1: Caches token
      
      // Clear mocks after initial fetch
      mockFetch.mockClear()
      mockQsStringify.mockClear()
      
      // Test time before early refresh (should use cache)
      const timeBeforeEarlyRefresh = currentTime + (expiresInSeconds * 1000) - 60000 - 1000
      vi.setSystemTime(new Date(timeBeforeEarlyRefresh))
      let token = await getSpotifyAccessToken()
      
      // Assert - Should use cached token
      expect(token).toBe('token_for_expiry_test')
      expect(mockFetch).not.toHaveBeenCalled()
      
      // Setup for early refresh test
      mockQsStringify.mockClear()
      mockQsStringify.mockReturnValue('grant_type=client_credentials')
      
      // Test time at early refresh threshold (should fetch new token)
      const timeAtEarlyRefresh = currentTime + (expiresInSeconds * 1000) - 60000 + 1000
      vi.setSystemTime(new Date(timeAtEarlyRefresh))
      
      const newTokenResponse: MockTokenResponse = { 
        access_token: 'new_token_after_early_refresh', 
        expires_in: 3600 
      }
      const newMockResponse: MockFetchResponse = { 
        ok: true, 
        json: async () => newTokenResponse 
      }
      mockFetch.mockResolvedValueOnce(newMockResponse)
      
      // Act - Should trigger early refresh
      token = await getSpotifyAccessToken()
      
      // Assert - Should fetch new token
      expect(token).toBe('new_token_after_early_refresh')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockQsStringify).toHaveBeenCalledTimes(1)
    })
  })
}) 