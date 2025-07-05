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
 *   EDITION_WORKER_L10=true npx tsx jobs/editionGenerator.ts  # Testing mode (last 10)
 * 
 * Environment Variables:
 *   EDITION_LOOKBACK_HOURS    - Hours to look back for episode notes (default: 24)
 *   EDITION_WORKER_L10        - Testing mode: overwrite last 10 newsletter editions (default: false)
 *   EDITION_PROMPT_PATH       - Path to prompt template file (default: prompts/newsletter-edition.md)
 *   GEMINI_API_KEY            - Google Gemini API key (required)
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
        lookback_hours: config.lookbackHours,
        last10_mode: config.last10Mode,
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
          ...summary,
          success_rate: workflowResult.successRate.toFixed(1),
          avg_timing_ms: workflowResult.averageTiming,
          error_breakdown: workflowResult.errorBreakdown,
          content_stats: workflowResult.contentStats,
          episode_stats: workflowResult.episodeStats
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
async function main(): Promise<void> {
  const worker = new NewsletterEditionWorker();
  
  // Set up signal handlers for graceful shutdown
  setupSignalHandlers(worker);
  
  // Set up unhandled exception handlers
  setupUnhandledExceptionHandlers();

  try {
    console.log('🚀 Starting Newsletter Edition Generator Worker...');
    
    const result = await worker.run();
    
    console.log('✅ Newsletter Edition Worker completed successfully', {
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

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error in main:', error);
    process.exit(3);
  });
} 