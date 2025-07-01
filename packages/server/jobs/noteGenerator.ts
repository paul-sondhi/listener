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

// Define interfaces for type safety
interface EpisodeNotesResult {
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

  constructor() {
    this.logger = createLogger();
    this.startTime = Date.now();
  }

  /**
   * Main entry point for the episode notes worker
   * @returns Promise<NotesWorkerSummary> Summary of processing results
   */
  async run(): Promise<NotesWorkerSummary> {
    const jobId = `notes-worker-${Date.now()}`;
    
    this.logger.info('system', 'Episode Notes Worker starting', {
      metadata: {
        job_id: jobId,
        worker_type: 'episode_notes',
        start_time: new Date().toISOString()
      }
    });

    try {
      // TODO: Implement main worker logic
      // 1. Load configuration and validate environment
      // 2. Query for candidate transcripts
      // 3. Process transcripts with concurrency control
      // 4. Generate summary and return results
      
      // Placeholder implementation
      const summary: NotesWorkerSummary = {
        totalCandidates: 0,
        processedEpisodes: 0,
        successfulNotes: 0,
        errorCount: 0,
        totalElapsedMs: Date.now() - this.startTime,
        averageProcessingTimeMs: 0
      };

      this.logger.info('system', 'Episode Notes Worker completed successfully', {
        metadata: {
          job_id: jobId,
          ...summary
        }
      });

      return summary;

    } catch (error) {
      const elapsedMs = Date.now() - this.startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('system', 'Episode Notes Worker failed with unhandled exception', {
        metadata: {
          job_id: jobId,
          error: errorMessage,
          elapsed_ms: elapsedMs,
          stack_trace: error instanceof Error ? error.stack : undefined
        }
      });

      // Re-throw to ensure proper exit code
      throw error;
    }
  }
}

/**
 * CLI entry point with graceful error handling and exit codes
 */
async function main(): Promise<void> {
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
function setupSignalHandlers(): void {
  const handleSignal = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    // TODO: Implement graceful shutdown logic
    // - Cancel in-flight Gemini requests
    // - Write final summary
    // - Close database connections
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

// Only run main if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSignalHandlers();
  main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(3);
  });
} 