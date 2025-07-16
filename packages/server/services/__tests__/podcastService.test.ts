/**
 * Unit tests for packages/server/services/podcastService.ts
 * Tests the podcast service functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Type definitions for test utilities
interface _MockResponse {
  ok: boolean
  status: number
  json: () => Promise<any>
  text: () => Promise<string>
}

interface MockRssData {
  rss: {
    channel: {
      title?: string
      item?: any
    }
  }
}

// Mock dependencies first without using variables
vi.mock('../../lib/utils.js', () => ({
  getTitleSlug: vi.fn(),
  getFeedUrl: vi.fn(),
}))

// Import the service and error class
import podcastService, { PodcastError } from '../podcastService.js'

// Mock global fetch used by fetchRssFeed
const mockFetch = vi.fn() as MockInstance
vi.stubGlobal('fetch', mockFetch)

// Import modules after mocking to get the mocked versions
let mockGetTitleSlug: MockInstance
let mockGetFeedUrl: MockInstance

// Dynamically import the mocked functions after hoisting
beforeEach(async () => {
  const utilsModule = await import('../../lib/utils.js')
  mockGetTitleSlug = utilsModule.getTitleSlug as unknown as MockInstance
  mockGetFeedUrl = utilsModule.getFeedUrl as unknown as MockInstance
})

describe('PodcastService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default successful fetch for most tests, can be overridden per test
    mockFetch.mockResolvedValue({ 
      ok: true, 
      text: async () => '<rss>content</rss>', 
      status: 200
    })
  })

  describe('validateSpotifyUrl', () => {
    it('should return true for valid Spotify show URLs', () => {
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/show/123ABCxyz')).toBe(true)
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/show/123ABCxyz?si=test')).toBe(true)
    })

    it('should return false for invalid URLs', () => {
      expect(podcastService.validateSpotifyUrl('http://open.spotify.com/show/123')).toBe(false)
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/episode/123')).toBe(false)
      expect(podcastService.validateSpotifyUrl('https://example.com')).toBe(false)
    })
  })

  describe('getPodcastSlug', () => {
    it('should return slug from getTitleSlug', async () => {
      // Arrange
      mockGetTitleSlug.mockResolvedValue({
        name: 'test-slug',
        originalName: 'Test Slug',
        description: 'Test podcast description',
        publisher: 'Test Publisher',
        spotifyShowId: 'test-show-id',
        accessToken: 'test-access-token'
      })

      // Act
      const slug = await podcastService.getPodcastSlug('valid-url')

      // Assert
      expect(slug).toBe('test-slug')
      expect(mockGetTitleSlug).toHaveBeenCalledWith('valid-url')
    })

    it('should throw PodcastError if getTitleSlug fails', async () => {
      // Arrange
      mockGetTitleSlug.mockRejectedValue(new Error('API down'))

      // Act & Assert
      await expect(podcastService.getPodcastSlug('valid-url'))
        .rejects.toThrow(new PodcastError('Failed to get podcast slug: API down', 500))
    })
  })

  describe('getPodcastFeed', () => {
    it('should return feed URL from getFeedUrl if valid', async () => {
      // Arrange
      mockGetFeedUrl.mockResolvedValue('http://example.com/feed')

      // Act
      const feedUrl = await podcastService.getPodcastFeed('test-slug')

      // Assert
      expect(feedUrl).toBe('http://example.com/feed')
      expect(mockGetFeedUrl).toHaveBeenCalledWith('test-slug')
    })

    it('should throw PodcastError if getFeedUrl returns no URL (Spotify-exclusive)', async () => {
      // Arrange
      mockGetFeedUrl.mockResolvedValue(null)

      // Act & Assert
      await expect(podcastService.getPodcastFeed('exclusive-slug'))
        .rejects.toThrow(new PodcastError('Failed to get podcast feed: Podcast has no public RSS; probably Spotify-exclusive.', 502))
    })

    it('should throw PodcastError if getFeedUrl itself throws', async () => {
      // Arrange
      mockGetFeedUrl.mockRejectedValue(new Error('Network error'))

      // Act & Assert
      await expect(podcastService.getPodcastFeed('test-slug'))
        .rejects.toThrow(new PodcastError('Failed to get podcast feed: Network error', 502))
    })
  })

  describe('fetchRssFeed', () => {
    it('should return RSS text on successful fetch', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({ 
        ok: true, 
        text: async () => '<rss>content</rss>', 
        status: 200
      })

      // Act
      const rssText = await podcastService.fetchRssFeed('http://example.com/feed')

      // Assert
      expect(rssText).toBe('<rss>content</rss>')
      expect(mockFetch).toHaveBeenCalledWith('http://example.com/feed')
    })

    it('should throw PodcastError if fetch is not ok', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({ 
        ok: false, 
        status: 404, 
        statusText: 'Not Found',
        text: async () => ''
      })

      // Act & Assert
      await expect(podcastService.fetchRssFeed('http://example.com/feed'))
        .rejects.toThrow(new PodcastError('Failed to fetch RSS feed: Failed to fetch RSS: 404', 502))
    })

    it('should throw PodcastError if fetch itself fails (e.g., network error)', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      // Act & Assert
      await expect(podcastService.fetchRssFeed('http://example.com/feed'))
        .rejects.toThrow(new PodcastError('Failed to fetch RSS feed: Connection refused', 502))
    })
  })

  describe('parseRssFeed', () => {
    it('should parse valid RSS text', () => {
      // Arrange
      const rssText = '<rss><channel><title>Test</title></channel></rss>'

      // Act
      const parsed = podcastService.parseRssFeed(rssText) as MockRssData

      // Assert
      expect(parsed.rss.channel.title).toBe('Test')
    })

    it('should throw PodcastError for invalid RSS text', () => {
      // Act & Assert - Updated to match the actual error message format
      expect(() => podcastService.parseRssFeed('<invalid-xml'))
        .toThrow(new PodcastError("Failed to parse RSS feed: Cannot read properties of undefined (reading 'tagName')", 500))
    })
  })

  describe('extractMp3Url', () => {
    it('should extract MP3 URL from enclosure @_url', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: { 
            title: 'Test Podcast',
            description: 'Test Description',
            item: { 
              enclosure: { 
                '@_url': 'http://example.com/track.mp3' 
              } 
            } 
          } 
        } 
      }

      // Act & Assert
      expect(podcastService.extractMp3Url(rssData as any)).toBe('http://example.com/track.mp3')
    })

    it('should extract MP3 URL from enclosure.url if @_url is missing', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: { 
            title: 'Test Podcast',
            description: 'Test Description',
            item: { 
              enclosure: { 
                url: 'http://example.com/track.mp3' 
              } 
            } 
          } 
        } 
      }

      // Act & Assert
      expect(podcastService.extractMp3Url(rssData as any)).toBe('http://example.com/track.mp3')
    })
    
    it('should extract MP3 URL from the first item if item is an array', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: { 
            title: 'Test Podcast',
            description: 'Test Description',
            item: [
              { enclosure: { '@_url': 'http://example.com/track1.mp3' } }, 
              { enclosure: { '@_url': 'http://example.com/track2.mp3' } }
            ] 
          } 
        } 
      }

      // Act & Assert
      expect(podcastService.extractMp3Url(rssData as any)).toBe('http://example.com/track1.mp3')
    })

    it('should throw PodcastError if no enclosure URL is found', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: { 
            title: 'Test Podcast',
            description: 'Test Description',
            item: { 
              enclosure: {} 
            } 
          } 
        } 
      }

      // Act & Assert
      expect(() => podcastService.extractMp3Url(rssData as any))
        .toThrow(new PodcastError('Failed to extract MP3 URL: No enclosure URL found in first item', 500))
    })

    it('should throw PodcastError if enclosure is missing', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: { 
            title: 'Test Podcast',
            description: 'Test Description',
            item: {} 
          } 
        } 
      }

      // Act & Assert
      expect(() => podcastService.extractMp3Url(rssData as any))
        .toThrow(new PodcastError('Failed to extract MP3 URL: No enclosure URL found in first item', 500))
    })

    it('should throw PodcastError if item is missing', () => {
      // Arrange
      const rssData = { 
        rss: { 
          channel: {
            title: 'Test Podcast',
            description: 'Test Description'
          } 
        } 
      }

      // Act & Assert
      expect(() => podcastService.extractMp3Url(rssData as any))
        .toThrow(new PodcastError('Failed to extract MP3 URL: No items found in RSS feed', 500))
    })
  })
}) 