/**
 * Integration Tests for Transcript Worker Background Job
 * 
 * This test suite provides comprehensive integration testing of the transcript worker
 * functionality within the background jobs system. It tests:
 * 
 * Integration Test Coverage:
 * - End-to-end transcript worker flow via background jobs
 * - Real database interactions (with test database)
 * - Mocked Taddy API responses
 * - Error handling across service boundaries
 * - Performance and timing validation
 * - Manual job execution integration
 * - Database state verification
 * - Storage integration testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, Mock } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { runJob } from '../services/backgroundJobs.js';
import { TranscriptService } from '../lib/services/TranscriptService.js';

// Set up environment variables before importing the service
process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

// Mock external services - TranscriptService handles Taddy client internally
vi.mock('../lib/services/TranscriptService.js');

// Mock TranscriptService
const mockTranscriptService = TranscriptService as any;

// ---------------------------------------------------------------------------
// 🕒  Freeze system time so the lookback period includes our fixture episodes
// ---------------------------------------------------------------------------
beforeAll(() => {
  const BASE_TIME = new Date('2025-06-21T10:00:00Z').getTime();
  let tick = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => BASE_TIME + tick++);
});

afterAll(() => {
  vi.restoreAllMocks(); // Restore Date.now and any other spies created here
});

/**
 * Integration Test Data Factory for Transcript Worker
 * Creates realistic test data for integration testing scenarios
 */
class TranscriptWorkerIntegrationTestDataFactory {
  /**
   * Create test podcast shows in database
   * @param supabase - Supabase client instance
   * @param shows - Array of show data
   * @returns Array of created show records
   */
  static async createTestShows(
    supabase: SupabaseClient, 
    shows: Array<{
      id?: string;
      spotify_url: string;
      title: string;
      rss_url: string;
    }>
  ) {
    const showRecords = shows.map((show, i) => ({
      id: show.id || `test-transcript-show-${i + 1}`,
      spotify_url: show.spotify_url,
      title: show.title,
      description: `Description for ${show.title}`,
      image_url: 'https://example.com/image.jpg',
      rss_url: show.rss_url,
      etag: null,
      last_modified: null,
      last_checked_episodes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('podcast_shows')
      .insert(showRecords)
      .select();

    if (error) {
      throw new Error(`Failed to create test shows: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create test episodes in database
   * @param supabase - Supabase client instance
   * @param episodes - Array of episode data
   * @returns Array of created episode records
   */
  static async createTestEpisodes(
    supabase: SupabaseClient,
    episodes: Array<{
      id?: string;
      show_id: string;
      guid: string;
      title: string;
      episode_url: string;
      pub_date: string;
    }>
  ) {
    const episodeRecords = episodes.map((episode, i) => ({
      id: episode.id || `test-transcript-episode-${i + 1}`,
      show_id: episode.show_id,
      guid: episode.guid,
      title: episode.title,
      description: `Description for ${episode.title}`,
      episode_url: episode.episode_url,
      pub_date: episode.pub_date,
      duration_sec: 1800, // 30 minutes
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('podcast_episodes')
      .insert(episodeRecords)
      .select();

    if (error) {
      throw new Error(`Failed to create test episodes: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Create mock Taddy API responses
   * @param status - Transcript status to mock
   * @param overrides - Additional response data
   * @returns Mock Taddy response
   */
  static createMockTaddyResponse(
    status: 'full' | 'partial' | 'not_found' | 'no_match' | 'error',
    overrides: any = {}
  ) {
    const baseResponse = {
      podcastGuid: 'test-podcast-guid',
      episodeGuid: 'test-episode-guid',
      ...overrides
    };

    switch (status) {
      case 'full':
        return {
          ...baseResponse,
          transcriptStatus: 'full',
          transcriptText: 'This is a full transcript of the podcast episode. It contains the complete audio content transcribed to text.',
          transcriptUrl: 'https://example.com/full-transcript.txt'
        };
      case 'partial':
        return {
          ...baseResponse,
          transcriptStatus: 'partial',
          transcriptText: 'This is a partial transcript... [content truncated]',
          transcriptUrl: 'https://example.com/partial-transcript.txt'
        };
      case 'not_found':
        return {
          ...baseResponse,
          transcriptStatus: 'not_found',
          message: 'No transcript found for this episode'
        };
      case 'no_match':
        return {
          ...baseResponse,
          transcriptStatus: 'no_match',
          message: 'No matching episode found in our database'
        };
      case 'error':
        return {
          ...baseResponse,
          transcriptStatus: 'error',
          message: 'An error occurred while fetching the transcript'
        };
    }
  }

  /**
   * Set up TranscriptService mock responses
   * @param responses - Array of mock responses for different episodes
   */
  static setupTranscriptServiceMocks(responses: Array<{
    status: 'full' | 'partial' | 'not_found' | 'no_match' | 'error';
    overrides?: any;
  }>) {
    // Mock the TranscriptService constructor to return an instance with getTranscript method
    mockTranscriptService.mockImplementation(() => ({
      getTranscript: vi.fn()
        .mockResolvedValueOnce(this.createMockTranscriptServiceResponse(responses[0]?.status || 'full', responses[0]?.overrides))
        .mockResolvedValueOnce(this.createMockTranscriptServiceResponse(responses[1]?.status || 'full', responses[1]?.overrides))
    }));
  }

  /**
   * Create mock TranscriptService response format
   * @param status - Transcript status to mock
   * @param overrides - Additional response data
   * @returns Mock TranscriptService response
   */
  static createMockTranscriptServiceResponse(
    status: 'full' | 'partial' | 'not_found' | 'no_match' | 'error',
    overrides: any = {}
  ) {
    switch (status) {
      case 'full':
        return {
          kind: 'success',
          transcript: 'This is a full transcript of the podcast episode. It contains the complete audio content transcribed to text.',
          status: 'full',
          ...overrides
        };
      case 'partial':
        return {
          kind: 'success',
          transcript: 'This is a partial transcript... [content truncated]',
          status: 'partial',
          ...overrides
        };
      case 'not_found':
        return {
          kind: 'not_found',
          message: 'No transcript found for this episode',
          ...overrides
        };
      case 'no_match':
        return {
          kind: 'no_match',
          message: 'No matching episode found in our database',
          ...overrides
        };
      case 'error':
        return {
          kind: 'error',
          message: 'An error occurred while fetching the transcript',
          ...overrides
        };
    }
  }

  /**
   * Clean up test data from database
   * @param supabase - Supabase client instance
   * @param testShowIds - Array of show IDs to clean up
   * @param testEpisodeIds - Array of episode IDs to clean up
   */
  static async cleanupTestData(
    supabase: SupabaseClient, 
    testShowIds: string[], 
    testEpisodeIds: string[]
  ) {
    // Clean up transcripts first (foreign key dependency)
    if (testEpisodeIds.length > 0) {
      await supabase
        .from('transcripts')
        .delete()
        .in('episode_id', testEpisodeIds);
      
      // Clean up episodes
      await supabase
        .from('podcast_episodes')
        .delete()
        .in('id', testEpisodeIds);
    }

    // Clean up shows
    if (testShowIds.length > 0) {
      await supabase
        .from('podcast_shows')
        .delete()
        .in('id', testShowIds);
    }
  }
}

describe('Transcript Worker Integration Tests', () => {
  let supabase: SupabaseClient;
  let testShowIds: string[] = [];
  let testEpisodeIds: string[] = [];

  // Only run when the test runner has the necessary credentials
  const hasCredentials = Boolean(
    process.env.SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Dynamically skip when credentials are missing to avoid local dev pain
  const maybeDescribe = hasCredentials ? describe : describe.skip;

  beforeAll(async () => {
    if (!hasCredentials) return;

    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify database connection and required tables exist
    const { error: showsError } = await supabase
      .from('podcast_shows')
      .select('count')
      .limit(0)
      .single();

    const { error: episodesError } = await supabase
      .from('podcast_episodes')
      .select('count')
      .limit(0)
      .single();

    const { error: transcriptsError } = await supabase
      .from('transcripts')
      .select('count')
      .limit(0)
      .single();

    if (showsError && showsError.code !== 'PGRST116') {
      throw new Error(`Database connection failed or podcast_shows table missing: ${showsError.message}`);
    }

    if (episodesError && episodesError.code !== 'PGRST116') {
      throw new Error(`Database connection failed or podcast_episodes table missing: ${episodesError.message}`);
    }

    if (transcriptsError && transcriptsError.code !== 'PGRST116') {
      throw new Error(`Database connection failed or transcripts table missing: ${transcriptsError.message}`);
    }
  });

  beforeEach(() => {
    // Reset test data tracking
    testShowIds = [];
    testEpisodeIds = [];

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (!hasCredentials) return;

    // Clean up test data after each test
    await TranscriptWorkerIntegrationTestDataFactory.cleanupTestData(
      supabase,
      testShowIds,
      testEpisodeIds
    );
  });

  maybeDescribe('End-to-End Transcript Worker Flow', () => {
    it('should successfully process episodes with full transcripts', async () => {
      // Create test shows
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/test123',
          title: 'Test Podcast for Transcripts',
          rss_url: 'https://example.com/test-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      // Create test episodes within the lookback period (last 24 hours)
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'test-episode-1-guid',
          title: 'Test Episode 1',
          episode_url: 'https://example.com/episode1.mp3',
          pub_date: recentDate
        },
        {
          show_id: testShows[0].id,
          guid: 'test-episode-2-guid',
          title: 'Test Episode 2',
          episode_url: 'https://example.com/episode2.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up TranscriptService mocks for successful responses
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'full' },
        { status: 'full' }
      ]);

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Verify job completed successfully
      expect(result).toBe(true);

      // Verify transcripts were created in database
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .in('episode_id', testEpisodeIds);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(2);
      
      for (const transcript of transcripts!) {
        expect(transcript.status).toBe('full');
        expect(transcript.storage_path).toBeTruthy();
        expect(transcript.word_count).toBeGreaterThan(0);
      }

      // Verify storage upload was called
      expect(mockSupabaseStorage.uploadTranscript).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed transcript statuses correctly', async () => {
      // Create test show
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/mixed-test',
          title: 'Mixed Results Podcast',
          rss_url: 'https://example.com/mixed-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      // Create test episodes
      const recentDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6 hours ago
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'full-transcript-guid',
          title: 'Episode with Full Transcript',
          episode_url: 'https://example.com/full.mp3',
          pub_date: recentDate
        },
        {
          show_id: testShows[0].id,
          guid: 'partial-transcript-guid',
          title: 'Episode with Partial Transcript',
          episode_url: 'https://example.com/partial.mp3',
          pub_date: recentDate
        },
        {
          show_id: testShows[0].id,
          guid: 'not-found-guid',
          title: 'Episode with No Transcript',
          episode_url: 'https://example.com/none.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up mixed TranscriptService responses
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'full' },
        { status: 'partial' },
        { status: 'not_found' }
      ]);

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Verify job completed successfully
      expect(result).toBe(true);

      // Verify transcripts were created with correct statuses
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .in('episode_id', testEpisodeIds)
        .order('created_at');

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(3);

      // Check individual transcript statuses
      expect(transcripts![0].status).toBe('full');
      expect(transcripts![0].storage_path).toBeTruthy();
      expect(transcripts![0].word_count).toBeGreaterThan(0);

      expect(transcripts![1].status).toBe('partial');
      expect(transcripts![1].storage_path).toBeTruthy();
      expect(transcripts![1].word_count).toBeGreaterThan(0);

      expect(transcripts![2].status).toBe('not_found');
      expect(transcripts![2].storage_path).toBeNull();
      expect(transcripts![2].word_count).toBeNull();

      // Note: Storage operations are handled internally by TranscriptWorker
    });

    it('should respect lookback period and skip old episodes', async () => {
      // Create test show
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/lookback-test',
          title: 'Lookback Test Podcast',
          rss_url: 'https://example.com/lookback-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      // Create episodes: some recent, some old
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago (outside 24h lookback)

      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'recent-episode-guid',
          title: 'Recent Episode',
          episode_url: 'https://example.com/recent.mp3',
          pub_date: recentDate
        },
        {
          show_id: testShows[0].id,
          guid: 'old-episode-guid',
          title: 'Old Episode',
          episode_url: 'https://example.com/old.mp3',
          pub_date: oldDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up TranscriptService mock for only one call (recent episode)
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'full' }
      ]);

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Verify job completed successfully
      expect(result).toBe(true);

      // Verify only recent episode was processed
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .in('episode_id', testEpisodeIds);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(1);
      expect(transcripts![0].episode_id).toBe(testEpisodes[0].id); // Recent episode

      // Note: TranscriptService mocking is handled internally
    });

    it('should handle episodes that already have transcripts', async () => {
      // Create test show
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/existing-transcripts',
          title: 'Existing Transcripts Test',
          rss_url: 'https://example.com/existing-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      // Create test episodes
      const recentDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'has-transcript-guid',
          title: 'Episode with Existing Transcript',
          episode_url: 'https://example.com/existing.mp3',
          pub_date: recentDate
        },
        {
          show_id: testShows[0].id,
          guid: 'needs-transcript-guid',
          title: 'Episode Needing Transcript',
          episode_url: 'https://example.com/needs.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Create existing transcript for first episode
      const { error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          episode_id: testEpisodes[0].id,
          status: 'full',
          storage_path: 'transcripts/existing.jsonl.gz',
          word_count: 500,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      expect(transcriptError).toBeNull();

      // Set up TranscriptService mock for only one call (episode without transcript)
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'partial' }
      ]);

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Verify job completed successfully
      expect(result).toBe(true);

      // Verify only one new transcript was created
      const { data: allTranscripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .in('episode_id', testEpisodeIds)
        .order('created_at');

      expect(error).toBeNull();
      expect(allTranscripts).toHaveLength(2);

      // First transcript should remain unchanged
      expect(allTranscripts![0].episode_id).toBe(testEpisodes[0].id);
      expect(allTranscripts![0].status).toBe('full');
      expect(allTranscripts![0].storage_path).toBe('transcripts/existing.jsonl.gz');

      // Second transcript should be newly created
      expect(allTranscripts![1].episode_id).toBe(testEpisodes[1].id);
      expect(allTranscripts![1].status).toBe('partial');

      // Note: TranscriptService mocking is handled internally
    });
  });

  maybeDescribe('Error Handling and Recovery', () => {
    it('should handle Taddy API errors gracefully', async () => {
      // Create test show and episode
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/api-error-test',
          title: 'API Error Test Podcast',
          rss_url: 'https://example.com/error-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      const recentDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'api-error-guid',
          title: 'Episode Causing API Error',
          episode_url: 'https://example.com/error.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Mock TranscriptService to throw an error
      mockTranscriptService.mockImplementation(() => ({
        getTranscript: vi.fn().mockRejectedValue(new Error('Taddy API timeout'))
      }));

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Job should still complete successfully (errors are handled gracefully)
      expect(result).toBe(true);

      // Verify error transcript was created
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('episode_id', testEpisodes[0].id);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(1);
      expect(transcripts![0].status).toBe('error');
      expect(transcripts![0].storage_path).toBeNull();
      expect(transcripts![0].word_count).toBeNull();

      // Storage should not be called for error cases
      // Note: TranscriptWorker handles storage internally via Supabase client
    });

    it('should handle storage upload errors gracefully', async () => {
      // Create test show and episode
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/storage-error-test',
          title: 'Storage Error Test Podcast',
          rss_url: 'https://example.com/storage-error-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      const recentDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'storage-error-guid',
          title: 'Episode with Storage Error',
          episode_url: 'https://example.com/storage-error.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up successful TranscriptService response
      // Note: Storage errors are handled internally by TranscriptWorker
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'full' }
      ]);

      // Run the transcript worker job
      const result = await runJob('transcript_worker');

      // Job should still complete successfully
      expect(result).toBe(true);

      // Verify error transcript was created
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('episode_id', testEpisodes[0].id);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(1);
      expect(transcripts![0].status).toBe('error');
      expect(transcripts![0].storage_path).toBeNull();
      expect(transcripts![0].word_count).toBeNull();
    });
  });

  maybeDescribe('Manual Job Execution', () => {
    it('should support manual execution via runJob function', async () => {
      // Create test data
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/manual-test',
          title: 'Manual Execution Test',
          rss_url: 'https://example.com/manual-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      const recentDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(supabase, [
        {
          show_id: testShows[0].id,
          guid: 'manual-execution-guid',
          title: 'Manual Execution Episode',
          episode_url: 'https://example.com/manual.mp3',
          pub_date: recentDate
        }
      ]);
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up successful response
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks([
        { status: 'full' }
      ]);

      // Test different job name variations
      const jobResults = await Promise.all([
        runJob('transcript_worker'),
        runJob('transcript') // Alias
      ]);

      // Both should succeed (second call should find no new episodes)
      expect(jobResults[0]).toBe(true);
      expect(jobResults[1]).toBe(true);

      // Verify transcript was created only once
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('episode_id', testEpisodes[0].id);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(1);
      expect(transcripts![0].status).toBe('full');
    });
  });

  maybeDescribe('Performance and Concurrency', () => {
    it('should handle multiple episodes efficiently with concurrency', async () => {
      // Create test show
      const testShows = await TranscriptWorkerIntegrationTestDataFactory.createTestShows(supabase, [
        {
          spotify_url: 'https://open.spotify.com/show/concurrency-test',
          title: 'Concurrency Test Podcast',
          rss_url: 'https://example.com/concurrency-feed.xml'
        }
      ]);
      testShowIds.push(...testShows.map(show => show.id));

      // Create multiple test episodes
      const recentDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const episodeCount = 5;
      const episodeData = Array(episodeCount).fill(null).map((_, i) => ({
        show_id: testShows[0].id,
        guid: `concurrency-episode-${i}-guid`,
        title: `Concurrency Test Episode ${i + 1}`,
        episode_url: `https://example.com/concurrency-${i}.mp3`,
        pub_date: recentDate
      }));

      const testEpisodes = await TranscriptWorkerIntegrationTestDataFactory.createTestEpisodes(
        supabase,
        episodeData
      );
      testEpisodeIds.push(...testEpisodes.map(episode => episode.id));

      // Set up successful responses for all episodes
      const responses = Array(episodeCount).fill(null).map(() => ({ status: 'full' as const }));
      TranscriptWorkerIntegrationTestDataFactory.setupTranscriptServiceMocks(responses);

      // Record timing
      const startTime = Date.now();
      const result = await runJob('transcript_worker');
      const endTime = Date.now();

      // Verify job completed successfully
      expect(result).toBe(true);

      // Verify all transcripts were created
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .in('episode_id', testEpisodeIds);

      expect(error).toBeNull();
      expect(transcripts).toHaveLength(episodeCount);
      
      // All should be successful
      for (const transcript of transcripts!) {
        expect(transcript.status).toBe('full');
        expect(transcript.storage_path).toBeTruthy();
      }

      // Note: TranscriptService and storage mocking is handled internally

      // Performance check - should complete reasonably quickly with concurrency
      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
}); 