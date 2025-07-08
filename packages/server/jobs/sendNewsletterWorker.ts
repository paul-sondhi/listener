#!/usr/bin/env node

/**
 * Send Newsletter Worker
 *
 * Nightly job to send newsletter editions to users via email.
 * This worker processes unsent newsletter editions and sends them using the configured email client.
 *
 * Usage:
 *   npx tsx jobs/sendNewsletterWorker.ts                    # Normal mode
 *   SEND_WORKER_L10=true npx tsx jobs/sendNewsletterWorker.ts  # Testing mode (last 10 to test email)
 *
 * Environment Variables:
 *   SEND_LOOKBACK            - Hours to look back for unsent editions (default: 24)
 *   SEND_WORKER_L10          - Testing mode: send 10 most recent editions to test email (default: false)
 *   SEND_WORKER_CRON         - Cron schedule (default: '0 5 * * 1-5')
 *   SEND_WORKER_ENABLED      - Enable/disable worker (default: true)
 *   RESEND_API_KEY           - Resend API key (required)
 *   SEND_FROM_EMAIL          - Email address to send from (required)
 *   TEST_RECEIVER_EMAIL      - Email address to send test emails to (required for L10 mode)
 *
 * Exit Codes:
 *   0 - Success (all eligible editions sent)
 *   1 - Configuration error (missing env vars, invalid config)
 *   2 - Database or email client connection error
 *   3 - Unhandled exception during processing
 *
 * @author Listener Team
 * @since 2025-07-08
 */

import { createLogger, Logger } from '../lib/logger.js';
import { getSendNewsletterWorkerConfig, validateDependencies } from '../config/sendNewsletterWorkerConfig.js';
import { getSharedSupabaseClient } from '../lib/db/sharedSupabaseClient.js';
import { 
  queryNewsletterEditionsForSending,
  queryLast10NewsletterEditionsForSending,
  updateNewsletterEditionSentAt,
  type NewsletterEditionWithUser
} from '../lib/db/sendNewsletterQueries.js';
import '../lib/debugFilter.js';
import { createEmailClient } from '../lib/clients/emailClient.js';
import { buildSubject } from '../lib/utils/subjectBuilder.js';
import { injectEditionPlaceholders } from '../lib/utils/injectEditionPlaceholders.js';

// Define interfaces for type safety
interface SendWorkerSummary {
  totalCandidates: number;
  processedEditions: number;
  successfulSends: number;
  errorCount: number;
  noContentCount: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
  successRate: number;
}

/**
 * Main Send Newsletter Worker class
 * Orchestrates the process of sending newsletter editions to users
 */
export class SendNewsletterWorker {
  private logger: Logger;
  private startTime: number;

  // Store partial results for graceful shutdown
  private partialResults: any[] = [];

  constructor() {
    this.logger = createLogger();
    this.startTime = Date.now();
  }

  /**
   * Main entry point for the send newsletter worker
   * @returns Promise<SendWorkerSummary> Summary of processing results
   */
  async run(): Promise<SendWorkerSummary> {
    const jobId = `send-${Date.now()}`;

    // 1. Load configuration
    const config = getSendNewsletterWorkerConfig();
    console.log(`Worker starting with config: ${JSON.stringify(config)}`);
    validateDependencies(config);

    // Initialize EmailClient
    const emailClient = createEmailClient(config.resendApiKey, config.sendFromEmail);

    this.logger.info('system', 'Send Newsletter Worker starting', {
      metadata: {
        job_id: jobId,
        lookback_hours: config.lookbackHours,
        last10_mode: config.last10Mode,
        cron_schedule: config.cronSchedule,
        send_from_email: config.sendFromEmail,
        test_receiver_email: config.testReceiverEmail
      }
    });

    const startTime = Date.now();
    const supabase = getSharedSupabaseClient();

    try {
      // 2. Query newsletter editions that need to be sent
      let editions: NewsletterEditionWithUser[];
      
      if (config.last10Mode) {
        this.logger.info('system', 'Using L10 mode - querying last 10 newsletter editions', {
          metadata: { job_id: jobId }
        });
        editions = await queryLast10NewsletterEditionsForSending(supabase);
      } else {
        this.logger.info('system', 'Using normal mode - querying editions within lookback window', {
          metadata: { 
            job_id: jobId,
            lookback_hours: config.lookbackHours
          }
        });
        editions = await queryNewsletterEditionsForSending(supabase, config.lookbackHours);
      }

      // Fail-fast debug: print how many editions were found and their IDs
      if (!editions || editions.length === 0) {
        this.logger.warn('system', 'No editions found for processing', {
          metadata: { job_id: jobId, last10Mode: config.last10Mode }
        });
      } else {
        this.logger.info('system', `Worker debug: found ${editions.length} editions. IDs: ${editions.map(e => e.id).join(', ')}`);
      }

      this.logger.info('system', 'Found newsletter editions for sending', {
        metadata: {
          job_id: jobId,
          total_editions: editions.length,
          mode: config.last10Mode ? 'L10' : 'NORMAL'
        }
      });

      // 3. Process each edition (placeholder for email sending logic)
      let successfulSends = 0;
      let errorCount = 0;
      let noContentCount = 0;
      const processingTimes: number[] = [];

      for (const edition of editions) {
        const editionStartTime = Date.now();
        
        try {
          // Skip if content is empty or null
          if (!edition.content || edition.content.trim().length === 0) {
            this.logger.warn('email', 'Skipping edition with empty content', {
              metadata: { 
                job_id: jobId,
                edition_id: edition.id,
                user_email: edition.user_email
              }
            });
            noContentCount++;
            continue;
          }

          // Build subject line
          const subject = buildSubject(edition.edition_date);

          // Prepare placeholder replacements
          const replacements = {
            USER_EMAIL: edition.user_email,
            EDITION_DATE: edition.edition_date,
            EPISODE_COUNT: 'N/A', // TODO: Replace with actual episode count if available
            FOOTER_TEXT: 'You are receiving this email as part of your Listener subscription. (Unsubscribe link coming soon.)'
          };

          // Inject placeholders into HTML
          const html = injectEditionPlaceholders(edition.content, replacements);

          // Determine recipient
          const to = config.last10Mode ? config.testReceiverEmail : edition.user_email;

          // Send email
          console.log(`About to send email for edition ${edition.id} to ${to}`);
          
          const sendResult = await emailClient.sendEmail({ to, subject, html }, jobId);

          if (sendResult.success) {
            successfulSends++;
            this.logger.info('email', 'Email sent successfully', {
              metadata: {
                job_id: jobId,
                edition_id: edition.id,
                to_email: to,
                subject: subject,
                message_id: sendResult.messageId
              }
            });
            // Only update sent_at in normal mode
            if (!config.last10Mode) {
              console.log('WORKER: About to update sent_at for edition', edition.id);
              const updatedEdition = await updateNewsletterEditionSentAt(supabase, edition.id);
              console.log('WORKER: updatedEdition after sent_at update:', JSON.stringify(updatedEdition));
            }
          } else {
            errorCount++;
            this.logger.error('email', 'Failed to send email', {
              metadata: {
                job_id: jobId,
                edition_id: edition.id,
                to_email: to,
                subject: subject,
                error: sendResult.error
              }
            });
          }
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('system', 'Failed to process newsletter edition', {
            metadata: {
              job_id: jobId,
              edition_id: edition.id,
              user_email: edition.user_email,
              error: errorMessage,
              processing_time_ms: Date.now() - editionStartTime
            }
          });
        }
        processingTimes.push(Date.now() - editionStartTime);
      }

      // 4. Create summary
      const totalElapsedMs = Date.now() - startTime;
      const averageProcessingTimeMs = processingTimes.length > 0 
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
        : 0;
      const successRate = editions.length > 0 ? (successfulSends / editions.length) * 100 : 0;

      const summary: SendWorkerSummary = {
        totalCandidates: editions.length,
        processedEditions: editions.length,
        successfulSends,
        errorCount,
        noContentCount,
        totalElapsedMs,
        averageProcessingTimeMs,
        successRate
      };

      // 5. Final summary log
      this.logger.info('system', 'Send Newsletter Worker completed', {
        metadata: {
          job_id: jobId,
          ...summary,
          success_rate: summary.successRate.toFixed(1)
        }
      });

      return summary;

    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('system', 'Send Newsletter Worker failed', {
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
  const worker = new SendNewsletterWorker();

  // Set up signal handlers for graceful shutdown
  setupSignalHandlers(worker);

  // Set up unhandled exception handlers
  setupUnhandledExceptionHandlers();

  try {
    console.log('🚀 Starting Send Newsletter Worker...');

    const result = await worker.run();

    console.log('✅ Send Newsletter Worker completed successfully', {
      totalEditions: result.totalCandidates,
      processedEditions: result.processedEditions,
      successfulSends: result.successfulSends,
      errorCount: result.errorCount,
      noContentCount: result.noContentCount,
      successRate: `${result.successRate.toFixed(1)}%`,
      totalTime: `${(result.totalElapsedMs / 1000).toFixed(1)}s`
    });

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('❌ Send Newsletter Worker failed:', errorMessage);

    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }

    // Determine exit code based on error type
    let exitCode = 3; // Default: unhandled exception

    if (errorMessage.includes('configuration') || errorMessage.includes('environment')) {
      exitCode = 1; // Configuration error
    } else if (errorMessage.includes('database') || errorMessage.includes('connection') || errorMessage.includes('email')) {
      exitCode = 2; // Database or email client connection error
    }

    process.exit(exitCode);
  }
}

/**
 * Set up signal handlers for graceful shutdown
 */
function setupSignalHandlers(worker: SendNewsletterWorker): void {
  const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    // Log partial results if available
    if (worker['partialResults'] && worker['partialResults'].length > 0) {
      console.log(`📊 Partial results: ${worker['partialResults'].length} editions processed`);
    }

    // Give a moment for cleanup, then exit
    setTimeout(() => {
      process.exit(0);
    }, 500);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

/**
 * Set up unhandled exception handlers
 */
function setupUnhandledExceptionHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Promise rejection:', reason);
    process.exit(3);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(3);
  });
}

// If this file is run directly, execute the CLI entry point
// ESM-safe check that works in both CommonJS and ES modules
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  _main();
} 