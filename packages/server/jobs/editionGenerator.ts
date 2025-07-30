#!/usr/bin/env node

/**
 * Newsletter Edition Generator Worker
 * 
 * Nightly job to generate newsletter editions for users with active podcast subscriptions.
 * This worker processes users and generates personalized newsletters from their episode notes
 * within a configurable lookback window.
 * 
 * Usage:
 *   npx tsx jobs/editionGenerator.ts                    # Normal mode
 *   EDITION_WORKER_L10=true npx tsx jobs/editionGenerator.ts  # Testing mode (last 3)
 *   SUBJ_LINE_TEST=true npx tsx jobs/editionGenerator.ts  # Subject line test mode (overwrites existing)
 * 
 * Environment Variables:
 *   EDITION_LOOKBACK_HOURS    - Hours to look back for episode notes (default: 24)
 *   EDITION_WORKER_L10        - Testing mode: overwrite last 3 newsletter editions (default: false)
 *   EDITION_PROMPT_PATH       - Path to prompt template file (default: prompts/newsletter-edition.md)
 *   GEMINI_API_KEY            - Google Gemini API key (required)
 *   SUBJ_LINE_TEST            - Subject line test mode: regenerate subject lines for existing editions (default: false)
 *   SUBJ_LINE_TEST_COUNT      - Number of editions to process in subject line test mode (default: 5)
 * 
 * Exit Codes:
 *   0 - Success (all eligible users processed)
 *   1 - Configuration error (missing env vars, invalid prompt file)
 *   2 - Database connection error
 *   3 - Unhandled exception during processing
 * 
 * @author Listener Team
 * @since 2025-01-27
 */

import { createLogger, Logger } from '../lib/logger.js';
import { _prepareUsersForNewsletters, _validateL10Mode, _logL10ModeSummary, executeEditionWorkflow } from '../lib/utils/editionWorkflow.js';
import { getEditionWorkerConfig, validateDependencies } from '../config/editionWorkerConfig.js';
import { getSharedSupabaseClient } from '../lib/db/sharedSupabaseClient.js';
import '../lib/debugFilter.js';

// Define interfaces for type safety
interface EditionWorkerSummary {
  totalCandidates: number;
  processedUsers: number;
  successfulNewsletters: number;
  errorCount: number;
  noContentCount: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
  successRate: number;
}

/**
 * Main Newsletter Edition Generator Worker class
 * Orchestrates the process of generating newsletter editions for users
 */
export class NewsletterEditionWorker {
  private logger: Logger;
  private startTime: number;

  // Store partial results for graceful shutdown
  private partialResults: any[] = [];

  constructor() {
    this.logger = createLogger();
    this.startTime = Date.now();
  }

  /**
   * Main entry point for the newsletter edition worker
   * @returns Promise<EditionWorkerSummary> Summary of processing results
   */
  async run(): Promise<EditionWorkerSummary> {
    const jobId = `edition-${Date.now()}`;

    // 1. Load configuration
    const config = getEditionWorkerConfig();
    validateDependencies(config);

    this.logger.info('system', 'Newsletter Edition Worker starting', {
      metadata: {
        job_id: jobId,
        mode: config.subjLineTest ? 'SUBJECT_LINE_TEST' : (config.last10Mode ? 'L10_TESTING' : 'NORMAL'),
        lookback_hours: config.lookbackHours,
        last10_mode: config.last10Mode,
        subj_line_test: config.subjLineTest,
        subj_line_test_count: config.subjLineTestCount,
        prompt_path: config.promptPath,
        prompt_template_length: config.promptTemplate.length
      }
    });

    const startTime = Date.now();
    const supabase = getSharedSupabaseClient();

    try {
      // 2. Execute the complete workflow
      const workflowResult = await executeEditionWorkflow(supabase, config);

      // 3. Create summary
      const summary: EditionWorkerSummary = {
        totalCandidates: workflowResult.totalCandidates,
        processedUsers: workflowResult.processedUsers,
        successfulNewsletters: workflowResult.successfulNewsletters,
        errorCount: workflowResult.errorCount,
        noContentCount: workflowResult.noContentCount,
        totalElapsedMs: workflowResult.totalElapsedMs,
        averageProcessingTimeMs: workflowResult.averageProcessingTimeMs,
        successRate: workflowResult.successRate
      };

      // 4. Final summary log
      this.logger.info('system', 'Newsletter Edition Worker completed', {
        metadata: {
          job_id: jobId,
          mode: config.subjLineTest ? 'SUBJECT_LINE_TEST' : (config.last10Mode ? 'L10_TESTING' : 'NORMAL'),
          ...summary,
          success_rate: workflowResult.successRate.toFixed(1),
          avg_timing_ms: workflowResult.averageTiming,
          error_breakdown: workflowResult.errorBreakdown,
          content_stats: config.subjLineTest ? undefined : workflowResult.contentStats,
          episode_stats: config.subjLineTest ? undefined : workflowResult.episodeStats
        }
      });

      return summary;

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('system', 'Newsletter Edition Worker failed', {
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
 */
async function _main(): Promise<void> {
  const worker = new NewsletterEditionWorker();
  
  // Set up signal handlers for graceful shutdown
  setupSignalHandlers(worker);
  
  // Set up unhandled exception handlers
  setupUnhandledExceptionHandlers();

  try {
    const config = getEditionWorkerConfig();
    const mode = config.subjLineTest ? 'Subject Line Test Mode' : (config.last10Mode ? 'L10 Testing Mode' : 'Normal Mode');
    console.log(`🚀 Starting Newsletter Edition Generator Worker in ${mode}...`);
    
    const result = await worker.run();
    
    console.log('✅ Newsletter Edition Worker completed successfully', {
      mode: mode,
      totalUsers: result.totalCandidates,
      processedUsers: result.processedUsers,
      successfulNewsletters: result.successfulNewsletters,
      errorCount: result.errorCount,
      noContentCount: result.noContentCount,
      successRate: `${result.successRate.toFixed(1)}%`,
      totalTime: `${(result.totalElapsedMs / 1000).toFixed(1)}s`
    });
    
    process.exit(0);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('❌ Newsletter Edition Worker failed:', errorMessage);
    
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Determine exit code based on error type
    let exitCode = 3; // Default: unhandled exception
    
    if (errorMessage.includes('configuration') || errorMessage.includes('environment') || errorMessage.includes('prompt')) {
      exitCode = 1; // Configuration error
    } else if (errorMessage.includes('database') || errorMessage.includes('connection') || errorMessage.includes('supabase')) {
      exitCode = 2; // Database connection error
    }
    
    process.exit(exitCode);
  }
}

/**
 * Set up signal handlers for graceful shutdown
 */
function setupSignalHandlers(worker: NewsletterEditionWorker): void {
  const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    
    // Log partial results if available
    if (worker['partialResults'] && worker['partialResults'].length > 0) {
      console.log(`📊 Partial results: ${worker['partialResults'].length} users processed`);
    }
    
    // Give a moment for cleanup, then exit
    setTimeout(() => {
      console.log('👋 Goodbye!');
      process.exit(0);
    }, 1000);
  };

  // Handle SIGINT (Ctrl+C) and SIGTERM
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

/**
 * Set up unhandled exception handlers
 */
function setupUnhandledExceptionHandlers(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    console.error('Promise:', promise);
    process.exit(3);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(3);
  });
}

// ---------------------------------------------------------------------------
// Optional stand-alone CLI entry (EDITION_WORKER_CLI=true)
// ---------------------------------------------------------------------------
// We intentionally require an explicit environment flag **and** that this
// file is the direct entrypoint before running the worker.  This prevents the
// job from executing (and calling process.exit) when it is simply imported by
// the application server or unit tests – the exact same pattern used by the
// Episode Notes Worker.

if (process.env.EDITION_WORKER_CLI === 'true' && import.meta.url === `file://${process.argv[1]}`) {
  const worker = new NewsletterEditionWorker();
  setupSignalHandlers(worker);
  setupUnhandledExceptionHandlers();

  worker
    .run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Fatal error in edition worker CLI:', error instanceof Error ? error.message : error);
      process.exit(3);
    });
} 