/**
 * Unit tests for packages/server/lib/utils.ts
 * Tests utility functions for podcast data processing
 */

import crypto from 'crypto'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Type definitions for test utilities
interface MockSpotifyShow {
  id: string
  name: string
  description?: string
}

interface MockPodcastIndexFeed {
  id: number
  title: string
  url: string
  description?: string
}

interface MockPodcastIndexResponse {
  status: string
  feeds: MockPodcastIndexFeed[]
  count: number
}

interface MockiTunesResult {
  feedUrl: string
  trackName: string
  artistName: string
}

interface MockiTunesResponse {
  resultCount: number
  results: MockiTunesResult[]
}

interface MockFetchResponse {
  ok: boolean
  status?: number
  statusText?: string
  json: () => Promise<any>
  text?: () => Promise<string>
}

// Mock for the spotify module
const mockGetSpotifyAccessToken = vi.fn() as MockInstance<[], Promise<string>>

vi.mock('../spotify.js', () => ({
  getSpotifyAccessToken: mockGetSpotifyAccessToken,
}))

// System Under Test functions will be imported dynamically
let getAuthHeaders: () => { 'X-Auth-Key': string; 'X-Auth-Date': string; 'Authorization': string }
let getTitleSlug: (url: string) => Promise<string>
let getFeedUrl: (slug: string) => Promise<string | null>
let jaccardSimilarity: (a: string, b: string) => number

describe('Utility Functions', () => {
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

    // Dynamically import the utils module to ensure fresh state
    const utilsModule = await import('../utils.js')
    getAuthHeaders = utilsModule.getAuthHeaders
    getTitleSlug = utilsModule.getTitleSlug
    getFeedUrl = utilsModule.getFeedUrl
    jaccardSimilarity = utilsModule.jaccardSimilarity

    // Reset the Spotify mock
    mockGetSpotifyAccessToken.mockReset()
    mockFetch.mockReset()
  })

  describe('jaccardSimilarity', () => {
    test('should return 1 for identical strings', () => {
      expect(jaccardSimilarity('hello world', 'hello world')).toBe(1)
    })

    test('should return 0 for completely different strings', () => {
      expect(jaccardSimilarity('hello', 'world')).toBe(0)
    })

    test('should return a value between 0 and 1 for partially similar strings', () => {
      const similarity = jaccardSimilarity('hello javascript', 'hello world')
      expect(similarity).toBeCloseTo(1/3)
    })

    test('should return 1 for empty strings', () => {
      expect(jaccardSimilarity('', '')).toBe(1)
    })

    test('should return 0 if one string is empty', () => {
      expect(jaccardSimilarity('abc', '')).toBe(0)
    })

    test('should be case-sensitive', () => {
      expect(jaccardSimilarity('Hello', 'hello')).toBe(0)
    })

    test('should handle special characters', () => {
      expect(jaccardSimilarity('test!ep@1', 'test!ep@1')).toBe(1)
    })
  })

  describe('getAuthHeaders', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        PODCASTINDEX_KEY: 'testkey',
        PODCASTINDEX_SECRET: 'testsecret',
      }
      vi.setSystemTime(new Date(1678886400000)) // 2023-03-15T12:00:00.000Z
    })

    afterEach(() => {
      process.env = originalEnv
      vi.useRealTimers()
    })

    test('should return correct authentication headers', () => {
      const headers = getAuthHeaders()
      const expectedTime = '1678886400'
      const expectedSignature = crypto
        .createHash('sha1')
        .update('testkeytestsecret' + expectedTime)
        .digest('hex')
        
      expect(headers['X-Auth-Key']).toBe('testkey')
      expect(headers['X-Auth-Date']).toBe(expectedTime)
      expect(headers['Authorization']).toBe(expectedSignature)
    })

    test('should throw an error if PODCASTINDEX_KEY is missing', () => {
      delete process.env.PODCASTINDEX_KEY
      expect(() => getAuthHeaders()).toThrow('PodcastIndex API Key/Secret is missing')
    })

    test('should throw an error if PODCASTINDEX_SECRET is missing', () => {
      delete process.env.PODCASTINDEX_SECRET
      expect(() => getAuthHeaders()).toThrow('PodcastIndex API Key/Secret is missing')
    })
  })

  describe('getTitleSlug', () => {
    test('should return correct slug for a valid Spotify show URL', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ name: 'My Awesome Show | Podcasts' } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const slug = await getTitleSlug('https://open.spotify.com/show/12345ABC?si=xyz')

      // Assert
      expect(mockGetSpotifyAccessToken).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/shows/12345ABC',
        { headers: { Authorization: 'Bearer fake_spotify_token' } }
      )
      expect(slug).toBe('my awesome show')
    })

    test('should handle show names with emojis and extra text', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ name: '🎉 My Show Title 😊 | Some Other Text' } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const slug = await getTitleSlug('https://open.spotify.com/show/67890DEF?si=abc')

      // Assert
      expect(slug).toBe('my show title')
    })

    test('should throw error if URL is not a Spotify show link', async () => {
      // Act & Assert
      await expect(getTitleSlug('https://example.com/not-spotify')).rejects.toThrow('getTitleSlug: URL is not a Spotify show link')
    })

    test('should throw error if Spotify API call fails', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({}),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act & Assert
      await expect(getTitleSlug('https://open.spotify.com/show/errorShow')).rejects.toThrow('Failed to fetch show from Spotify API')
    })

    test('should throw error if Spotify API returns no show name', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ id: 'anIdButNoName' } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act & Assert
      await expect(getTitleSlug('https://open.spotify.com/show/noNameShow')).rejects.toThrow('No show name returned from Spotify API')
    })
  })

  describe('getFeedUrl', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        PODCASTINDEX_KEY: 'test_podcast_key',
        PODCASTINDEX_SECRET: 'test_podcast_secret',
        USER_AGENT: 'Test User Agent',
      }
      vi.setSystemTime(new Date(1678886400000))
    })

    afterEach(() => {
      process.env = originalEnv
      vi.useRealTimers()
    })

    const testSlug = 'my test podcast'
    const podcastIndexApiUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(testSlug)}`
    const itunesApiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(testSlug)}&media=podcast&limit=1`

    test('should return feed URL from PodcastIndex if a good match is found', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [{ title: 'my test podcast', url: 'https://podcastindex.com/feed' }],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://podcastindex.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(podcastIndexApiUrl, expect.objectContaining({
        headers: expect.objectContaining({
          'X-Auth-Key': 'test_podcast_key',
          'User-Agent': 'Test User Agent',
        }),
      }))
    })

    test('should return first feed URL from PodcastIndex if no specific match has similarity >= 0.8', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { title: 'different podcast name', url: 'https://podcastindex.com/feed1' },
            { title: 'another podcast', url: 'https://podcastindex.com/feed2' },
          ],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://podcastindex.com/feed1')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should fallback to iTunes if PodcastIndex returns no feeds', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [] } as MockPodcastIndexResponse),
      }
      const mockiTunesResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [{ feedUrl: 'https://itunes.com/feed' }],
        } as MockiTunesResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://itunes.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(1, podcastIndexApiUrl, expect.any(Object))
      expect(mockFetch).toHaveBeenNthCalledWith(2, itunesApiUrl)
    })

    test('should throw error from PodcastIndex if it fails and not call iTunes', async () => {
      // Arrange
      const mockFailedResponse: MockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'PodcastIndex API Error Response',
      }
      mockFetch.mockResolvedValueOnce(mockFailedResponse)

      // Act & Assert
      await expect(getFeedUrl(testSlug)).rejects.toThrow('PodcastIndex search failed with status 500')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should return null if PodcastIndex has no feeds and iTunes has no results', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [] } as MockPodcastIndexResponse),
      }
      const mockiTunesResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] } as MockiTunesResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test('should return null if PodcastIndex has no feeds and iTunes API call fails', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [] } as MockPodcastIndexResponse),
      }
      const mockiTunesFailedResponse: MockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({}),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesFailedResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test('should handle PodcastIndex returning malformed data (no feeds array) and fallback to iTunes', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ status: 'ok' }), // Missing feeds array
      }
      const mockiTunesResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [{ feedUrl: 'https://itunes.com/feed' }],
        } as MockiTunesResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://itunes.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
}) 