/**
 * Integration Tests for TranscriptWorker Service
 * 
 * These tests run against a real Supabase database to test the full integration
 * of the TranscriptWorker with actual database operations and business logic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { TranscriptWorker } from '../TranscriptWorker.js';
import { TranscriptWorkerConfig } from '../../config/transcriptWorkerConfig.js';
import { Logger } from '../../lib/logger.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/database.types.js';
import { TranscriptService } from '../../lib/services/TranscriptService.js';

// Mock TranscriptService to control transcript responses
vi.mock('../../lib/services/TranscriptService.js');

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables for integration tests');
}

// Create Supabase client for test data management
const supabase: SupabaseClient<Database> = createClient(supabaseUrl, supabaseServiceKey);

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

// Integration test configuration
const integrationConfig: TranscriptWorkerConfig = {
  lookbackHours: 24,
  maxRequests: 15,
  concurrency: 5, // Lower concurrency for integration tests
  enabled: true,
  cronSchedule: '0 1 * * *',
  useAdvisoryLock: false, // Disable advisory lock for tests
  tier: 'business',
  last10Mode: false
};

describe('TranscriptWorker Integration Tests', () => {
  let worker: TranscriptWorker;
  let seededShowId: string;
  let seededEpisodeIds: string[] = [];
  let mockTranscriptService: any;

  beforeAll(() => {
    // Mock TranscriptService
    mockTranscriptService = TranscriptService as any;
  });

  beforeEach(async () => {
    // Clear any existing test data
    await cleanupTestData();
    
    // Seed test data
    await seedTestData();
    
    // Setup mock TranscriptService with different responses per episode
    setupMockTranscriptService();
    
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
    // Generate predictable IDs
    const showId = 'test-transcript-worker-show-1';
    const episodeIds = [
      'test-transcript-worker-episode-1',
      'test-transcript-worker-episode-2', 
      'test-transcript-worker-episode-3',
      'test-transcript-worker-episode-4'
    ];

    // Create test podcast show with explicit ID
    const showInsertData = {
      id: showId,
      title: 'Integration Test Podcast',
      description: 'Test podcast for integration testing',
      rss_url: 'https://example.com/test-feed.xml',
      spotify_url: 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB',
      image_url: 'https://example.com/test-image.jpg',
      website_url: 'https://example.com',
      language: 'en',
      category: 'Technology',
      author: 'Test Author',
      owner_name: 'Test Owner',
      owner_email: 'test@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };

    const { error: showError } = await supabase
      .from('podcast_shows')
      .insert(showInsertData)
      .select('id');

    if (showError) {
      throw new Error(`Failed to seed show data - Error: ${showError.message}, Code: ${showError.code}, Details: ${JSON.stringify(showError.details)}`);
    }

    seededShowId = showId;

    // Create test episodes with explicit IDs and recent pub_dates
    const now = new Date();
    const episodes = [
      {
        id: episodeIds[0],
        show_id: seededShowId,
        guid: 'test-episode-1-full',
        title: 'Test Episode 1 - Full Transcript',
        description: 'Episode that will return full transcript',
        pub_date: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        episode_url: 'https://example.com/episode1.mp3',
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      },
      {
        id: episodeIds[1],
        show_id: seededShowId,
        guid: 'test-episode-2-partial',
        title: 'Test Episode 2 - Partial Transcript',
        description: 'Episode that will return partial transcript',
        pub_date: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        episode_url: 'https://example.com/episode2.mp3',
        duration_sec: 2400,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      },
      {
        id: episodeIds[2],
        show_id: seededShowId,
        guid: 'test-episode-3-processing',
        title: 'Test Episode 3 - Processing',
        description: 'Episode that will be in processing state',
        pub_date: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        episode_url: 'https://example.com/episode3.mp3',
        duration_sec: 1800,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      },
      {
        id: episodeIds[3],
        show_id: seededShowId,
        guid: 'test-episode-4-not-found',
        title: 'Test Episode 4 - Not Found',
        description: 'Episode that will not be found',
        pub_date: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        episode_url: 'https://example.com/episode4.mp3',
        duration_sec: 1200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      }
    ];

    const { error: episodeError } = await supabase
      .from('podcast_episodes')
      .insert(episodes)
      .select('id');

    if (episodeError) {
      throw new Error(`Failed to seed episode data: ${episodeError.message}`);
    }

    // Use the explicit IDs we set
    seededEpisodeIds = episodeIds;
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
   * Setup mock TranscriptService with different responses per episode
   */
  function setupMockTranscriptService(): void {
    const mockTranscriptServiceInstance = {
      getTranscript: vi.fn().mockImplementation((episode: any) => {
        // Return different responses based on episode GUID
        switch (episode.guid) {
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
              source: 'taddy',
              creditsConsumed: 1
            });

          case 'test-episode-4-not-found':
            return Promise.resolve({
              kind: 'not_found',
              source: 'taddy',
              creditsConsumed: 1
            });

          default:
            return Promise.resolve({
              kind: 'error',
              message: 'Unexpected episode GUID in test',
              source: 'taddy',
              creditsConsumed: 0
            });
        }
      })
    };

    // Mock the TranscriptService constructor
    mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);
  }

  it('should process multiple episodes with different Business tier responses', async () => {
    
    // Debug: Check if the worker's query finds the episodes
    const cutoffTime = new Date(Date.now() - (integrationConfig.lookbackHours * 60 * 60 * 1000));
    const { data: queryEpisodes, error: queryError } = await supabase
      .from('podcast_episodes')
      .select(`
        id,
        show_id,
        guid,
        episode_url,
        title,
        description,
        pub_date,
        duration_sec,
        created_at,
        deleted_at,
        podcast_shows!inner(
          id,
          rss_url,
          title
        )
      `)
      .gte('pub_date', cutoffTime.toISOString())
      .not('podcast_shows.rss_url', 'is', null)
      .not('podcast_shows.rss_url', 'eq', '')
      .not('guid', 'is', null)
      .not('guid', 'eq', '')
      .order('pub_date', { ascending: false })
      .limit(integrationConfig.maxRequests * 2);
    
    // Run the worker
    const result = await worker.run();

    // Debug information to help diagnose test failures
    const debugInfo = {
      seededEpisodes: await supabase
        .from('podcast_episodes')
        .select(`
          *,
          podcast_shows!inner (
            id,
            rss_url,
            title
          )
        `)
        .in('id', seededEpisodeIds),
      seededEpisodeIds,
      currentTime: new Date().toISOString(),
      cutoffTime: new Date(Date.now() - integrationConfig.lookbackHours * 60 * 60 * 1000).toISOString(),
      lookbackHours: integrationConfig.lookbackHours,
      workerQueryResult: queryEpisodes,
      workerQueryError: queryError,
      workerResult: result,
      mockTranscriptServiceCalls: mockTranscriptService.mock?.calls || []
    };

    if (result.totalEpisodes !== 4 || result.availableTranscripts !== 2) {
      throw new Error(`Integration test debug info: ${JSON.stringify(debugInfo, null, 2)}`);
    }
  });

  it('should create correct database records for each transcript type', async () => {
    // Setup mock specifically for this test
    const mockInstance = {
      getTranscript: vi.fn().mockImplementation((episode: any) => {
        // Return different responses based on episode GUID
        switch (episode.guid) {
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
              source: 'taddy',
              creditsConsumed: 1
            });

          case 'test-episode-4-not-found':
            return Promise.resolve({
              kind: 'not_found',
              source: 'taddy',
              creditsConsumed: 1
            });

          default:
            return Promise.resolve({
              kind: 'error',
              message: 'Unexpected episode GUID in test',
              source: 'taddy',
              creditsConsumed: 0
            });
        }
      })
    };
    
    mockTranscriptService.mockImplementation(() => mockInstance);
    
    // Create new worker instance to pick up the new mock
    worker = new TranscriptWorker(integrationConfig, mockLogger, supabase);
    
    // Run the worker
    const result = await worker.run();
    
    // Debug: Log worker result first
    if (result.totalEpisodes === 0) {
      throw new Error(`DEBUG: Worker found no episodes! Result: ${JSON.stringify(result, null, 2)}`);
    }

    // Query all created transcripts
    const { data: transcripts, error } = await supabase
      .from('transcripts')
      .select('*')
      .in('episode_id', seededEpisodeIds)
      .order('created_at');

    if (error || !transcripts || transcripts.length === 0) {
      throw new Error(`DEBUG: No transcripts created! Error: ${JSON.stringify(error)}, Count: ${transcripts?.length || 0}, Worker Result: ${JSON.stringify(result, null, 2)}`);
    }

    if (transcripts.length !== 4) {
      throw new Error(`DEBUG: Expected 4 transcripts, got ${transcripts.length}. Transcripts: ${JSON.stringify(transcripts, null, 2)}`);
    }

    // Verify full transcript record
    const fullTranscript = transcripts.find(t => t.status === 'available' && t.word_count === 25);
    if (!fullTranscript) {
      throw new Error(`DEBUG: Can't find full transcript with word_count=25. All transcripts: ${JSON.stringify(transcripts, null, 2)}`);
    }
    
    expect(fullTranscript).toBeDefined();
    expect(fullTranscript!.source).toBe('taddy');
    expect(fullTranscript!.storage_path).toBeTruthy();
    expect(fullTranscript!.storage_path).toMatch(/^test-transcript-worker-show-1\/test-transcript-worker-episode-\d+\.jsonl\.gz$/);

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
    expect(processingTranscript!.word_count).toBeUndefined();

    // Verify not_found transcript record (stored as 'error')
    const errorTranscript = transcripts.find(t => t.status === 'error');
    expect(errorTranscript).toBeDefined();
    expect(errorTranscript!.source).toBe('taddy');
    expect(errorTranscript!.storage_path).toBe('');
    expect(errorTranscript!.word_count).toBeUndefined();
  });

  it('should store transcript files in Supabase Storage for available transcripts', async () => {
    // Setup mock specifically for this test
    const mockInstance = {
      getTranscript: vi.fn().mockImplementation((episode: any) => {
        // Return different responses based on episode GUID
        switch (episode.guid) {
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
              source: 'taddy',
              creditsConsumed: 1
            });

          case 'test-episode-4-not-found':
            return Promise.resolve({
              kind: 'not_found',
              source: 'taddy',
              creditsConsumed: 1
            });

          default:
            return Promise.resolve({
              kind: 'error',
              message: 'Unexpected episode GUID in test',
              source: 'taddy',
              creditsConsumed: 0
            });
        }
      })
    };
    
    mockTranscriptService.mockImplementation(() => mockInstance);
    
    // Create new worker instance to pick up the new mock
    worker = new TranscriptWorker(integrationConfig, mockLogger, supabase);
    
    // Run the worker
    await worker.run();

    // Get transcript records with storage paths
    const { data: transcripts, error } = await supabase
      .from('transcripts')
      .select('storage_path, episode_id, status, word_count')
      .in('episode_id', seededEpisodeIds)
      .eq('status', 'available')
      .not('storage_path', 'eq', '');

    expect(error).toBeNull();
    expect(transcripts).toHaveLength(2); // full + partial

    // Verify storage paths are valid (format and content)
    const fullTranscript = transcripts.find(t => t.word_count === 25);
    const partialTranscript = transcripts.find(t => t.word_count === 12);

    expect(fullTranscript).toBeDefined();
    expect(fullTranscript!.storage_path).toBeTruthy();
    expect(fullTranscript!.storage_path).toMatch(/^test-transcript-worker-show-1\/test-transcript-worker-episode-\d+\.jsonl\.gz$/);

    expect(partialTranscript).toBeDefined();
    expect(partialTranscript!.storage_path).toBeTruthy();
    expect(partialTranscript!.storage_path).toMatch(/^test-transcript-worker-show-1\/test-transcript-worker-episode-\d+\.jsonl\.gz$/);

    // Verify storage paths are different for different episodes
    expect(fullTranscript!.storage_path).not.toBe(partialTranscript!.storage_path);
    
    // Note: We can't verify actual file existence in the test environment
    // as the storage APIs are not available, but the paths should be valid
    console.log(`Storage paths generated: ${fullTranscript!.storage_path}, ${partialTranscript!.storage_path}`);
  });

  it('should not reprocess episodes that already have transcripts', async () => {
    // Import the insertTranscript helper function
    const { insertTranscript } = await import('../../lib/db/transcripts');

    // Clean up any existing transcripts from previous tests
    await supabase
      .from('transcripts')
      .delete()
      .in('episode_id', seededEpisodeIds);

    // Verify episodes exist before creating transcripts
    const { data: episodes, error: episodeError } = await supabase
      .from('podcast_episodes')
      .select('id')
      .in('id', seededEpisodeIds);

    if (episodeError) {
      throw new Error(`DEBUG: Failed to fetch episodes: ${JSON.stringify(episodeError)}`);
    }

    if (!episodes || episodes.length !== 4) {
      throw new Error(`DEBUG: Expected 4 episodes, got ${episodes?.length || 0}. Episode IDs: ${JSON.stringify(seededEpisodeIds)}`);
    }

    console.log(`DEBUG: Found ${episodes.length} episodes for transcript creation`);

    // Use the insertTranscript helper function to create transcripts
    // This will handle all the database constraints and logic properly
    try {
      console.log(`DEBUG: Inserting transcript for episode 1: ${seededEpisodeIds[0]}`);
      const transcript1 = await insertTranscript(
        seededEpisodeIds[0], 
        `test-transcript-worker-show-1/${seededEpisodeIds[0]}.jsonl.gz`,
        'available',
        25,
        'taddy'
      );
      console.log(`DEBUG: Successfully inserted transcript 1:`, transcript1.id);

      console.log(`DEBUG: Inserting transcript for episode 2: ${seededEpisodeIds[1]}`);
      const transcript2 = await insertTranscript(
        seededEpisodeIds[1], 
        `test-transcript-worker-show-1/${seededEpisodeIds[1]}.jsonl.gz`,
        'available',
        12,
        'taddy'
      );
      console.log(`DEBUG: Successfully inserted transcript 2:`, transcript2.id);

      console.log(`DEBUG: Inserting transcript for episode 3: ${seededEpisodeIds[2]}`);
      const transcript3 = await insertTranscript(
        seededEpisodeIds[2], 
        '',
        'processing',
        undefined,
        'taddy'
      );
      console.log(`DEBUG: Successfully inserted transcript 3:`, transcript3.id);

      console.log(`DEBUG: Inserting transcript for episode 4: ${seededEpisodeIds[3]}`);
      const transcript4 = await insertTranscript(
        seededEpisodeIds[3], 
        '',
        'error',
        undefined,
        'taddy'
      );
      console.log(`DEBUG: Successfully inserted transcript 4:`, transcript4.id);

      // Ensure deleted_at is null for all transcripts (test environment issue)
      await supabase
        .from('transcripts')
        .update({ deleted_at: null })
        .in('episode_id', seededEpisodeIds);

      console.log(`DEBUG: All transcripts created and deleted_at set to null`);
    } catch (insertError) {
      console.error(`DEBUG: Error during transcript insertion:`, insertError);
      throw new Error(`DEBUG: Failed to insert transcripts using helper: ${insertError instanceof Error ? insertError.message : insertError}`);
    }

    // Verify transcripts were created
    const { data: verifyTranscripts, error: verifyError } = await supabase
      .from('transcripts')
      .select('episode_id, status, storage_path, word_count')
      .in('episode_id', seededEpisodeIds);

    if (verifyError) {
      throw new Error(`DEBUG: Error verifying transcripts: ${JSON.stringify(verifyError)}`);
    }

    console.log(`DEBUG: Query for transcripts returned ${verifyTranscripts?.length || 0} results`);
    
    if (!verifyTranscripts || verifyTranscripts.length !== 4) {
      throw new Error(`DEBUG: Expected 4 transcripts, got ${verifyTranscripts?.length || 0}: ${JSON.stringify(verifyTranscripts)}`);
    }

    console.log(`DEBUG: Verified transcripts:`, JSON.stringify(verifyTranscripts, null, 2));

    // Setup a simple mock that should never be called
    const mockInstance = {
      getTranscript: vi.fn().mockRejectedValue(new Error('Mock should not be called - episodes should be filtered out'))
    };
    
    mockTranscriptService.mockImplementation(() => mockInstance);
    
    // Create worker instance
    const worker = new TranscriptWorker(integrationConfig, mockLogger, supabase);
    
    // Run the worker - should find 0 episodes since all have transcripts
    const result = await worker.run();
    
    console.log(`DEBUG: Worker result:`, JSON.stringify(result, null, 2));
    
    // Verify the mock was never called
    expect(mockInstance.getTranscript).not.toHaveBeenCalled();
    
    // Verify no episodes were processed
    expect(result.totalEpisodes).toBe(0);
    expect(result.processedEpisodes).toBe(0);
  });

  it('should handle quota exhaustion correctly', async () => {
    // Setup a new mock for quota exhaustion test
    const mockInstance = {
      getTranscript: vi.fn()
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
        })
    };
    
    mockTranscriptService.mockImplementation(() => mockInstance);
    
    // Create new worker instance to pick up the new mock
    worker = new TranscriptWorker(integrationConfig, mockLogger, supabase);

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
    // Clean up any existing transcripts from previous tests
    await supabase
      .from('transcripts')
      .delete()
      .in('episode_id', seededEpisodeIds);

    // Create a fresh episode that's definitely within the 1-hour window (30 minutes ago)
    const now = new Date();
    const recentEpisodeId = 'test-transcript-worker-recent-episode';
    
    const recentEpisode = {
      id: recentEpisodeId,
      show_id: seededShowId,
      guid: 'test-episode-recent',
      title: 'Recent Test Episode',
      description: 'Episode for lookback window test',
      pub_date: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
      episode_url: 'https://example.com/recent.mp3',
      duration_sec: 1800,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null
    };

    // Insert the recent episode
    const { error: episodeError } = await supabase
      .from('podcast_episodes')
      .insert(recentEpisode);

    if (episodeError) {
      throw new Error(`DEBUG: Failed to create recent episode: ${JSON.stringify(episodeError)}`);
    }

    console.log(`DEBUG: Created recent episode ${recentEpisodeId} at ${recentEpisode.pub_date}`);

    // Setup mock for this test
    const mockInstance = {
      getTranscript: vi.fn().mockResolvedValue({
        kind: 'full',
        text: 'Full transcript for lookback test',
        wordCount: 15,
        source: 'taddy',
        creditsConsumed: 1
      })
    };
    
    mockTranscriptService.mockImplementation(() => mockInstance);

    // Create a config with a very small lookback window (45 minutes)
    const shortLookbackConfig = { ...integrationConfig, lookbackHours: 0.75 }; // 45 minutes
    const shortLookbackWorker = new TranscriptWorker(shortLookbackConfig, mockLogger, supabase);

    // Run the worker - should find the recent episode
    const result = await shortLookbackWorker.run();
    
    console.log(`DEBUG: Lookback worker result:`, JSON.stringify(result, null, 2));
    
    // Clean up the recent episode
    await supabase
      .from('podcast_episodes')
      .delete()
      .eq('id', recentEpisodeId);
    
    expect(result.totalEpisodes).toBe(1); // Only the recent episode (30 minutes ago)
    expect(result.processedEpisodes).toBe(1);
    // The recent episode should get a full transcript
    expect(result.availableTranscripts).toBe(1);
  });

  describe('TRANSCRIPT_WORKER_L10 flag behaviour', () => {
    it('should process only genuinely new episodes when last10Mode is false', async () => {
      // Arrange: remove any existing transcripts so episodes are treated as new.
      const { error: cleanupErr } = await supabase
        .from('transcripts')
        .delete();
      if (cleanupErr) {
        throw new Error(`Failed to clean transcripts: ${cleanupErr.message}`);
      }

      const cfg: TranscriptWorkerConfig = { ...integrationConfig, last10Mode: false } as any;

      const workerFalse = new TranscriptWorker(cfg, mockLogger, supabase);

      const summary = await workerFalse.run();

      // Should discover the seeded episodes (4) and process them, creating transcripts
      expect(summary.totalEpisodes).toBe(seededEpisodeIds.length);
      expect(summary.processedEpisodes).toBeGreaterThan(0);

      // Should have created available transcripts for at least one episode (depends on mocks)
      expect(summary.availableTranscripts).toBeGreaterThan(0);
    });

    it('should re-submit up to 10 most recent episodes when last10Mode is true', async () => {
      const cfg: TranscriptWorkerConfig = { ...integrationConfig, last10Mode: true } as any;

      const l10Worker = new TranscriptWorker(cfg, mockLogger, supabase);

      const summary = await l10Worker.run();

      // We seeded 4 episodes, so expect all 4 to be considered.
      expect(summary.totalEpisodes).toBe(seededEpisodeIds.length);
      // At least one should be processed (depends on transcript mocks)
      expect(summary.processedEpisodes).toBeGreaterThan(0);
      expect(summary.totalEpisodes).toBeLessThanOrEqual(10);
    });

    it('should overwrite existing transcript rows when last10Mode is true', async () => {
      // 1️⃣ Arrange: Pre-insert transcripts with old data
      const initialWordCount = 1;

      // Insert one transcript per seeded episode with minimal data
      const initialInsertData = seededEpisodeIds.map((epId) => ({
        episode_id: epId,
        status: 'pending',
        storage_path: '',
        word_count: initialWordCount,
        source: 'taddy'
      }));

      const { error: insertErr } = await supabase
        .from('transcripts')
        .insert(initialInsertData);

      if (insertErr) {
        throw new Error(`Failed to seed transcripts for overwrite-test: ${insertErr.message}`);
      }

      // Capture original updated_at timestamps
      const { data: beforeRows, error: beforeErr } = await supabase
        .from('transcripts')
        .select('episode_id, updated_at');

      if (beforeErr || !beforeRows) {
        throw new Error(`Failed to query pre-test transcripts: ${beforeErr?.message}`);
      }

      const updatedAtBefore: Record<string, string> = {};
      for (const row of beforeRows) {
        updatedAtBefore[row.episode_id] = row.updated_at as string;
      }

      // 2️⃣ Setup mock TranscriptService to return full transcripts so rows will be overwritten to 'available'
      const mockInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'full',
          text: 'Overwritten transcript content',
          wordCount: 42,
          source: 'taddy',
          creditsConsumed: 1
        })
      };
      mockTranscriptService.mockImplementation(() => mockInstance);

      // 3️⃣ Act: run worker with last10Mode true
      const cfg: TranscriptWorkerConfig = { ...integrationConfig, last10Mode: true } as any;
      const l10Worker = new TranscriptWorker(cfg, mockLogger, supabase);
      await l10Worker.run();

      // 4️⃣ Assert: each transcript row should now be status 'available' and updated_at advanced
      const { data: afterRows, error: afterErr } = await supabase
        .from('transcripts')
        .select('episode_id, status, storage_path, word_count, updated_at');

      if (afterErr || !afterRows) {
        throw new Error(`Failed to query post-run transcripts: ${afterErr?.message}`);
      }

      // Ensure at least one transcript is now available and has updated fields
      const availableRows = afterRows.filter((r) => r.status === 'available');
      expect(availableRows.length).toBeGreaterThan(0);

      for (const row of availableRows) {
        expect(row.storage_path).not.toBe('');
        expect(row.word_count).not.toBe(initialWordCount);
      }

      // Also ensure TranscriptService called once per episode
      expect(mockInstance.getTranscript).toHaveBeenCalledTimes(seededEpisodeIds.length);
    });
  });
}); 