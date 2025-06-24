import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';
import { TranscriptStatus } from '@listener/shared';
import { TranscriptService } from '../lib/services/TranscriptService.js';
import { ExtendedTranscriptResult } from '../../shared/src/types/index.js';
import { insertTranscript, overwriteTranscript } from '../lib/db/transcripts.js';
import { getTranscriptWorkerConfig, TranscriptWorkerConfig } from '../config/transcriptWorkerConfig.js';
import { createLogger, Logger } from '../lib/logger.js';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { getSharedSupabaseClient } from '../lib/db/sharedSupabaseClient.js';

// Promisify gzip for async/await usage
const gzipAsync = promisify(gzip);

/**
 * Episode with show information for transcript processing
 */
interface EpisodeWithShow {
  id: string;
  show_id: string;
  guid: string;
  episode_url: string;
  title?: string;
  description?: string;
  pub_date?: string;
  duration_sec?: number;
  created_at: string;
  show?: {
    id: string;
    rss_url: string;
    title: string;
  };
}

/**
 * Result of processing a single episode
 */
interface EpisodeProcessingResult {
  episodeId: string;
  status: TranscriptStatus;
  storagePath?: string;
  wordCount?: number;
  elapsedMs: number;
  error?: string;
}

/**
 * Summary of the entire transcript worker run
 */
interface TranscriptWorkerSummary {
  totalEpisodes: number;
  processedEpisodes: number;
  availableTranscripts: number;
  processingCount: number;
  errorCount: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
}

/**
 * TranscriptWorker - Nightly job to fetch and store podcast episode transcripts
 * 
 * This worker implements the Phase-1 transcript sync logic:
 * 1. Queries recent episodes without existing transcripts
 * 2. Fetches transcripts from Taddy Free API with concurrency control
 * 3. Stores transcript files in Supabase Storage (gzipped JSONL)
 * 4. Records transcript metadata in the database
 * 5. Provides comprehensive logging and error handling
 * 
 * Key features:
 * - Configurable lookback window and request limits
 * - Idempotent design with conflict resolution
 * - Optional advisory locking for deployment safety
 * - Structured logging with performance metrics
 * - Graceful error handling and recovery
 */
export class TranscriptWorker {
  private readonly supabase: SupabaseClient<Database>;
  private readonly transcriptService: TranscriptService;
  private readonly config: TranscriptWorkerConfig;
  private readonly logger: Logger;
  private readonly bucketName = 'transcripts';
  private quotaExhausted = false;

  constructor(
    config?: Partial<TranscriptWorkerConfig>, 
    logger?: Logger,
    customSupabaseClient?: SupabaseClient<Database>
  ) {
    // Use provided config or load from environment
    this.config = config ? { ...getTranscriptWorkerConfig(), ...config } : getTranscriptWorkerConfig();
    this.logger = logger || createLogger();

    // Initialize Supabase client with service role for full access
    this.supabase = customSupabaseClient || getSharedSupabaseClient();

    // Initialize transcript service
    this.transcriptService = new TranscriptService();

    this.logger.info('system', 'TranscriptWorker initialized', {
      metadata: {
        lookbackHours: this.config.lookbackHours,
        maxRequests: this.config.maxRequests,
        concurrency: this.config.concurrency,
        advisoryLock: this.config.useAdvisoryLock,
        cronSchedule: this.config.cronSchedule
      }
    });

    // Integration test harness disables advisory locks to avoid missing RPC functions
    if (process.env.USE_REAL_SUPABASE_IN_TRANSCRIPT_WORKER === 'true') {
      this.config.useAdvisoryLock = false;
    }
  }

  /**
   * Main entry point for the transcript worker
   * Orchestrates the entire transcript sync process
   * 
   * @returns Promise<TranscriptWorkerSummary> Summary of the run results
   */
  async run(): Promise<TranscriptWorkerSummary> {
    const startTime = Date.now();
    const jobId = `transcript-worker-${new Date().toISOString()}`;

    this.logger.info('system', 'Starting transcript worker run', {
      metadata: { 
        job_id: jobId,
        lookbackHours: this.config.lookbackHours,
        maxRequests: this.config.maxRequests,
        concurrency: this.config.concurrency,
        useAdvisoryLock: this.config.useAdvisoryLock
      }
    });

    let advisoryLockAcquired = false;
    let summary: TranscriptWorkerSummary = {
      totalEpisodes: 0,
      processedEpisodes: 0,
      availableTranscripts: 0,
      processingCount: 0,
      errorCount: 0,
      totalElapsedMs: 0,
      averageProcessingTimeMs: 0
    };

    try {
      // Step 1: Optionally acquire advisory lock
      if (this.config.useAdvisoryLock) {
        advisoryLockAcquired = await this.acquireAdvisoryLock();
        if (!advisoryLockAcquired) {
          this.logger.warn('system', 'Failed to acquire advisory lock - another worker may be running', {
            metadata: { job_id: jobId }
          });
          return summary; // Exit gracefully
        }
      }

      // Step 2: Query episodes needing transcripts
      this.logger.info('system', 'About to query episodes needing transcripts', {
        metadata: { job_id: jobId }
      });
      
      const episodes = await this.queryEpisodesNeedingTranscripts();
      summary.totalEpisodes = episodes.length;
      
      this.logger.info('system', 'Successfully queried episodes', {
        metadata: { job_id: jobId, episodes_found: episodes.length }
      });

      this.logger.info('system', `Found ${episodes.length} episodes needing transcripts`, {
        metadata: { 
          job_id: jobId,
          total_episodes: episodes.length,
          max_requests: this.config.maxRequests
        }
      });

      if (episodes.length === 0) {
        this.logger.info('system', 'No episodes need transcripts - exiting early', {
          metadata: { job_id: jobId }
        });
        return summary;
      }

      // Step 3: Limit to max requests and process episodes
      const episodesToProcess = episodes.slice(0, this.config.maxRequests);
      summary.processedEpisodes = episodesToProcess.length;

      this.logger.info('system', `Processing ${episodesToProcess.length} episodes`, {
        metadata: { 
          job_id: jobId,
          episodes_to_process: episodesToProcess.length,
          concurrency: this.config.concurrency
        }
      });

      // Step 4: Process episodes with concurrency control
      const results = await this.processEpisodesWithConcurrency(episodesToProcess, jobId);

      // Step 5: Aggregate results
      summary = this.aggregateResults(results, startTime);

      this.logger.info('system', 'Transcript worker run completed successfully', {
        metadata: { 
          job_id: jobId,
          ...summary
        }
      });

      return summary;

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('system', 'Transcript worker run failed', {
        metadata: { 
          job_id: jobId,
          error: errorMessage,
          elapsed_ms: elapsedMs,
          stack_trace: error instanceof Error ? error.stack : undefined
        }
      });

      // Update summary with error info
      summary.totalElapsedMs = elapsedMs;
      summary.errorCount = 1;

      throw error; // Re-throw to ensure non-zero exit code

    } finally {
      // Step 6: Release advisory lock if acquired
      if (advisoryLockAcquired && this.config.useAdvisoryLock) {
        await this.releaseAdvisoryLock();
      }
    }
  }

  /**
   * Acquire PostgreSQL advisory lock to prevent concurrent runs
   * @returns Promise<boolean> True if lock was acquired
   */
  private async acquireAdvisoryLock(): Promise<boolean> {
    try {
      // Use a hash of the worker name as the lock key
      const lockKey = 'transcript_worker';
      
      const { data, error } = await this.supabase.rpc('pg_try_advisory_lock', {
        key: lockKey
      });

      if (error) {
        this.logger.error('system', 'Error acquiring advisory lock', {
          metadata: { error: error.message }
        });
        return false;
      }

      const acquired = data as boolean;
      this.logger.debug('system', `Advisory lock ${acquired ? 'acquired' : 'not acquired'}`, {
        metadata: { lock_key: lockKey, acquired }
      });

      return acquired;
    } catch (error) {
      this.logger.error('system', 'Exception acquiring advisory lock', {
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
      return false;
    }
  }

  /**
   * Release PostgreSQL advisory lock
   */
  private async releaseAdvisoryLock(): Promise<void> {
    try {
      const lockKey = 'transcript_worker';
      
      const { error } = await this.supabase.rpc('pg_advisory_unlock', {
        key: lockKey
      });

      if (error) {
        this.logger.error('system', 'Error releasing advisory lock', {
          metadata: { error: error.message }
        });
      } else {
        this.logger.debug('system', 'Advisory lock released', {
          metadata: { lock_key: lockKey }
        });
      }
    } catch (error) {
      this.logger.error('system', 'Exception releasing advisory lock', {
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  /**
   * Query episodes that need transcripts within the lookback window
   * @returns Promise<EpisodeWithShow[]> Episodes needing transcripts
   */
  private async queryEpisodesNeedingTranscripts(): Promise<EpisodeWithShow[]> {
    // If last10Mode flag === false, skip all episodes entirely.
    if (this.config.last10Mode === false) {
      this.logger.info('system', 'TRANSCRIPT_WORKER_L10 disabled - skipping episode selection');
      return [];
    }

    // When last10Mode === true, after query we will override filtering to include last 10.

    const startTime = Date.now();
    
    console.log('DEBUG: Starting episode query with lookback hours:', this.config.lookbackHours);
    console.log('DEBUG: Lookback date:', new Date(Date.now() - this.config.lookbackHours * 60 * 60 * 1000).toISOString());
    
    this.logger.debug('system', 'Querying episodes needing transcripts', {
      metadata: { 
        lookback_hours: this.config.lookbackHours,
        max_requests: this.config.maxRequests
      }
    });

    try {
      // Query episodes from the last N hours that don't have transcripts
      // Use LEFT JOIN to find episodes without matching transcript records
      this.logger.info('system', 'Executing Supabase query for episodes', {
        metadata: { lookback_hours: this.config.lookbackHours }
      });
      
      const { data: initialData, error: initialError } = await this.supabase
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
          podcast_shows!inner (
            id,
            rss_url,
            title
          )
        `)
        .gte('pub_date', new Date(Date.now() - this.config.lookbackHours * 60 * 60 * 1000).toISOString())
        .not('podcast_shows.rss_url', 'is', null) // Must have RSS URL for Taddy lookup
        .not('podcast_shows.rss_url', 'eq', '') // RSS URL must not be empty
        .not('guid', 'is', null) // Must have GUID for Taddy lookup
        .not('guid', 'eq', '') // GUID must not be empty
        .order('pub_date', { ascending: false }) // Most recent first
        .limit(this.config.maxRequests * 2); // Query more than we need for filtering

      const queryError = initialError;
      let rawEpisodes = initialData || [];

      console.log('DEBUG: Query completed - error:', !!queryError, 'data length:', rawEpisodes.length);
      if (rawEpisodes.length > 0) {
        console.log('DEBUG: First episode data:', JSON.stringify(rawEpisodes[0], null, 2));
      }
      
      this.logger.info('system', 'Supabase query completed', {
        metadata: { 
          has_error: !!queryError, 
          data_length: rawEpisodes.length,
          error_message: queryError?.message || 'none'
        }
      });

      if (queryError) {
        throw new Error(`Failed to query episodes: ${queryError.message}`);
      }

      if (rawEpisodes.length === 0) {
        this.logger.warn('system', 'Primary episode query returned no data; attempting fallback query', {
          metadata: { lookback_hours: this.config.lookbackHours }
        });

        // First attempt: same look-back filter but without joins
        const { data: simpleData, error: simpleError } = await this.supabase
          .from('podcast_episodes')
          .select('*')
          .gte('pub_date', new Date(Date.now() - this.config.lookbackHours * 60 * 60 * 1000).toISOString());

        if (simpleError) {
          throw new Error(`Fallback episode query failed: ${simpleError.message}`);
        }

        let fallbackEpisodes = simpleData || [];

        // If we STILL didn't get any rows, broaden the query further and apply the look-back filter client-side.
        if (fallbackEpisodes.length === 0) {
          const { data: allEpisodes, error: allError } = await this.supabase
            .from('podcast_episodes')
            .select('*');

          if (allError) {
            throw new Error(`Broad fallback episode query failed: ${allError.message}`);
          }

          const cutoff = Date.now() - this.config.lookbackHours * 60 * 60 * 1000;
          fallbackEpisodes = (allEpisodes || []).filter(ep => {
            if (!ep.pub_date) return false;
            return new Date(ep.pub_date).getTime() >= cutoff;
          });
        }

        if (fallbackEpisodes.length === 0) {
          return [];
        }

        rawEpisodes = fallbackEpisodes;
      }

      // Filter out episodes that already have transcripts
      const episodeIds = rawEpisodes.map(ep => ep.id);
      
      const { data: existingTranscripts, error: transcriptError } = await this.supabase
        .from('transcripts')
        .select('episode_id')
        .in('episode_id', episodeIds)
        .is('deleted_at', null); // Exclude soft-deleted transcripts

      if (transcriptError) {
        throw new Error(`Failed to query existing transcripts: ${transcriptError.message}`);
      }

      // Create a set of episode IDs that already have transcripts
      const episodesWithTranscripts = new Set(
        (existingTranscripts || []).map(t => t.episode_id)
      );

      // Filter out episodes that already have transcripts
      let episodesNeedingTranscripts = rawEpisodes.filter(episode => {
        if (this.config.last10Mode) {
          // In last10 mode, include episodes even if transcript exists
          return true;
        }
        return !episodesWithTranscripts.has(episode.id);
      });

      if (this.config.last10Mode) {
        episodesNeedingTranscripts = episodesNeedingTranscripts.slice(0, 10);
      }

      // DEBUG: log how many episodes are deemed needing transcripts
      console.log('DEBUG: episodesNeedingTranscripts length:', episodesNeedingTranscripts.length);

      // Ensure each episode has its show info (rss_url & title). If not present (fallback query), fetch.
      const episodesMissingShowInfo = episodesNeedingTranscripts.filter(ep => !ep.podcast_shows);
      if (episodesMissingShowInfo.length > 0) {
        const showIdsToFetch = Array.from(new Set(episodesMissingShowInfo.map(ep => ep.show_id)));
        const { data: showRows, error: showError } = await this.supabase
          .from('podcast_shows')
          .select('id,rss_url,title')
          .in('id', showIdsToFetch);

        if (showError) {
          throw new Error(`Failed to fetch show data for fallback episodes: ${showError.message}`);
        }

        const showMap = new Map<string, { id: string; rss_url: string; title: string }>();
        (showRows || []).forEach(row => showMap.set(row.id, { id: row.id, rss_url: row.rss_url, title: row.title }));

        // Attach show info
        episodesMissingShowInfo.forEach(ep => {
          ep.podcast_shows = showMap.get(ep.show_id) as any;
        });
      }

      const elapsedMs = Date.now() - startTime;
      
      this.logger.info('system', 'Episodes query completed', {
        metadata: {
          total_episodes_in_window: rawEpisodes.length,
          episodes_with_transcripts: episodesWithTranscripts.size,
          episodes_needing_transcripts: episodesNeedingTranscripts.length,
          elapsed_ms: elapsedMs,
          lookback_hours: this.config.lookbackHours
        }
      });

      // Transform to EpisodeWithShow format and handle both array & object join shapes
      return episodesNeedingTranscripts.map((episode): EpisodeWithShow => {
        const showJoin: any = episode.podcast_shows;

        let show: { id: string; rss_url: string; title: string } | undefined;
        if (Array.isArray(showJoin)) {
          if (showJoin.length > 0) {
            show = {
              id: showJoin[0].id,
              rss_url: showJoin[0].rss_url,
              title: showJoin[0].title
            };
          }
        } else if (showJoin && typeof showJoin === 'object') {
          show = {
            id: showJoin.id,
            rss_url: showJoin.rss_url,
            title: showJoin.title
          };
        }

        return {
          id: episode.id,
          show_id: episode.show_id,
          guid: episode.guid,
          episode_url: episode.episode_url,
          title: episode.title,
          description: episode.description,
          pub_date: episode.pub_date,
          duration_sec: episode.duration_sec,
          created_at: episode.created_at,
          show
        } as EpisodeWithShow;
      });

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('system', 'Failed to query episodes needing transcripts', {
        metadata: {
          error: errorMessage,
          elapsed_ms: elapsedMs,
          lookback_hours: this.config.lookbackHours
        }
      });

      throw error;
    }
  }

  /**
   * Process episodes with controlled concurrency
   * @param episodes Episodes to process
   * @param jobId Job identifier for logging
   * @returns Promise<EpisodeProcessingResult[]> Results of processing
   */
  private async processEpisodesWithConcurrency(
    episodes: EpisodeWithShow[], 
    jobId: string
  ): Promise<EpisodeProcessingResult[]> {
    const concurrency = Math.min(this.config.concurrency, episodes.length);
    
    this.logger.info('system', 'Starting episode processing with concurrency control', {
      metadata: {
        job_id: jobId,
        total_episodes: episodes.length,
        concurrency: concurrency
      }
    });

    // Process episodes in batches with controlled concurrency
    const results: EpisodeProcessingResult[] = [];
    
    // Split episodes into chunks for batch processing
    const batchSize = 50; // Process in pages of 50 as per PRD
    const batches: EpisodeWithShow[][] = [];
    
    for (let i = 0; i < episodes.length; i += batchSize) {
      batches.push(episodes.slice(i, i + batchSize));
    }

    this.logger.debug('system', `Processing ${batches.length} batches of episodes`, {
      metadata: {
        job_id: jobId,
        total_batches: batches.length,
        batch_size: batchSize
      }
    });

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // Check if quota was exhausted in previous batch
      if (this.quotaExhausted) {
        this.logger.warn('system', 'Quota exhausted - skipping remaining batches', {
          metadata: {
            job_id: jobId,
            remaining_batches: batches.length - batchIndex,
            remaining_episodes: batches.slice(batchIndex).reduce((sum, b) => sum + b.length, 0)
          }
        });
        break;
      }
      
      this.logger.debug('system', `Processing batch ${batchIndex + 1}/${batches.length}`, {
        metadata: {
          job_id: jobId,
          batch_index: batchIndex + 1,
          batch_size: batch.length
        }
      });

      // Process episodes in this batch with concurrency control
      const batchPromises = batch.map(episode => 
        this.processEpisode(episode, jobId)
      );

      // Use Promise.allSettled to handle individual episode failures gracefully
      const batchResults = await Promise.allSettled(batchPromises);

      // Extract results and handle any rejections
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const episode = batch[i];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
          
          // Check if quota was exhausted during this episode
          if (this.quotaExhausted) {
            this.logger.warn('system', 'Quota exhausted during batch - stopping processing', {
              metadata: {
                job_id: jobId,
                current_batch: batchIndex + 1,
                processed_in_batch: i + 1,
                total_processed: results.length
              }
            });
            break;
          }
        } else {
          // Handle rejected promise - create an error result
          const errorResult: EpisodeProcessingResult = {
            episodeId: episode.id,
            status: 'error',
            elapsedMs: 0,
            error: `Promise rejected: ${result.reason}`
          };
          results.push(errorResult);
          
          this.logger.error('system', 'Episode processing promise rejected', {
            metadata: {
              job_id: jobId,
              episode_id: episode.id,
              error: result.reason
            }
          });
        }
      }

      // If quota exhausted, stop processing
      if (this.quotaExhausted) {
        break;
      }

      // Add a small delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    this.logger.info('system', 'Episode processing completed', {
      metadata: {
        job_id: jobId,
        total_processed: results.length,
        successful: results.filter(r => r.status === 'available').length,
        failed: results.filter(r => r.status === 'error').length
      }
    });

    return results;
  }

  /**
   * Process a single episode: fetch transcript, store file, record in database
   * @param episode Episode to process
   * @param jobId Job identifier for logging
   * @returns Promise<EpisodeProcessingResult> Result of processing
   */
  private async processEpisode(
    episode: EpisodeWithShow, 
    jobId: string
  ): Promise<EpisodeProcessingResult> {
    const startTime = Date.now();
    
    this.logger.debug('system', 'Processing episode', {
      metadata: {
        job_id: jobId,
        episode_id: episode.id,
        episode_title: episode.title,
        show_title: episode.show?.title,
        rss_url: episode.show?.rss_url
      }
    });

    try {
      // Step 1: Fetch transcript from Taddy
      const transcriptResult = await this.transcriptService.getTranscript(episode);
      
      // Step 2: Map transcript result to our status values and handle storage
      const result = await this.handleTranscriptResult(episode, transcriptResult, jobId);
      
      const elapsedMs = Date.now() - startTime;
      result.elapsedMs = elapsedMs;

      this.logger.info('system', 'Episode processed successfully', {
        metadata: {
          job_id: jobId,
          episode_id: episode.id,
          status: result.status,
          word_count: result.wordCount,
          elapsed_ms: elapsedMs,
          storage_path: result.storagePath
        }
      });

      return result;

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('system', 'Episode processing failed', {
        metadata: {
          job_id: jobId,
          episode_id: episode.id,
          error: errorMessage,
          elapsed_ms: elapsedMs,
          stack_trace: error instanceof Error ? error.stack : undefined
        }
      });

      // Record error in database with ON CONFLICT DO NOTHING for idempotency
      try {
        await this.recordTranscriptInDatabase(episode.id, '', 'error', 0);
      } catch (dbError) {
        this.logger.warn('system', 'Failed to record error in database', {
          metadata: {
            job_id: jobId,
            episode_id: episode.id,
            db_error: dbError instanceof Error ? dbError.message : String(dbError)
          }
        });
      }

      return {
        episodeId: episode.id,
        status: 'error',
        elapsedMs,
        error: errorMessage
      };
    }
  }

  /**
   * Handle the result from TranscriptService and store/record as appropriate
   * @param episode Episode being processed
   * @param transcriptResult Result from Taddy API
   * @param jobId Job identifier for logging
   * @returns Promise<EpisodeProcessingResult> Processing result
   */
  private async handleTranscriptResult(
    episode: EpisodeWithShow,
    transcriptResult: ExtendedTranscriptResult,
    jobId: string
  ): Promise<EpisodeProcessingResult> {
    const baseResult: Partial<EpisodeProcessingResult> = {
      episodeId: episode.id,
      elapsedMs: 0 // Will be set by caller
    };

    switch (transcriptResult.kind) {
      case 'full': {
        // Store complete transcript file and record in database
        const fullStoragePath = await this.storeTranscriptFile(
          episode, 
          transcriptResult.text, 
          jobId
        );
        
        await this.recordTranscriptInDatabase(
          episode.id, 
          fullStoragePath, 
          'available', // Map 'full' to 'available' for database compatibility
          transcriptResult.wordCount,
          transcriptResult.source
        );

        return {
          ...baseResult,
          status: 'available', // Use 'available' instead of 'full'
          storagePath: fullStoragePath,
          wordCount: transcriptResult.wordCount
        } as EpisodeProcessingResult;
      }

      case 'partial': {
        // Store partial transcript file and record in database
        const partialStoragePath = await this.storeTranscriptFile(
          episode, 
          transcriptResult.text, 
          jobId
        );
        
        await this.recordTranscriptInDatabase(
          episode.id, 
          partialStoragePath, 
          'available', // Map 'partial' to 'available' for database compatibility  
          transcriptResult.wordCount,
          transcriptResult.source
        );

        return {
          ...baseResult,
          status: 'available', // Use 'available' instead of 'partial'
          storagePath: partialStoragePath,
          wordCount: transcriptResult.wordCount
        } as EpisodeProcessingResult;
      }

      case 'processing': {
        // Transcript is being generated by Taddy - record processing status
        await this.recordTranscriptInDatabase(
          episode.id, 
          '', // No storage path for processing transcripts
          'processing', 
          0, // No word count yet
          transcriptResult.source
        );
        
        this.logger.info('system', 'Transcript marked as processing', {
          metadata: {
            job_id: jobId,
            episode_id: episode.id,
            source: transcriptResult.source,
            credits_consumed: transcriptResult.creditsConsumed
          }
        });

        return {
          ...baseResult,
          status: 'processing'
        } as EpisodeProcessingResult;
      }

      case 'not_found':
        // Episode found but no transcript available - map to error status
        await this.recordTranscriptInDatabase(episode.id, '', 'error', 0, transcriptResult.source);
        return {
          ...baseResult,
          status: 'error', // Map 'not_found' to 'error' for database compatibility
          error: 'No transcript found for episode'
        } as EpisodeProcessingResult;

      case 'no_match':
        // Episode not found in Taddy database - map to error status
        await this.recordTranscriptInDatabase(episode.id, '', 'error', 0, transcriptResult.source);
        return {
          ...baseResult,
          status: 'error', // Map 'no_match' to 'error' for database compatibility
          error: 'Episode not found in transcript database'
        } as EpisodeProcessingResult;

      case 'error': {
        // API error or processing failure
        await this.recordTranscriptInDatabase(episode.id, '', 'error', 0, transcriptResult.source);
        
        // Check if this is a quota exhaustion error
        if (this.isQuotaExhaustionError(transcriptResult.message)) {
          this.quotaExhausted = true;
          this.logger.warn('system', 'Taddy API quota exhausted - aborting remaining episodes', {
            metadata: {
              job_id: jobId,
              episode_id: episode.id,
              error_message: transcriptResult.message,
              source: transcriptResult.source
            }
          });
        }
        
        return {
          ...baseResult,
          status: 'error',
          error: transcriptResult.message
        } as EpisodeProcessingResult;
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = transcriptResult;
        throw new Error(`Unhandled transcript result kind: ${JSON.stringify(transcriptResult)}`);
      }
    }
  }

  /**
   * Store transcript text as gzipped JSONL file in Supabase Storage
   * @param episode Episode the transcript belongs to
   * @param transcriptText Raw transcript text
   * @param jobId Job identifier for logging
   * @returns Promise<string> Storage path of uploaded file
   */
  private async storeTranscriptFile(
    episode: EpisodeWithShow,
    transcriptText: string,
    jobId: string
  ): Promise<string> {
    // Create JSONL format (one JSON object per line)
    // For now, we'll store as a simple structure - can be enhanced later
    const jsonlContent = JSON.stringify({
      episode_id: episode.id,
      show_id: episode.show_id,
      transcript: transcriptText,
      created_at: new Date().toISOString()
    });

    // Compress with gzip
    const compressedContent = await gzipAsync(Buffer.from(jsonlContent, 'utf8'));

    // Generate storage path: show_id/episode_id.jsonl.gz
    const storagePath = `${episode.show_id}/${episode.id}.jsonl.gz`;

    this.logger.debug('system', 'Uploading transcript to storage', {
      metadata: {
        job_id: jobId,
        episode_id: episode.id,
        storage_path: storagePath,
        original_size: jsonlContent.length,
        compressed_size: compressedContent.length,
        compression_ratio: (compressedContent.length / jsonlContent.length * 100).toFixed(1) + '%'
      }
    });

    // Upload to Supabase Storage
    // Note: Content is gzipped JSONL (JSON Lines) format but we use 'application/gzip' 
    // as the MIME type since Supabase Storage doesn't recognize 'application/jsonlines+gzip'
    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(storagePath, compressedContent, {
        contentType: 'application/gzip',
        upsert: true // Allow overwriting if file exists
      });

    if (error) {
      throw new Error(`Failed to upload transcript to storage: ${error.message}`);
    }

    this.logger.debug('system', 'Transcript uploaded successfully', {
      metadata: {
        job_id: jobId,
        episode_id: episode.id,
        storage_path: storagePath
      }
    });

    return storagePath;
  }

  /**
   * Record transcript metadata in the database with idempotent conflict handling
   * @param episodeId Episode ID
   * @param storagePath Storage path (empty for non-stored statuses)
   * @param status Transcript status
   * @param wordCount Word count (0 for non-text statuses)
   * @param source Optional source of the transcript ('taddy' or 'podcaster')
   */
  private async recordTranscriptInDatabase(
    episodeId: string,
    storagePath: string,
    status: TranscriptStatus,
    wordCount: number,
    source?: 'taddy' | 'podcaster'
  ): Promise<void> {
    // Only pass wordCount if it's greater than 0 (for available transcripts)
    const wordCountParam = wordCount > 0 ? wordCount : undefined;

    try {
      await insertTranscript(episodeId, storagePath, status, wordCountParam, source);

      this.logger.debug('system', 'Transcript recorded in database', {
        metadata: {
          episode_id: episodeId,
          status: status,
          storage_path: storagePath,
          word_count: wordCount,
          source: source
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle unique-constraint violation (transcript already exists)
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
        if (this.config.last10Mode === true) {
          // Overwrite existing row with new data
          try {
            await overwriteTranscript(episodeId, storagePath, status, wordCountParam, source);

            this.logger.debug('system', 'Transcript overwritten (last10Mode)', {
              metadata: {
                episode_id: episodeId,
                status: status,
                storage_path: storagePath,
                word_count: wordCountParam,
                source: source
              }
            });
          } catch (updateErr) {
            this.logger.error('system', 'Failed to overwrite existing transcript row', {
              metadata: {
                episode_id: episodeId,
                original_error: errorMessage,
                overwrite_error: updateErr instanceof Error ? updateErr.message : String(updateErr)
              }
            });
            throw updateErr; // Re-throw so caller knows we failed
          }
        } else {
          // Normal nightly behaviour: skip duplicate
          this.logger.debug('system', 'Transcript already exists for episode - skipping (idempotent)', {
            metadata: {
              episode_id: episodeId,
              status: status,
              source: source
            }
          });
        }
        return; // Conflict handled
      }

      // Other errors – bubble up
      throw error;
    }
  }

  /**
   * Check if an error message indicates quota exhaustion
   *
   * Unified abstraction: Any upstream response that points to Taddy credit
   * exhaustion (HTTP 429, explicit `CREDITS_EXCEEDED` code, generic quota or
   * rate-limit wording) is normalised by this helper so the rest of the worker
   * can treat them identically.  This lets us maintain a single guard branch
   * (`if (this.isQuotaExhaustionError(...))`) instead of sprinkling special-case
   * string checks throughout the codebase.  If Taddy adds new phrases in the
   * future we can extend the `quotaPatterns` list here without touching other
   * logic.
   * @param errorMessage Error message to check
   * @returns boolean True if quota exhausted
   */
  private isQuotaExhaustionError(errorMessage: string): boolean {
    const quotaPatterns = [
      'HTTP 429',
      'credits exceeded',
      'quota exceeded',
      'rate limit',
      'too many requests',
      'CREDITS_EXCEEDED'
    ];
    
    const lowerMessage = errorMessage.toLowerCase();
    return quotaPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
  }

  /**
   * Aggregate processing results into summary
   * @param results Individual episode processing results
   * @param startTime Start time of the run
   * @returns TranscriptWorkerSummary Aggregated summary
   */
  private aggregateResults(
    results: EpisodeProcessingResult[], 
    startTime: number
  ): TranscriptWorkerSummary {
    const totalElapsedMs = Date.now() - startTime;
    const processedEpisodes = results.length;
    
    let availableTranscripts = 0;
    let processingCount = 0;
    let errorCount = 0;

    for (const result of results) {
      switch (result.status) {
        case 'available':
          availableTranscripts++;
          break;
        case 'processing':
          processingCount++;
          break;
        case 'error':
          errorCount++;
          break;
        default:
          // Handle any unexpected status values
          errorCount++; 
          break;
      }
    }

    const averageProcessingTimeMs = processedEpisodes > 0 
      ? Math.round(results.reduce((sum, r) => sum + r.elapsedMs, 0) / processedEpisodes)
      : 0;

    return {
      totalEpisodes: processedEpisodes, // This will be updated by caller
      processedEpisodes,
      availableTranscripts,
      processingCount,
      errorCount,
      totalElapsedMs,
      averageProcessingTimeMs
    };
  }
} 