/**
 * Integration Tests for TranscriptWorker with Business Tier
 * 
 * This test suite provides end-to-end integration testing of the TranscriptWorker
 * with actual database seeding and Business tier transcript processing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { TranscriptWorker } from '../TranscriptWorker.js';
import { TranscriptWorkerConfig } from '../../config/transcriptWorkerConfig.js';
import { Logger } from '../../lib/logger.js';
import { getSharedSupabaseClient } from '../../lib/db/sharedSupabaseClient.js';
import { TaddyBusinessClient, BusinessTranscriptResult } from '../../lib/clients/taddyBusinessClient.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../lib/db/database.types.js';

// Mock the TaddyBusinessClient to control responses
vi.mock('../../lib/clients/taddyBusinessClient.js', () => ({
  TaddyBusinessClient: vi.fn(),
}));

// Mock logger for cleaner test output
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

describe('TranscriptWorker Integration Tests', () => {
  let supabase: SupabaseClient<Database>;
  let worker: TranscriptWorker;
  let mockTaddyBusinessClient: any;
  let seededShowId: string;
  let seededEpisodeIds: string[];

  const integrationConfig: TranscriptWorkerConfig = {
    lookbackHours: 24,
    maxRequests: 5, // Small number for integration test
    concurrency: 2,
    enabled: true,
    cronSchedule: '0 1 * * *',
    tier: 'business', // Use Business tier for integration test
    useAdvisoryLock: false // Disable for test simplicity
  };

  beforeAll(async () => {
    // Get actual Supabase client for integration testing
    supabase = getSharedSupabaseClient();
    
    // Verify test database connection
    const { data, error } = await supabase.from('podcast_shows').select('count').limit(1);
    if (error) {
      throw new Error(`Failed to connect to test database: ${error.message}`);
    }
  });

  beforeEach(async () => {
    // Clear any existing test data
    await cleanupTestData();
    
    // Seed test data
    await seedTestData();
    
    // Setup mock TaddyBusinessClient
    setupMockBusinessClient();
    
    // Create worker instance
    worker = new TranscriptWorker(integrationConfig, mockLogger, supabase);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestData();
  });

  /**
   * Seed test data: one show with multiple episodes
   */
  async function seedTestData(): Promise<void> {
    // Create test podcast show
    const { data: showData, error: showError } = await supabase
      .from('podcast_shows')
      .insert({
        title: 'Integration Test Podcast',
        description: 'Test podcast for integration testing',
        rss_url: 'https://example.com/test-feed.xml',
        image_url: 'https://example.com/test-image.jpg',
        website_url: 'https://example.com',
        language: 'en',
        category: 'Technology',
        author: 'Test Author',
        owner_name: 'Test Owner',
        owner_email: 'test@example.com'
      })
      .select('id')
      .single();

    if (showError) {
      throw new Error(`Failed to seed show data: ${showError.message}`);
    }

    seededShowId = showData.id;

    // Create test episodes with recent pub_dates to ensure they're in lookback window
    const now = new Date();
    const episodes = [
      {
        show_id: seededShowId,
        guid: 'test-episode-1-full',
        title: 'Test Episode 1 - Full Transcript',
        description: 'Episode that will return full transcript',
        pub_date: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        episode_url: 'https://example.com/episode1.mp3',
        duration_sec: 3600
      },
      {
        show_id: seededShowId,
        guid: 'test-episode-2-partial',
        title: 'Test Episode 2 - Partial Transcript',
        description: 'Episode that will return partial transcript',
        pub_date: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        episode_url: 'https://example.com/episode2.mp3',
        duration_sec: 2400
      },
      {
        show_id: seededShowId,
        guid: 'test-episode-3-processing',
        title: 'Test Episode 3 - Processing',
        description: 'Episode that will be in processing state',
        pub_date: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        episode_url: 'https://example.com/episode3.mp3',
        duration_sec: 1800
      },
      {
        show_id: seededShowId,
        guid: 'test-episode-4-not-found',
        title: 'Test Episode 4 - Not Found',
        description: 'Episode that will not be found',
        pub_date: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        episode_url: 'https://example.com/episode4.mp3',
        duration_sec: 1200
      }
    ];

    const { data: episodeData, error: episodeError } = await supabase
      .from('podcast_episodes')
      .insert(episodes)
      .select('id');

    if (episodeError) {
      throw new Error(`Failed to seed episode data: ${episodeError.message}`);
    }

    seededEpisodeIds = episodeData.map(ep => ep.id);
  }

  /**
   * Clean up test data
   */
  async function cleanupTestData(): Promise<void> {
    // Delete transcripts first (foreign key dependency)
    if (seededEpisodeIds?.length > 0) {
      await supabase
        .from('transcripts')
        .delete()
        .in('episode_id', seededEpisodeIds);
    }

    // Delete episodes
    if (seededEpisodeIds?.length > 0) {
      await supabase
        .from('podcast_episodes')
        .delete()
        .in('id', seededEpisodeIds);
    }

    // Delete show
    if (seededShowId) {
      await supabase
        .from('podcast_shows')
        .delete()
        .eq('id', seededShowId);
    }

    // Reset IDs
    seededShowId = '';
    seededEpisodeIds = [];
  }

  /**
   * Setup mock TaddyBusinessClient with different responses per episode
   */
  function setupMockBusinessClient(): void {
    mockTaddyBusinessClient = {
      fetchTranscript: vi.fn().mockImplementation((feedUrl: string, guid: string): Promise<BusinessTranscriptResult> => {
        // Return different responses based on episode GUID
        switch (guid) {
          case 'test-episode-1-full':
            return Promise.resolve({
              kind: 'full',
              text: 'This is a complete transcript from the Business tier. It contains the full episode content with proper formatting and speaker attribution.',
              wordCount: 25,
              source: 'taddy',
              creditsConsumed: 1
            });

          case 'test-episode-2-partial':
            return Promise.resolve({
              kind: 'partial',
              text: 'This is a partial transcript that is still being processed.',
              wordCount: 12,
              reason: 'Transcript generation in progress',
              source: 'taddy',
              creditsConsumed: 1
            });

          case 'test-episode-3-processing':
            return Promise.resolve({
              kind: 'processing',
              creditsConsumed: 1
            });

          case 'test-episode-4-not-found':
            return Promise.resolve({
              kind: 'not_found',
              creditsConsumed: 1
            });

          default:
            return Promise.resolve({
              kind: 'error',
              message: 'Unexpected episode GUID in test',
              creditsConsumed: 0
            });
        }
      })
    };

    // Mock the TaddyBusinessClient constructor
    (TaddyBusinessClient as any).mockImplementation(() => mockTaddyBusinessClient);
  }

  it('should process multiple episodes with different Business tier responses', async () => {
    // Run the worker
    const result = await worker.run();

    // Verify summary metrics
    expect(result.totalEpisodes).toBe(4);
    expect(result.processedEpisodes).toBe(4);
    expect(result.availableTranscripts).toBe(2); // full + partial
    expect(result.processingCount).toBe(1); // processing episode
    expect(result.errorCount).toBe(1); // not_found episode

    // Verify Business client was called for each episode
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledTimes(4);
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
      'https://example.com/test-feed.xml',
      'test-episode-1-full'
    );
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
      'https://example.com/test-feed.xml',
      'test-episode-2-partial'
    );
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
      'https://example.com/test-feed.xml',
      'test-episode-3-processing'
    );
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
      'https://example.com/test-feed.xml',
      'test-episode-4-not-found'
    );
  });

  it('should create correct database records for each transcript type', async () => {
    // Run the worker
    await worker.run();

    // Query all created transcripts
    const { data: transcripts, error } = await supabase
      .from('transcripts')
      .select('*')
      .in('episode_id', seededEpisodeIds)
      .order('created_at');

    expect(error).toBeNull();
    expect(transcripts).toHaveLength(4);

    // Verify full transcript record
    const fullTranscript = transcripts.find(t => t.status === 'available' && t.word_count === 25);
    expect(fullTranscript).toBeDefined();
    expect(fullTranscript!.source).toBe('taddy');
    expect(fullTranscript!.storage_path).toBeTruthy();
    expect(fullTranscript!.storage_path).toMatch(/^[a-f0-9-]+\/[a-f0-9-]+\.jsonl\.gz$/);

    // Verify partial transcript record (also stored as 'available')
    const partialTranscript = transcripts.find(t => t.status === 'available' && t.word_count === 12);
    expect(partialTranscript).toBeDefined();
    expect(partialTranscript!.source).toBe('taddy');
    expect(partialTranscript!.storage_path).toBeTruthy();

    // Verify processing transcript record
    const processingTranscript = transcripts.find(t => t.status === 'processing');
    expect(processingTranscript).toBeDefined();
    expect(processingTranscript!.source).toBe('taddy');
    expect(processingTranscript!.storage_path).toBe('');
    expect(processingTranscript!.word_count).toBe(0);

    // Verify not_found transcript record (stored as 'error')
    const errorTranscript = transcripts.find(t => t.status === 'error');
    expect(errorTranscript).toBeDefined();
    expect(errorTranscript!.source).toBe('taddy');
    expect(errorTranscript!.storage_path).toBe('');
    expect(errorTranscript!.word_count).toBe(0);
  });

  it('should store transcript files in Supabase Storage for available transcripts', async () => {
    // Run the worker
    await worker.run();

    // Get transcript records with storage paths
    const { data: transcripts, error } = await supabase
      .from('transcripts')
      .select('storage_path, episode_id')
      .in('episode_id', seededEpisodeIds)
      .eq('status', 'available')
      .not('storage_path', 'eq', '');

    expect(error).toBeNull();
    expect(transcripts).toHaveLength(2); // full + partial

    // Verify files exist in storage
    for (const transcript of transcripts) {
      const { data: fileData, error: fileError } = await supabase.storage
        .from('transcripts')
        .download(transcript.storage_path);

      expect(fileError).toBeNull();
      expect(fileData).toBeDefined();
      expect(fileData!.size).toBeGreaterThan(0);

      // Verify file is gzipped JSONL
      expect(fileData!.type).toBe('application/jsonlines+gzip');
    }
  });

  it('should not reprocess episodes that already have transcripts', async () => {
    // First run
    await worker.run();
    
    // Reset mock call count
    vi.clearAllMocks();
    
    // Second run - should not process any episodes since they all have transcripts now
    const result = await worker.run();
    
    expect(result.totalEpisodes).toBe(0);
    expect(result.processedEpisodes).toBe(0);
    expect(mockTaddyBusinessClient.fetchTranscript).not.toHaveBeenCalled();
  });

  it('should handle quota exhaustion correctly', async () => {
    // Mock quota exhaustion on the third call
    mockTaddyBusinessClient.fetchTranscript
      .mockResolvedValueOnce({
        kind: 'full',
        text: 'First successful transcript',
        wordCount: 5,
        source: 'taddy',
        creditsConsumed: 1
      })
      .mockResolvedValueOnce({
        kind: 'full',
        text: 'Second successful transcript',
        wordCount: 5,
        source: 'taddy',
        creditsConsumed: 1
      })
      .mockResolvedValueOnce({
        kind: 'error',
        message: 'HTTP 429: Too Many Requests - quota exceeded',
        creditsConsumed: 0
      });

    // Run the worker
    const result = await worker.run();

    // Should process first 2 episodes, then stop due to quota exhaustion
    expect(result.processedEpisodes).toBeLessThanOrEqual(3);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'system',
      'Taddy API quota exhausted - aborting remaining episodes',
      expect.any(Object)
    );
  });

  it('should respect lookback window configuration', async () => {
    // Create worker with very short lookback window (1 hour)
    const shortLookbackConfig = { ...integrationConfig, lookbackHours: 1 };
    const shortLookbackWorker = new TranscriptWorker(shortLookbackConfig, mockLogger, supabase);

    // Run worker - should only process the most recent episode (1 hour ago)
    const result = await shortLookbackWorker.run();

    expect(result.totalEpisodes).toBe(1);
    expect(result.processedEpisodes).toBe(1);
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledTimes(1);
    expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
      'https://example.com/test-feed.xml',
      'test-episode-1-full'
    );
  });
}); 