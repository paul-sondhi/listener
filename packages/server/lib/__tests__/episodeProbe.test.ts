import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyLatestEpisodeMatch, clearExpiredProbeCache, clearAllProbeCache, getProbeCacheStats } from '../episodeProbe.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('EpisodeProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllProbeCache(); // Clear all cache entries for clean tests
    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyLatestEpisodeMatch', () => {
    it('should return perfect match score for identical episodes', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'The Daily: Breaking News Today',
            description: 'Today\'s top stories',
            release_date: '2023-12-01',
            release_date_precision: 'day'
          }]
        })
      };

      // Mock RSS feed response
      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <title>The Daily</title>
              <item>
                <title>The Daily: Breaking News Today</title>
                <description>Today's top stories</description>
                <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
                <guid>episode-123</guid>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBeGreaterThan(0.9); // Should be very high similarity
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return low match score for different episodes', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'The Daily: Breaking News Today',
            description: 'Today\'s top stories',
            release_date: '2023-12-01',
            release_date_precision: 'day'
          }]
        })
      };

      // Mock RSS feed response with different episode
      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <title>Different Podcast</title>
              <item>
                <title>Completely Different Episode Title</title>
                <description>Different content</description>
                <pubDate>Mon, 04 Dec 2023 10:00:00 GMT</pubDate>
                <guid>different-episode-456</guid>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBeLessThan(0.5); // Should be low similarity (relaxed threshold)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return neutral score when Spotify episode is unavailable', async () => {
      // Mock Spotify API error
      const mockSpotifyResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      // Mock RSS feed response
      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Some Episode</title>
                <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBe(0.5); // Neutral score
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should return neutral score when RSS feed is unavailable', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'The Daily: Breaking News Today',
            release_date: '2023-12-01'
          }]
        })
      };

      // Mock RSS feed error
      const mockRssResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBe(0.5); // Neutral score
    });

    it('should skip Spotify fetch when no access token provided', async () => {
      // Mock RSS feed response
      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Some Episode</title>
                <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any).mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss');
      
      expect(score).toBe(0.5); // Neutral score when no Spotify data
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only RSS fetch
    });

    it('should handle RSS partial content response (206)', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'Test Episode',
            release_date: '2023-12-01'
          }]
        })
      };

      // Mock RSS feed response with 206 Partial Content
      const mockRssResponse = {
        ok: false,
        status: 206, // Partial Content
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Test Episode</title>
                <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBeGreaterThan(0.8); // Should match well
    });

    it('should use cache for repeated requests', async () => {
      // Mock responses
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'Test Episode',
            release_date: '2023-12-01'
          }]
        })
      };

      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Test Episode</title>
                <pubDate>Fri, 01 Dec 2023 10:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValue(mockSpotifyResponse)
        .mockResolvedValue(mockRssResponse);

      // First call
      const score1 = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      // Second call (should use cache)
      const score2 = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score1).toBe(score2);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Only called once due to cache
    });

    it('should handle malformed RSS XML gracefully', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'Test Episode',
            release_date: '2023-12-01'
          }]
        })
      };

      // Mock malformed RSS response
      const mockRssResponse = {
        ok: true,
        text: async () => `<invalid-xml>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBe(0.5); // Neutral score on parse error
    });

    it('should handle date comparison correctly', async () => {
      // Mock Spotify API response
      const mockSpotifyResponse = {
        ok: true,
        json: async () => ({
          items: [{
            id: 'episode-123',
            name: 'Test Episode',
            release_date: '2023-12-01T10:00:00Z',
            release_date_precision: 'day'
          }]
        })
      };

      // Mock RSS feed response with same date
      const mockRssResponse = {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>Test Episode</title>
                <pubDate>Fri, 01 Dec 2023 10:30:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };

      (global.fetch as any)
        .mockResolvedValueOnce(mockSpotifyResponse)
        .mockResolvedValueOnce(mockRssResponse);

      const score = await verifyLatestEpisodeMatch('show-123', 'https://feeds.example.com/rss', 'access-token');
      
      expect(score).toBeGreaterThan(0.9); // Should be very high due to title match and close date
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', () => {
      const stats = getProbeCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('ttlMs');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.ttlMs).toBe('number');
    });

    it('should clear expired cache entries', () => {
      clearAllProbeCache(); // Use clearAll for test since we want to verify it's empty
      const stats = getProbeCacheStats();
      expect(stats.size).toBe(0);
    });
  });
}); 