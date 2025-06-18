/**
 * Unit Tests for Episode Sync Service
 * 
 * This test suite provides comprehensive coverage of the EpisodeSyncService
 * including RSS feed fetching, parsing, episode upserts, and error handling.
 * 
 * Test Coverage:
 * - Successful upsert of new episode
 * - No duplicate when episode already exists
 * - Update when metadata changes
 * - Retry logic fires on first fetch failure
 * - Respect of 2025-06-15 cutoff filter
 * - RSS feed parsing edge cases
 * - Database error handling
 * - Network error scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set up environment variables before importing the service
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { EpisodeSyncService } from './episodeSyncService.js';

// Mock implementations using vi.hoisted to ensure proper initialization
const { 
  mockSupabaseClient,
  mockLogger,
  mockFetch
} = vi.hoisted(() => ({
  mockSupabaseClient: {
    from: vi.fn(),
    rpc: vi.fn()
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  mockFetch: vi.fn()
}));

// Mock external dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

// Mock global fetch
global.fetch = mockFetch;

/**
 * Test Data Factory for Episode Sync Service
 * Creates consistent test data for various scenarios
 */
class EpisodeSyncTestDataFactory {
  /**
   * Create a mock podcast show
   */
  static createMockShow(overrides: any = {}) {
    return {
      id: 'show-123',
      spotify_url: 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB',
      title: 'Test Podcast Show',
      rss_url: 'https://feeds.example.com/test-podcast',
      etag: '"abc123"',
      last_modified: 'Wed, 15 Jan 2025 12:00:00 GMT',
      last_checked_episodes: '2025-01-15T12:00:00Z',
      ...overrides
    };
  }

  /**
   * Create a mock RSS feed XML
   */
  static createMockRssFeed(episodes: any[] = []) {
    const episodeItems = episodes.map(episode => `
      <item>
        <title><![CDATA[${episode.title || 'Test Episode'}]]></title>
        <description><![CDATA[${episode.description || 'Test episode description'}]]></description>
        <pubDate>${episode.pubDate || 'Wed, 15 Jun 2025 12:00:00 GMT'}</pubDate>
        <guid isPermaLink="false">${episode.guid || 'episode-123'}</guid>
        <enclosure url="${episode.enclosureUrl || 'https://example.com/episode.mp3'}" type="audio/mpeg" length="12345678"/>
        <itunes:duration>${episode.duration || '30:45'}</itunes:duration>
      </item>
    `).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Test Podcast Show</title>
        <description>A test podcast for unit testing</description>
        ${episodeItems}
      </channel>
    </rss>`;
  }

  /**
   * Create expected episode data
   */
  static createExpectedEpisodeData(overrides: any = {}) {
    return {
      show_id: 'show-123',
      guid: 'episode-123',
      episode_url: 'https://example.com/episode.mp3',
      title: 'Test Episode',
      description: 'Test episode description',
      pub_date: '2025-06-15T12:00:00.000Z',
      duration_sec: 1845, // 30:45 in seconds
      ...overrides
    };
  }

  /**
   * Create a successful database query response
   */
  static createSuccessfulDbResponse(data: any = []) {
    return { data, error: null };
  }

  /**
   * Create a database error response
   */
  static createDbErrorResponse(message: string = 'Database error') {
    return { data: null, error: { message } };
  }
}

/**
 * Test Suite: Episode Sync Service Core Functionality
 */
describe('EpisodeSyncService', () => {
  let episodeSyncService: EpisodeSyncService;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Create service instance with mocked dependencies
    episodeSyncService = new EpisodeSyncService(
      'https://test.supabase.co',
      'test-service-role-key',
      mockLogger
    );

    // Setup default successful responses
    mockSupabaseClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse([
            EpisodeSyncTestDataFactory.createMockShow()
          ]))
        }),
        upsert: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse()),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test successful upsert of new episode
   * Verifies that new episodes are correctly parsed and inserted into the database
   */
  describe('Successful upsert of new episode', () => {
    it('should successfully sync and upsert a new episode', async () => {
      // Arrange: Set up RSS feed with new episode
      const newEpisode = {
        title: 'New Episode',
        description: 'A brand new episode',
        pubDate: 'Wed, 15 Jun 2025 15:00:00 GMT',
        guid: 'new-episode-456',
        enclosureUrl: 'https://example.com/new-episode.mp3',
        duration: '45:30'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([newEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"new-etag-456"'],
          ['last-modified', 'Wed, 15 Jun 2025 15:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock successful database operations
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse()
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify successful sync
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1);

      // Assert: Verify episode was upserted with correct data
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'new-episode-456',
          episode_url: 'https://example.com/new-episode.mp3',
          title: 'New Episode',
          description: 'A brand new episode',
          pub_date: '2025-06-15T15:00:00.000Z',
          duration_sec: 2730 // 45:30 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );

      // Assert: Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting episode sync for all shows with active subscriptions'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully synced show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123',
          episodesUpserted: 1
        })
      );
    });
  });

  /**
   * Test no duplicate when episode already exists
   * Verifies that existing episodes are not duplicated in the database
   */
  describe('No duplicate when episode already exists', () => {
    it('should not create duplicate episodes when they already exist', async () => {
      // Arrange: Set up RSS feed with existing episode
      const existingEpisode = {
        title: 'Existing Episode',
        description: 'An episode that already exists',
        pubDate: 'Wed, 15 Jun 2025 10:00:00 GMT',
        guid: 'existing-episode-123',
        enclosureUrl: 'https://example.com/existing-episode.mp3',
        duration: '25:15'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([existingEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"same-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 10:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock database operations - upsert returns episodes.length (the service always returns episodes.length)
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse()
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync completed - the service returns episodes.length regardless of whether they're new or existing
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1); // Service returns episodes.length, not affected rows

      // Assert: Verify upsert was called with correct data
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'existing-episode-123',
          episode_url: 'https://example.com/existing-episode.mp3',
          title: 'Existing Episode',
          description: 'An episode that already exists',
          pub_date: '2025-06-15T10:00:00.000Z',
          duration_sec: 1515 // 25:15 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );

      // Assert: Verify logging shows the episode was processed
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully synced show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123',
          episodesUpserted: 1
        })
      );
    });
  });

  /**
   * Test update when metadata changes
   * Verifies that episode metadata is updated when it changes in the RSS feed
   */
  describe('Update when metadata changes', () => {
    it('should update episode metadata when it changes in RSS feed', async () => {
      // Arrange: Set up RSS feed with updated episode metadata
      const updatedEpisode = {
        title: 'Updated Episode Title',
        description: 'Updated episode description with new content',
        pubDate: 'Wed, 15 Jun 2025 14:00:00 GMT',
        guid: 'episode-update-789',
        enclosureUrl: 'https://example.com/updated-episode.mp3',
        duration: '35:20'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([updatedEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"updated-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 14:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock database operations - upsert returns 1 affected row (updated episode)
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse([{ id: 'episode-update-789' }])
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify successful sync with updated episode
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1);

      // Assert: Verify episode was upserted with updated metadata
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'episode-update-789',
          episode_url: 'https://example.com/updated-episode.mp3',
          title: 'Updated Episode Title',
          description: 'Updated episode description with new content',
          pub_date: '2025-06-15T14:00:00.000Z',
          duration_sec: 2120 // 35:20 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );
    });
  });

  /**
   * Test retry logic fires on first fetch failure
   * Verifies that the service retries RSS feed fetching when the first attempt fails
   */
  describe('Retry logic fires on first fetch failure', () => {
    it('should retry RSS feed fetch after initial failure', async () => {
      // Arrange: Set up RSS feed for successful retry
      const retryEpisode = {
        title: 'Retry Episode',
        description: 'Episode fetched after retry',
        pubDate: 'Wed, 15 Jun 2025 16:00:00 GMT',
        guid: 'retry-episode-999',
        enclosureUrl: 'https://example.com/retry-episode.mp3',
        duration: '20:30'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([retryEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock first fetch failure, then successful retry
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([
            ['etag', '"retry-etag"'],
            ['last-modified', 'Wed, 15 Jun 2025 16:00:00 GMT']
          ]),
          text: () => Promise.resolve(rssXml)
        });

      // Mock successful database operations
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse([{ id: 'retry-episode-999' }])
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify successful sync after retry
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1);

      // Assert: Verify fetch was called twice (initial + retry)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Assert: Verify episode was upserted after successful retry
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'retry-episode-999',
          episode_url: 'https://example.com/retry-episode.mp3',
          title: 'Retry Episode',
          description: 'Episode fetched after retry',
          pub_date: '2025-06-15T16:00:00.000Z',
          duration_sec: 1230 // 20:30 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );

      // Assert: Verify retry warning was logged (actual message format)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Fetch attempt 1 failed for show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123',
          error: 'Network timeout'
        })
      );
    });
  });

  /**
   * Test respect of 2025-06-15 cutoff filter
   * Verifies that episodes published before the cutoff date are filtered out
   */
  describe('Respect of 2025-06-15 cutoff filter', () => {
    it('should filter out episodes published before 2025-06-15', async () => {
      // Arrange: Set up RSS feed with episodes before and after cutoff
      const oldEpisode = {
        title: 'Old Episode',
        description: 'Episode from before cutoff date',
        pubDate: 'Mon, 14 Jun 2025 12:00:00 GMT', // Before cutoff
        guid: 'old-episode-123',
        enclosureUrl: 'https://example.com/old-episode.mp3',
        duration: '15:00'
      };

      const newEpisode = {
        title: 'New Episode',
        description: 'Episode from after cutoff date',
        pubDate: 'Sun, 15 Jun 2025 12:00:00 GMT', // On cutoff date
        guid: 'new-episode-456',
        enclosureUrl: 'https://example.com/new-episode.mp3',
        duration: '20:00'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([oldEpisode, newEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"cutoff-etag"'],
          ['last-modified', 'Sun, 15 Jun 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock successful database operations
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse([{ id: 'new-episode-456' }])
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify successful sync with only new episode
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1);

      // Assert: Verify only the new episode was upserted (old episode filtered out)
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'new-episode-456',
          episode_url: 'https://example.com/new-episode.mp3',
          title: 'New Episode',
          description: 'Episode from after cutoff date',
          pub_date: '2025-06-15T12:00:00.000Z',
          duration_sec: 1200 // 20:00 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );

      // Assert: Verify logging shows only valid episodes were found
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Found 1 episodes for show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123'
        })
      );
    });
  });

  /**
   * Test RSS parsing edge cases
   * Verifies that the service handles malformed or edge case RSS feeds gracefully
   */
  describe('RSS parsing edge cases', () => {
    it('should handle RSS feed with missing episode fields gracefully', async () => {
      // Arrange: Set up RSS feed with incomplete episode data
      const incompleteRssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
        <channel>
          <title>Test Podcast Show</title>
          <description>A test podcast for unit testing</description>
          <item>
            <title><![CDATA[Episode with Missing Fields]]></title>
            <!-- Missing description, pubDate, enclosure -->
            <guid isPermaLink="false">incomplete-episode-123</guid>
          </item>
          <item>
            <!-- Missing title and guid -->
            <description><![CDATA[Episode with missing title and guid]]></description>
            <pubDate>Wed, 15 Jun 2025 12:00:00 GMT</pubDate>
            <enclosure url="https://example.com/no-title.mp3" type="audio/mpeg" length="12345"/>
          </item>
        </channel>
      </rss>`;
      
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"incomplete-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve(incompleteRssXml)
      });

      // Mock successful database operations
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createSuccessfulDbResponse([])
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync completed - episodes with missing enclosure URLs are filtered out but valid ones are processed
      expect(result.success).toBe(true);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(1);
      expect(result.failedShows).toBe(0);
      expect(result.totalEpisodesUpserted).toBe(1); // One episode has enclosure URL

      // Assert: Verify upsert was called with the valid episode (second one has enclosure)
      expect(mockUpsert).toHaveBeenCalledWith([
        {
          show_id: 'show-123',
          guid: expect.any(String), // Generated from timestamp since no title or guid
          episode_url: 'https://example.com/no-title.mp3',
          title: null,
          description: 'Episode with missing title and guid',
          pub_date: '2025-06-15T12:00:00.000Z',
          duration_sec: null
        }
      ], {
        onConflict: 'show_id,guid',
        ignoreDuplicates: false
      });

      // Assert: Verify warning was logged about failed episode parsing
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse episode item',
        expect.objectContaining({
          error: 'No episode URL found in enclosure'
        })
      );
    });

    it('should handle malformed XML gracefully', async () => {
      // Arrange: Set up malformed RSS XML that will definitely fail parsing
      const malformedXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Podcast Show</title>
          <description>A test podcast</description>
          <item>
            <title>Test Episode</title>
            <description>Test description
            <!-- Unclosed CDATA and malformed tags -->
            <![CDATA[Unclosed CDATA section
          </item>
        </channel>
      </rss>`;
      
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch with malformed XML
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"malformed-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve(malformedXml)
      });

      // Mock successful database operations
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync failed due to malformed XML
      expect(result.success).toBe(false);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(0);
      expect(result.failedShows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].showId).toBe('show-123');
      expect(result.errors[0].error).toContain('Failed to parse RSS feed');

      // Assert: Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync show'),
        expect.any(Error),
        expect.objectContaining({
          showId: 'show-123'
        })
      );
    });
  });

  /**
   * Test database error handling
   * Verifies that the service handles database errors gracefully
   */
  describe('Database error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Arrange: Set up successful RSS feed but database error
      const validEpisode = {
        title: 'Valid Episode',
        description: 'Episode that should sync but database fails',
        pubDate: 'Wed, 15 Jun 2025 12:00:00 GMT',
        guid: 'valid-episode-123',
        enclosureUrl: 'https://example.com/valid-episode.mp3',
        duration: '30:00'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([validEpisode]);

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"db-error-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock database error when fetching shows
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createDbErrorResponse('Connection to database failed')
            )
          })
        })
      });

      // Act & Assert: Sync all shows should throw an exception
      await expect(episodeSyncService.syncAllShows()).rejects.toThrow(
        'Episode sync failed: Failed to query shows with subscriptions: Connection to database failed'
      );

      // Assert: Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Episode sync failed with exception',
        expect.any(Error)
      );
    });

    it('should handle episode upsert errors gracefully', async () => {
      // Arrange: Set up successful RSS feed but upsert error
      const validEpisode = {
        title: 'Valid Episode',
        description: 'Episode that parses correctly but fails to upsert',
        pubDate: 'Wed, 15 Jun 2025 12:00:00 GMT',
        guid: 'upsert-fail-456',
        enclosureUrl: 'https://example.com/upsert-fail.mp3',
        duration: '25:30'
      };
      
      const rssXml = EpisodeSyncTestDataFactory.createMockRssFeed([validEpisode]);
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock successful RSS fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"upsert-error-etag"'],
          ['last-modified', 'Wed, 15 Jun 2025 12:00:00 GMT']
        ]),
        text: () => Promise.resolve(rssXml)
      });

      // Mock successful show fetch but failed upsert
      const mockUpsert = vi.fn().mockResolvedValue(
        EpisodeSyncTestDataFactory.createDbErrorResponse('Unique constraint violation')
      );
      
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        upsert: mockUpsert,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync failed due to upsert error
      expect(result.success).toBe(false);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(0);
      expect(result.failedShows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].showId).toBe('show-123');
      expect(result.errors[0].error).toContain('Failed to upsert episodes');

      // Assert: Verify upsert was attempted
      expect(mockUpsert).toHaveBeenCalledWith(
        [{
          show_id: 'show-123',
          guid: 'upsert-fail-456',
          episode_url: 'https://example.com/upsert-fail.mp3',
          title: 'Valid Episode',
          description: 'Episode that parses correctly but fails to upsert',
          pub_date: '2025-06-15T12:00:00.000Z',
          duration_sec: 1530 // 25:30 in seconds
        }],
        {
          onConflict: 'show_id,guid',
          ignoreDuplicates: false
        }
      );

      // Assert: Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync show'),
        expect.any(Error),
        expect.objectContaining({
          showId: 'show-123'
        })
      );
    });
  });

  /**
   * Test network error scenarios  
   * Verifies that the service handles network errors and timeouts gracefully
   */
  describe('Network error scenarios', () => {
    it('should handle network timeout errors', async () => {
      // Arrange: Set up network timeout scenario
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock network timeout on both fetch attempts (service tries 2 times)
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'));

      // Mock successful database operations
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync failed due to network timeout
      expect(result.success).toBe(false);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(0);
      expect(result.failedShows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].showId).toBe('show-123');
      expect(result.errors[0].error).toContain('Network timeout');

      // Assert: Verify fetch was attempted twice (retry logic)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Assert: Verify retry warnings were logged (actual message format)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Fetch attempt 1 failed for show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123',
          error: 'Network timeout'
        })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Fetch attempt 2 failed for show: Test Podcast Show',
        expect.objectContaining({
          showId: 'show-123',
          error: 'Network timeout'
        })
      );
    });

    it('should handle HTTP error responses', async () => {
      // Arrange: Set up HTTP error response
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock HTTP 404 error response - first attempt
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: {
            get: () => null
          },
          text: () => Promise.resolve('RSS feed not found')
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: {
            get: () => null
          },
          text: () => Promise.resolve('RSS feed not found')
        });

      // Mock successful database operations
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync failed due to HTTP error
      expect(result.success).toBe(false);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(0);
      expect(result.failedShows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].showId).toBe('show-123');
      expect(result.errors[0].error).toContain('HTTP 404');

      // Assert: Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync show'),
        expect.any(Error),
        expect.objectContaining({
          showId: 'show-123'
        })
      );
    });

    it('should handle DNS resolution errors', async () => {
      // Arrange: Set up DNS resolution error
      const mockShow = EpisodeSyncTestDataFactory.createMockShow();

      // Mock DNS resolution error
      mockFetch
        .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND feeds.example.com'))
        .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND feeds.example.com'));

      // Mock successful database operations
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(
              EpisodeSyncTestDataFactory.createSuccessfulDbResponse([mockShow])
            )
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(EpisodeSyncTestDataFactory.createSuccessfulDbResponse())
        })
      });

      // Act: Sync all shows
      const result = await episodeSyncService.syncAllShows();

      // Assert: Verify sync failed due to DNS error
      expect(result.success).toBe(false);
      expect(result.totalShows).toBe(1);
      expect(result.successfulShows).toBe(0);
      expect(result.failedShows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].showId).toBe('show-123');
      expect(result.errors[0].error).toContain('getaddrinfo ENOTFOUND');

      // Assert: Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync show'),
        expect.any(Error),
        expect.objectContaining({
          showId: 'show-123'
        })
      );
    });
  });

  /**
   * Test service initialization and configuration
   * Verifies that the service initializes correctly with different configurations
   */
  describe('Service initialization', () => {
    it('should throw error when Supabase credentials are missing', () => {
      // Arrange: Clear environment variables
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Act & Assert: Verify error is thrown
      expect(() => {
        new EpisodeSyncService();
      }).toThrow('Supabase URL and service role key are required');

      // Cleanup: Restore environment variables
      if (originalUrl) process.env.SUPABASE_URL = originalUrl;
      if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });

    it('should initialize successfully with provided credentials', () => {
      // Act: Create service with explicit credentials
      const service = new EpisodeSyncService(
        'https://test.supabase.co',
        'test-service-role-key',
        mockLogger
      );

      // Assert: Verify service was created
      expect(service).toBeInstanceOf(EpisodeSyncService);
    });

    it('should use default logger when none provided', () => {
      // Act: Create service without logger
      const service = new EpisodeSyncService(
        'https://test.supabase.co',
        'test-service-role-key'
      );

      // Assert: Verify service was created (default logger is used internally)
      expect(service).toBeInstanceOf(EpisodeSyncService);
    });
  });
}); 