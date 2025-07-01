#!/usr/bin/env node

/**
 * Episode Notes Worker
 * 
 * Nightly job to generate structured episode notes from transcripts using Gemini 1.5 Flash.
 * This worker processes transcripts created within a configurable lookback window and generates
 * notes that will be used for newsletter generation.
 * 
 * Usage:
 *   npx tsx jobs/noteGenerator.ts                    # Normal mode
 *   NOTES_WORKER_L10=true npx tsx jobs/noteGenerator.ts  # Testing mode (last 10)
 * 
 * Environment Variables:
 *   NOTES_LOOKBACK_HOURS    - Hours to look back for new transcripts (default: 24)
 *   NOTES_WORKER_L10        - Testing mode: process last 10 transcripts (default: false)
 *   NOTES_MAX_CONCURRENCY   - Max simultaneous Gemini API calls (default: 30)
 *   NOTES_PROMPT_PATH       - Path to prompt template file (default: prompts/episode-notes.md)
 *   GEMINI_API_KEY          - Google Gemini API key (required)
 * 
 * Exit Codes:
 *   0 - Success (all eligible transcripts processed)
 *   1 - Configuration error (missing env vars, invalid prompt file)
 *   2 - Database connection error
 *   3 - Unhandled exception during processing
 * 
 * @author Listener Team
 * @since 2025-01-27
 */

import { createLogger, Logger } from '../lib/logger.js';
import { prepareTranscriptsForNotes, validateL10Mode, logL10ModeSummary } from '../lib/utils/notesWorkflow.js';
import { ConcurrencyPool } from '../lib/utils/concurrencyController.js';
import { TranscriptWithEpisode } from '../lib/db/notesQueries.js';
import { processEpisodeForNotes, EpisodeProcessingResult, aggregateProcessingResults } from '../lib/utils/episodeProcessor.js';

// Define interfaces for type safety
// Note: EpisodeNotesResult interface is kept for potential future use
interface _EpisodeNotesResult {
  episodeId: string;
  transcriptId: string;
  status: 'done' | 'error';
  notes?: string;
  model?: string;
  error?: string;
  elapsedMs: number;
}

interface NotesWorkerSummary {
  totalCandidates: number;
  processedEpisodes: number;
  successfulNotes: number;
  errorCount: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
}

/**
 * Main Episode Notes Worker class
 * Orchestrates the process of generating episode notes from transcripts
 */
class EpisodeNotesWorker {
  private logger: Logger;
  private startTime: number;

  // Store partial results for graceful shutdown
  private partialResults: EpisodeProcessingResult[] = [];

  constructor() {
    this.logger = createLogger();
    this.startTime = Date.now();
  }

  /**
   * Main entry point for the episode notes worker
   * @returns Promise<NotesWorkerSummary> Summary of processing results
   */
  async run(): Promise<NotesWorkerSummary> {
    const jobId = `notes-${Date.now()}`;

    // 1. Load configuration
    const config = getNotesWorkerConfig();
    validateDependencies(config);

    this.logger.info('system', 'Episode Notes Worker starting', {
      metadata: {
        job_id: jobId,
        lookback_hours: config.lookbackHours,
        max_concurrency: config.maxConcurrency,
        last10_mode: config.last10Mode,
        prompt_template_length: config.promptTemplate.length
      }
    });

    const startTime = Date.now();
    const supabase = getSharedSupabaseClient();

    try {
      // 2. Prepare transcripts (handles L10 mode clearing)
      const prepResult = await prepareTranscriptsForNotes(supabase, config);

      if (config.last10Mode) {
        const validation = validateL10Mode(prepResult.candidates, config);
        logL10ModeSummary(prepResult, validation);
      }

      if (prepResult.candidates.length === 0) {
        this.logger.warn('system', 'No transcripts found for notes generation; exiting');
        return {
          totalCandidates: 0,
          processedEpisodes: 0,
          successfulNotes: 0,
          errorCount: 0,
          totalElapsedMs: Date.now() - startTime,
          averageProcessingTimeMs: 0
        };
      }

      // 3. Process episodes with concurrency pool
      const pool = new ConcurrencyPool<TranscriptWithEpisode, EpisodeProcessingResult>(config.maxConcurrency);

      const processResults = await pool.process(
        prepResult.candidates,
        async (candidate) => {
          const result = await processEpisodeForNotes(supabase, candidate, config);
          this.partialResults.push(result); // Keep for graceful shutdown
          return result;
        },
        (progress) => {
          // Emit progress logs every 10% or every 30s
          this.logger.info('system', 'Notes worker progress', {
            metadata: {
              job_id: jobId,
              progress: `${progress.completed}/${progress.total}`,
              percentage: progress.percentage.toFixed(1),
              active: progress.active,
              elapsed_ms: progress.elapsedMs,
              est_remaining_ms: progress.estimatedRemainingMs
            }
          });
        }
      );

      const { results } = processResults;

      // Ensure we capture all results for final summary
      this.partialResults = results.filter(r => r !== null) as EpisodeProcessingResult[];

      // 4. Aggregate results
      const summaryStats = aggregateProcessingResults(results as EpisodeProcessingResult[]);

      const totalElapsedMs = Date.now() - startTime;

      const summary: NotesWorkerSummary = {
        totalCandidates: prepResult.candidates.length,
        processedEpisodes: summaryStats.totalEpisodes,
        successfulNotes: summaryStats.successfulNotes,
        errorCount: summaryStats.errorCount,
        totalElapsedMs,
        averageProcessingTimeMs: summaryStats.averageProcessingTimeMs
      };

      // 5. Final summary log
      this.logger.info('system', 'Episode Notes Worker completed', {
        metadata: {
          job_id: jobId,
          ...summary,
          success_rate: summaryStats.successRate.toFixed(1),
          avg_timing_ms: summaryStats.averageTiming,
          error_breakdown: summaryStats.errorBreakdown,
          word_count_stats: summaryStats.wordCountStats
        }
      });

      return summary;

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('system', 'Episode Notes Worker failed', {
        metadata: {
          job_id: jobId,
          error: errorMessage,
          elapsed_ms: elapsedMs,
          stack_trace: error instanceof Error ? error.stack : undefined
        }
      });

      throw error;
    }
  }
}

/**
 * CLI entry point with graceful error handling and exit codes
 * Note: This function is kept for potential future CLI usage
 */
async function _main(): Promise<void> {
  let exitCode = 0;
  
  try {
    // Create and run the worker
    const worker = new EpisodeNotesWorker();
    const summary = await worker.run();
    
    // Log final summary
    console.log('Episode Notes Worker Summary:', {
      totalCandidates: summary.totalCandidates,
      processedEpisodes: summary.processedEpisodes,
      successfulNotes: summary.successfulNotes,
      errorCount: summary.errorCount,
      successRate: summary.processedEpisodes > 0 ? 
        `${((summary.successfulNotes / summary.processedEpisodes) * 100).toFixed(1)}%` : '0%',
      totalElapsedMs: summary.totalElapsedMs,
      averageProcessingTimeMs: summary.averageProcessingTimeMs
    });
    
    // Determine exit code based on results
    if (summary.errorCount > 0 && summary.successfulNotes === 0) {
      // All episodes failed
      exitCode = 3;
    } else if (summary.processedEpisodes === 0 && summary.totalCandidates > 0) {
      // No episodes processed but candidates existed
      exitCode = 3;
    }
    // else: success (exit code 0)
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Episode Notes Worker failed:', errorMessage);
    
    // Determine specific exit code based on error type
    if (errorMessage.includes('configuration') || errorMessage.includes('environment')) {
      exitCode = 1; // Configuration error
    } else if (errorMessage.includes('database') || errorMessage.includes('connection')) {
      exitCode = 2; // Database error
    } else {
      exitCode = 3; // Unhandled exception
    }
  }
  
  // Graceful shutdown
  process.exit(exitCode);
}

/**
 * Signal handlers for graceful shutdown
 */
function setupSignalHandlers(worker: EpisodeNotesWorker): void {
  const gracefulShutdown = (signal: string) => {
    if ((worker as any)._shuttingDown) return; // Prevent double handling
    (worker as any)._shuttingDown = true;

    console.warn(`Received ${signal}. Flushing in-flight operations and writing summary…`);

    try {
      const results = worker.partialResults;
      const summary = aggregateProcessingResults(results);

      worker.logger.warn('system', 'Episode Notes Worker interrupted', {
        metadata: {
          signal,
          processed_episodes: summary.totalEpisodes,
          successful: summary.successfulNotes,
          errors: summary.errorCount,
          success_rate: summary.successRate.toFixed(1)
        }
      });
    } catch (err) {
      console.error('Failed to write interrupt summary:', err);
    } finally {
      setTimeout(() => process.exit(0), 200);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

/**
 * Catch unhandled promise rejections & uncaught exceptions
 * Ensures the process exits with a non-zero code so Render/cron detects failure
 */
function setupUnhandledExceptionHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    // Flush logs then exit with non-zero code
    setTimeout(() => process.exit(3), 100);
  });

  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Flush logs then exit with non-zero code
    setTimeout(() => process.exit(3), 100);
  });
}

// Only run main if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const w = new EpisodeNotesWorker();
  setupSignalHandlers(w);
  setupUnhandledExceptionHandlers();
  // Run main via the worker instance for access to partialResults
  w.run().then(() => process.exit(0)).catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(3);
  });
} 