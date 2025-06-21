import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';
import { TranscriptStatus } from '@listener/shared';
import { TranscriptService } from '../lib/services/TranscriptService.js';
import { TranscriptResult } from '../lib/clients/taddyFreeClient.js';
import { insertTranscript } from '../lib/db/transcripts.js';
import { getTranscriptWorkerConfig, TranscriptWorkerConfig } from '../config/transcriptWorkerConfig.js';
import { createLogger, Logger } from '../lib/logger.js';
import { promisify } from 'util';
import { gzip } from 'zlib';

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
  fullTranscripts: number;
  partialTranscripts: number;
  notFoundCount: number;
  noMatchCount: number;
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

  constructor(config?: Partial<TranscriptWorkerConfig>, logger?: Logger) {
    // Use provided config or load from environment
    this.config = config ? { ...getTranscriptWorkerConfig(), ...config } : getTranscriptWorkerConfig();
    this.logger = logger || createLogger();

    // Initialize Supabase client with service role for full access
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables for TranscriptWorker');
    }

    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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
        config: {
          lookbackHours: this.config.lookbackHours,
          maxRequests: this.config.maxRequests,
          concurrency: this.config.concurrency,
          useAdvisoryLock: this.config.useAdvisoryLock,
          cronSchedule: this.config.cronSchedule
        }
      }
    });

    let advisoryLockAcquired = false;
    let summary: TranscriptWorkerSummary = {
      totalEpisodes: 0,
      processedEpisodes: 0,
      fullTranscripts: 0,
      partialTranscripts: 0,
      notFoundCount: 0,
      noMatchCount: 0,
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
      const episodes = await this.queryEpisodesNeedingTranscripts();
      summary.totalEpisodes = episodes.length;

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
    const startTime = Date.now();
    
    this.logger.debug('system', 'Querying episodes needing transcripts', {
      metadata: { 
        lookback_hours: this.config.lookbackHours,
        max_requests: this.config.maxRequests
      }
    });

    try {
      // Query episodes from the last N hours that don't have transcripts
      // Use LEFT JOIN to find episodes without matching transcript records
      const { data, error } = await this.supabase
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
        .gte('pub_date', `now() - interval '${this.config.lookbackHours} hours'`)
        .is('deleted_at', null) // Exclude soft-deleted episodes
        .not('podcast_shows.rss_url', 'is', null) // Must have RSS URL for Taddy lookup
        .not('podcast_shows.rss_url', 'eq', '') // RSS URL must not be empty
        .not('guid', 'is', null) // Must have GUID for Taddy lookup
        .not('guid', 'eq', '') // GUID must not be empty
        .order('pub_date', { ascending: false }) // Most recent first
        .limit(this.config.maxRequests * 2); // Query more than we need for filtering

      if (error) {
        throw new Error(`Failed to query episodes: ${error.message}`);
      }

      if (!data || data.length === 0) {
        this.logger.debug('system', 'No episodes found in lookback window', {
          metadata: { lookback_hours: this.config.lookbackHours }
        });
        return [];
      }

      // Filter out episodes that already have transcripts
      // We need to check this separately due to Supabase query limitations
      const episodeIds = data.map(ep => ep.id);
      
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
      const episodesNeedingTranscripts = data.filter(episode => 
        !episodesWithTranscripts.has(episode.id)
      );

      const elapsedMs = Date.now() - startTime;
      
      this.logger.info('system', 'Episodes query completed', {
        metadata: {
          total_episodes_in_window: data.length,
          episodes_with_transcripts: episodesWithTranscripts.size,
          episodes_needing_transcripts: episodesNeedingTranscripts.length,
          elapsed_ms: elapsedMs,
          lookback_hours: this.config.lookbackHours
        }
      });

      // Transform to EpisodeWithShow format
      return episodesNeedingTranscripts.map(episode => ({
        id: episode.id,
        show_id: episode.show_id,
        guid: episode.guid,
        episode_url: episode.episode_url,
        title: episode.title,
        description: episode.description,
        pub_date: episode.pub_date,
        duration_sec: episode.duration_sec,
        created_at: episode.created_at,
        show: Array.isArray(episode.podcast_shows) && episode.podcast_shows.length > 0 ? {
          id: episode.podcast_shows[0].id,
          rss_url: episode.podcast_shows[0].rss_url,
          title: episode.podcast_shows[0].title
        } : undefined
      })) as EpisodeWithShow[];

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

      // Add a small delay between batches to be respectful to the API
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    this.logger.info('system', 'Episode processing completed', {
      metadata: {
        job_id: jobId,
        total_processed: results.length,
        successful: results.filter(r => r.status === 'full' || r.status === 'partial').length,
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
    transcriptResult: TranscriptResult,
    jobId: string
  ): Promise<EpisodeProcessingResult> {
    const baseResult: Partial<EpisodeProcessingResult> = {
      episodeId: episode.id,
      elapsedMs: 0 // Will be set by caller
    };

    switch (transcriptResult.kind) {
      case 'full':
        // Store complete transcript file and record in database
        const fullStoragePath = await this.storeTranscriptFile(
          episode, 
          transcriptResult.text, 
          jobId
        );
        
        await this.recordTranscriptInDatabase(
          episode.id, 
          fullStoragePath, 
          'full',
          transcriptResult.wordCount
        );

        return {
          ...baseResult,
          status: 'full',
          storagePath: fullStoragePath,
          wordCount: transcriptResult.wordCount
        } as EpisodeProcessingResult;

      case 'partial':
        // Store partial transcript file and record in database
        const partialStoragePath = await this.storeTranscriptFile(
          episode, 
          transcriptResult.text, 
          jobId
        );
        
        await this.recordTranscriptInDatabase(
          episode.id, 
          partialStoragePath, 
          'partial',
          transcriptResult.wordCount
        );

        return {
          ...baseResult,
          status: 'partial',
          storagePath: partialStoragePath,
          wordCount: transcriptResult.wordCount
        } as EpisodeProcessingResult;

      case 'not_found':
        // Episode found but no transcript available
        await this.recordTranscriptInDatabase(episode.id, '', 'not_found', 0);
        return {
          ...baseResult,
          status: 'not_found'
        } as EpisodeProcessingResult;

      case 'no_match':
        // Episode not found in Taddy database
        await this.recordTranscriptInDatabase(episode.id, '', 'no_match', 0);
        return {
          ...baseResult,
          status: 'no_match'
        } as EpisodeProcessingResult;

      case 'error':
        // API error or processing failure
        await this.recordTranscriptInDatabase(episode.id, '', 'error', 0);
        return {
          ...baseResult,
          status: 'error',
          error: transcriptResult.message
        } as EpisodeProcessingResult;

      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = transcriptResult;
        throw new Error(`Unhandled transcript result kind: ${JSON.stringify(transcriptResult)}`);
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
    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(storagePath, compressedContent, {
        contentType: 'application/jsonlines+gzip',
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
   */
  private async recordTranscriptInDatabase(
    episodeId: string,
    storagePath: string,
    status: TranscriptStatus,
    wordCount: number
  ): Promise<void> {
    try {
      await insertTranscript(episodeId, storagePath, status);
      
      this.logger.debug('system', 'Transcript recorded in database', {
        metadata: {
          episode_id: episodeId,
          status: status,
          storage_path: storagePath,
          word_count: wordCount
        }
      });
    } catch (error) {
      // Check if this is a conflict error (episode already has transcript)
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
        this.logger.debug('system', 'Transcript already exists for episode - skipping (idempotent)', {
          metadata: {
            episode_id: episodeId,
            status: status
          }
        });
        return; // Ignore conflict - this is expected for idempotency
      }
      
      // Re-throw other errors
      throw error;
    }
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
    
    let fullTranscripts = 0;
    let partialTranscripts = 0;
    let notFoundCount = 0;
    let noMatchCount = 0;
    let errorCount = 0;

    for (const result of results) {
      switch (result.status) {
        case 'full':
          fullTranscripts++;
          break;
        case 'partial':
          partialTranscripts++;
          break;
        case 'not_found':
          notFoundCount++;
          break;
        case 'no_match':
          noMatchCount++;
          break;
        case 'error':
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
      fullTranscripts,
      partialTranscripts,
      notFoundCount,
      noMatchCount,
      errorCount,
      totalElapsedMs,
      averageProcessingTimeMs
    };
  }
} 