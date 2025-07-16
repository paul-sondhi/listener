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
  publisher?: string
}

interface MockPodcastIndexFeed {
  id: number
  title: string
  url: string
  description?: string
  author?: string
  ownerName?: string
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
const mockGetSpotifyAccessToken = vi.fn() as MockInstance

vi.mock('../spotify.js', () => ({
  getSpotifyAccessToken: mockGetSpotifyAccessToken,
}))

// System Under Test functions will be imported dynamically
let getAuthHeaders: () => { 'X-Auth-Key': string; 'X-Auth-Date': string; 'Authorization': string }
let getTitleSlug: (url: string) => Promise<{ name: string, description: string, publisher: string }>
let getFeedUrl: (slug: string) => Promise<string | null>
let jaccardSimilarity: (a: string, b: string) => number

describe('Utility Functions', () => {
  let mockFetch: MockInstance

  beforeEach(async () => {
    // Reset modules to ensure clean state
    vi.resetModules()

    // Create a mock for global fetch with proper type casting
    mockFetch = vi.fn() as MockInstance
    global.fetch = mockFetch as unknown as typeof fetch

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
    test('should return correct metadata for a valid Spotify show URL', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ 
          name: 'My Awesome Show | Podcasts',
          description: 'This is a great podcast about technology',
          publisher: 'The New York Times'
        } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const result = await getTitleSlug('https://open.spotify.com/show/12345ABC?si=xyz')

      // Assert
      expect(mockGetSpotifyAccessToken).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/shows/12345ABC',
        { headers: { Authorization: 'Bearer fake_spotify_token' } }
      )
      expect(result).toEqual({
        name: 'my awesome show',
        originalName: 'My Awesome Show | Podcasts',
        description: 'This is a great podcast about technology',
        publisher: 'The New York Times',
        spotifyShowId: '12345ABC',
        accessToken: 'fake_spotify_token'
      })
    })

    test('should handle show names with emojis and extra text', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ 
          name: '🎉 My Show Title 😊 | Some Other Text',
          description: 'A fun podcast about life',
          publisher: 'Fun Media Co'
        } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const result = await getTitleSlug('https://open.spotify.com/show/67890DEF?si=abc')

      // Assert
      expect(result).toEqual({
        name: 'my show title',
        originalName: '🎉 My Show Title 😊 | Some Other Text',
        description: 'A fun podcast about life',
        publisher: 'Fun Media Co',
        spotifyShowId: '67890DEF',
        accessToken: 'fake_spotify_token'
      })
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

    test('should handle shows without descriptions', async () => {
      // Arrange
      mockGetSpotifyAccessToken.mockResolvedValue('fake_spotify_token')
      const mockResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ 
          name: 'Show Without Description',
          // No description field
          publisher: 'Test Publisher'
        } as MockSpotifyShow),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      // Act
      const result = await getTitleSlug('https://open.spotify.com/show/noDescriptionShow')

      // Assert
      expect(result).toEqual({
        name: 'show without description',
        originalName: 'Show Without Description',
        description: '',
        publisher: 'Test Publisher',
        spotifyShowId: 'noDescriptionShow',
        accessToken: 'fake_spotify_token'
      })
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
    const podcastIndexBytitleUrl = `https://api.podcastindex.org/api/1.0/search/bytitle?q=${encodeURIComponent(testSlug)}`
    const podcastIndexBytermUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(testSlug)}`
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
      expect(mockFetch).toHaveBeenCalledWith(podcastIndexBytitleUrl, expect.objectContaining({
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
      const mockPodcastIndexBytitleResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockPodcastIndexBytermResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockiTunesResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [{ feedUrl: 'https://itunes.com/feed' }],
        } as MockiTunesResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytitleResponse)
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytermResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://itunes.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(mockFetch).toHaveBeenNthCalledWith(1, podcastIndexBytitleUrl, expect.any(Object))
      expect(mockFetch).toHaveBeenNthCalledWith(2, podcastIndexBytermUrl, expect.any(Object))
      expect(mockFetch).toHaveBeenNthCalledWith(3, itunesApiUrl)
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
      const mockPodcastIndexBytitleResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockPodcastIndexBytermResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockiTunesResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] } as MockiTunesResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytitleResponse)
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytermResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    test('should return null if PodcastIndex has no feeds and iTunes API call fails', async () => {
      // Arrange
      const mockPodcastIndexBytitleResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockPodcastIndexBytermResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ feeds: [], status: 'ok', count: 0 } as unknown as MockPodcastIndexResponse),
      }
      const mockiTunesFailedResponse: MockFetchResponse = {
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'iTunes API Error',
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytitleResponse)
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytermResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesFailedResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    test('should handle PodcastIndex returning malformed data (no feeds array) and fallback to iTunes', async () => {
      // Arrange
      const mockPodcastIndexBytitleResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({ status: 'ok' }), // Missing feeds array
      }
      const mockPodcastIndexBytermResponse: MockFetchResponse = {
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
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytitleResponse)
      mockFetch.mockResolvedValueOnce(mockPodcastIndexBytermResponse)
      mockFetch.mockResolvedValueOnce(mockiTunesResponse)

      // Act
      const feedUrl = await getFeedUrl(testSlug)

      // Assert
      expect(feedUrl).toBe('https://itunes.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    test('should use enhanced matching with metadata object input', async () => {
      // Arrange
      const metadata = {
        name: 'the daily',
        description: 'This is how the news should sound. The Daily from The New York Times.',
        publisher: 'The New York Times'
      }
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'The Daily', 
              url: 'https://feeds.podtrac.com/zKq6WZZLTlbM',
              description: 'The Daily from The New York Times',
              author: 'The New York Times'
            },
            { 
              title: 'The Daily', 
              url: 'https://feeds.simplecast.com/Xf9Hoa6w',
              description: 'A different podcast about daily news',
              author: 'Different Publisher'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert
      // Should pick the first feed (NYT one) because it has better description match
      expect(feedUrl).toBe('https://feeds.podtrac.com/zKq6WZZLTlbM')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should handle metadata object with empty description', async () => {
      // Arrange
      const metadata = {
        name: 'test podcast',
        description: ''
      }
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [{ title: 'test podcast', url: 'https://podcastindex.com/feed' }],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert
      expect(feedUrl).toBe('https://podcastindex.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should maintain backward compatibility with string input', async () => {
      // Arrange
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [{ title: 'my test podcast', url: 'https://podcastindex.com/feed' }],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl('my test podcast')

      // Assert
      expect(feedUrl).toBe('https://podcastindex.com/feed')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should correctly match "The Daily" with enhanced metadata matching', async () => {
      // Arrange: Real "The Daily" metadata from Spotify
      const theDailyMetadata = {
        name: 'The Daily',
        description: 'This is how the news should sound. The Daily brings you the biggest stories of our time, told by the best journalists in the world.'
      }
      
      // Arrange: Real PodcastIndex response with multiple "The Daily" feeds
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'The Daily', 
              url: 'https://feeds.podtrac.com/zKq6WZZLTlbM',
              description: 'The Daily from The New York Times'
            },
            { 
              title: 'The Daily', 
              url: 'https://feeds.simplecast.com/Xf9Hoa6w',
              description: 'A different podcast about daily news'
            },
            { 
              title: 'The Daily Show', 
              url: 'https://feeds.comedycentral.com/daily-show',
              description: 'Comedy Central\'s The Daily Show'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(theDailyMetadata)

      // Assert: Should pick the NYT feed because it has the best combined title + description match
      expect(feedUrl).toBe('https://feeds.podtrac.com/zKq6WZZLTlbM')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should fallback to first result when no high-confidence match found', async () => {
      // Arrange: Metadata for a podcast that doesn't have a clear match
      const metadata = {
        name: 'obscure podcast name',
        description: 'A very specific description that won\'t match any feeds well'
      }
      
      // Arrange: PodcastIndex response with low-similarity feeds
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'completely different podcast', 
              url: 'https://feeds.example.com/different.rss',
              description: 'This has nothing to do with the search'
            },
            { 
              title: 'another unrelated podcast', 
              url: 'https://feeds.example.com/unrelated.rss',
              description: 'Also completely unrelated'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert: Should fallback to first result since no match meets 0.8 threshold
      expect(feedUrl).toBe('https://feeds.example.com/different.rss')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should use publisher weighting in enhanced matching', async () => {
      // Arrange: Test case where publisher match makes the difference
      const metadata = {
        name: 'morning show',
        description: 'Daily news and updates',
        publisher: 'NPR'
      }
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'Morning Show', 
              url: 'https://feeds.example.com/generic-morning',
              description: 'Generic morning show content',
              author: 'Generic Media'
            },
            { 
              title: 'Morning Show', 
              url: 'https://feeds.npr.org/morning-show',
              description: 'Daily news and updates',
              author: 'NPR'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert: Should pick the NPR feed because of publisher match boosting the score
      expect(feedUrl).toBe('https://feeds.npr.org/morning-show')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('should use episode probe to boost matching feed when Spotify data available', async () => {
      // Arrange: Test case where episode probe makes the difference
      const metadata = {
        name: 'test show',
        description: 'Test description',
        publisher: 'Test Publisher',
        spotifyShowId: 'show-123',
        accessToken: 'spotify-token'
      }
      
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'Test Show', 
              url: 'https://feeds.example.com/wrong-feed',
              description: 'Test description',
              author: 'Test Publisher'
            },
            { 
              title: 'Test Show', 
              url: 'https://feeds.example.com/correct-feed',
              description: 'Test description',
              author: 'Test Publisher'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      
      // Mock Spotify episode responses (for episode probe)
      const mockSpotifyEpisode = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'Latest Episode Title',
            release_date: '2023-12-01'
          }]
        })
      }
      
      // Mock RSS responses - first feed has different episode, second has matching episode
      const mockRssWrongFeed = {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss><channel><item>
            <title>Different Episode</title>
            <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
          </item></channel></rss>`
      }
      
      const mockRssCorrectFeed = {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss><channel><item>
            <title>Latest Episode Title</title>
            <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
          </item></channel></rss>`
      }
      
      // Set up fetch mock sequence: PodcastIndex, then Spotify episodes, then RSS feeds
      mockFetch
        .mockResolvedValueOnce(mockPodcastIndexResponse) // PodcastIndex search
        .mockResolvedValueOnce(mockSpotifyEpisode) // Spotify episode for first feed
        .mockResolvedValueOnce(mockRssWrongFeed) // RSS for first feed
        .mockResolvedValueOnce(mockSpotifyEpisode) // Spotify episode for second feed
        .mockResolvedValueOnce(mockRssCorrectFeed) // RSS for second feed

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert: Should pick the correct feed due to episode probe boost
      expect(feedUrl).toBe('https://feeds.example.com/correct-feed')
      expect(mockFetch).toHaveBeenCalledTimes(5) // 1 PodcastIndex + 2 Spotify + 2 RSS
    })

    test('should handle episode probe gracefully when it fails', async () => {
      // Arrange: Test case where episode probe fails but matching still works
      const metadata = {
        name: 'test show',
        description: 'Test description',
        publisher: 'Test Publisher',
        spotifyShowId: 'show-123',
        accessToken: 'spotify-token'
      }
      
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'Test Show', 
              url: 'https://feeds.example.com/test-feed',
              description: 'Test description',
              author: 'Test Publisher'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      
      // Mock Spotify episode to fail
      const mockSpotifyError = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }
      
      mockFetch
        .mockResolvedValueOnce(mockPodcastIndexResponse) // PodcastIndex search
        .mockResolvedValueOnce(mockSpotifyError) // Spotify episode fails
        .mockResolvedValueOnce(mockSpotifyError) // RSS fetch also attempted

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert: Should still return the feed despite probe failure
      expect(feedUrl).toBe('https://feeds.example.com/test-feed')
      expect(mockFetch).toHaveBeenCalledTimes(3) // 1 PodcastIndex + 1 failed Spotify + 1 RSS attempt
    })

    test('regression test: "The Daily" should match correct RSS feed (simplecast vs podtrac)', async () => {
      // Arrange: Regression test for the specific "The Daily" mismatch issue
      const metadata = {
        name: 'the daily',
        description: 'This is how the news should sound. The Daily from The New York Times.',
        publisher: 'The New York Times'
        // Note: No spotifyShowId/accessToken to test pure publisher matching without episode probe
      }
      
      const mockPodcastIndexResponse: MockFetchResponse = {
        ok: true,
        json: async () => ({
          feeds: [
            { 
              title: 'The Daily', 
              url: 'https://feeds.simplecast.com/XThpxTzR', // Wrong feed
              description: 'The Daily from some other source',
              author: 'Different Publisher'
            },
            { 
              title: 'The Daily', 
              url: 'https://feeds.simplecast.com/54nAGcIl', // Correct feed
              description: 'This is how the news should sound. The Daily from The New York Times.',
              author: 'The New York Times'
            }
          ],
        } as MockPodcastIndexResponse),
      }
      
      mockFetch.mockResolvedValueOnce(mockPodcastIndexResponse)

      // Act
      const feedUrl = await getFeedUrl(metadata)

      // Assert: Should pick the correct New York Times feed due to publisher matching
      expect(feedUrl).toBe('https://feeds.simplecast.com/54nAGcIl')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
}) 