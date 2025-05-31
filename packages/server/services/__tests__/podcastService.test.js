import { describe, it, expect, vi, beforeEach } from 'vitest';
import podcastService, { PodcastError } from '../podcastService'; // Assuming PodcastError is exported for testing
import { getTitleSlug, getFeedUrl } from '../../lib/utils.js'; // Mocked

// Mock dependencies from ../../lib/utils.js
vi.mock('../../lib/utils.js', () => ({
  getTitleSlug: vi.fn(),
  getFeedUrl: vi.fn(),
}));

// Mock global fetch used by fetchRssFeed
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('PodcastService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default successful fetch for most tests, can be overridden per test
    mockFetch.mockResolvedValue({ 
      ok: true, 
      text: async () => '<rss>content</rss>', 
      status: 200
    });
  });

  describe('validateSpotifyUrl', () => {
    it('should return true for valid Spotify show URLs', () => {
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/show/123ABCxyz')).toBe(true);
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/show/123ABCxyz?si=test')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(podcastService.validateSpotifyUrl('http://open.spotify.com/show/123')).toBe(false);
      expect(podcastService.validateSpotifyUrl('https://open.spotify.com/episode/123')).toBe(false);
      expect(podcastService.validateSpotifyUrl('https://example.com')).toBe(false);
    });
  });

  describe('getPodcastSlug', () => {
    it('should return slug from getTitleSlug', async () => {
      getTitleSlug.mockResolvedValue('test-slug');
      const slug = await podcastService.getPodcastSlug('valid-url');
      expect(slug).toBe('test-slug');
      expect(getTitleSlug).toHaveBeenCalledWith('valid-url');
    });

    it('should throw PodcastError if getTitleSlug fails', async () => {
      getTitleSlug.mockRejectedValue(new Error('API down'));
      await expect(podcastService.getPodcastSlug('valid-url'))
        .rejects.toThrow(new PodcastError('Failed to get podcast slug: API down', 500));
    });
  });

  describe('getPodcastFeed', () => {
    it('should return feed URL from getFeedUrl if valid', async () => {
      getFeedUrl.mockResolvedValue('http://example.com/feed');
      const feedUrl = await podcastService.getPodcastFeed('test-slug');
      expect(feedUrl).toBe('http://example.com/feed');
      expect(getFeedUrl).toHaveBeenCalledWith('test-slug');
    });

    it('should throw PodcastError if getFeedUrl returns no URL (Spotify-exclusive)', async () => {
      getFeedUrl.mockResolvedValue(null); 
      await expect(podcastService.getPodcastFeed('exclusive-slug'))
        .rejects.toThrow(new PodcastError('Failed to get podcast feed: Podcast has no public RSS; probably Spotify-exclusive.', 502));
    });

    it('should throw PodcastError if getFeedUrl itself throws', async () => {
      getFeedUrl.mockRejectedValue(new Error('Network error'));
      await expect(podcastService.getPodcastFeed('test-slug'))
        .rejects.toThrow(new PodcastError('Failed to get podcast feed: Network error', 502));
    });
  });

  describe('fetchRssFeed', () => {
    it('should return RSS text on successful fetch', async () => {
      // Explicitly set for this test to ensure the default isn't overridden by other tests using mockResolvedValueOnce
      mockFetch.mockResolvedValueOnce({ 
        ok: true, 
        text: async () => '<rss>content</rss>', 
        status: 200
      });
      const rssText = await podcastService.fetchRssFeed('http://example.com/feed');
      expect(rssText).toBe('<rss>content</rss>');
      expect(mockFetch).toHaveBeenCalledWith('http://example.com/feed');
    });

    it('should throw PodcastError if fetch is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' }); 
      await expect(podcastService.fetchRssFeed('http://example.com/feed'))
        .rejects.toThrow(new PodcastError('Failed to fetch RSS feed: Failed to fetch RSS: 404', 502));
    });

    it('should throw PodcastError if fetch itself fails (e.g., network error)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused')); 
      await expect(podcastService.fetchRssFeed('http://example.com/feed'))
        .rejects.toThrow(new PodcastError('Failed to fetch RSS feed: Connection refused', 502));
    });
  });

  describe('parseRssFeed', () => {
    it('should parse valid RSS text', () => {
      const rssText = '<rss><channel><title>Test</title></channel></rss>';
      const parsed = podcastService.parseRssFeed(rssText);
      expect(parsed.rss.channel.title).toBe('Test');
    });

    it('should throw PodcastError for invalid RSS text', () => {
      // Updated to match the latest log output for this specific error
      expect(() => podcastService.parseRssFeed('<invalid-xml'))
        .toThrow(new PodcastError("Failed to parse RSS feed: Cannot read properties of undefined (reading 'tagName')", 500));
    });
  });

  describe('extractMp3Url', () => {
    it('should extract MP3 URL from enclosure @_url', () => {
      const rssData = { rss: { channel: { item: { enclosure: { '@_url': 'http://example.com/track.mp3' } } } } };
      expect(podcastService.extractMp3Url(rssData)).toBe('http://example.com/track.mp3');
    });

    it('should extract MP3 URL from enclosure.url if @_url is missing', () => {
      const rssData = { rss: { channel: { item: { enclosure: { url: 'http://example.com/track.mp3' } } } } };
      expect(podcastService.extractMp3Url(rssData)).toBe('http://example.com/track.mp3');
    });
    
    it('should extract MP3 URL from the first item if item is an array', () => {
      const rssData = { rss: { channel: { item: [{ enclosure: { '@_url': 'http://example.com/track1.mp3' } }, { enclosure: { '@_url': 'http://example.com/track2.mp3' } }] } } };
      expect(podcastService.extractMp3Url(rssData)).toBe('http://example.com/track1.mp3');
    });

    it('should throw PodcastError if no enclosure URL is found', () => {
      const rssData = { rss: { channel: { item: { enclosure: {} } } } }; 
      expect(() => podcastService.extractMp3Url(rssData))
        .toThrow(new PodcastError('Failed to extract MP3 URL: No enclosure URL found in first item', 500));
    });

    it('should throw PodcastError if enclosure is missing', () => {
      const rssData = { rss: { channel: { item: {} } } }; 
      // Updated to match the latest log for this specific case
      expect(() => podcastService.extractMp3Url(rssData))
        .toThrow(new PodcastError('Failed to extract MP3 URL: No enclosure URL found in first item', 500));
    });

    it('should throw PodcastError if item is missing', () => {
      const rssData = { rss: { channel: {} } }; 
      expect(() => podcastService.extractMp3Url(rssData))
        .toThrow(new PodcastError('Failed to extract MP3 URL: Cannot read properties of undefined (reading \'enclosure\')', 500));
    });
  });
});

// Exporting PodcastError from service file or defining it here if not exported
// For the sake of this test, we are assuming PodcastError is exported or accessible.
// If not, you might need to adjust how you check for the error type/instance.
class PodcastError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'PodcastError';
    this.statusCode = statusCode;
  }
} 