/**
 * Newsletter Edition Workflow Orchestrator
 * 
 * High-level functions that coordinate the complete workflow of generating
 * newsletter editions, including special handling for L10 testing mode.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { EditionWorkerConfig } from '../../config/editionWorkerConfig.js';
import { queryUsersWithActiveSubscriptions, queryLast3NewsletterEditionsForUpdate } from '../db/editionQueries.js';
import { processUserForNewsletter, UserProcessingResult, aggregateUserProcessingResults } from './editionProcessor.js';
import { _updateNewsletterEdition } from '../db/newsletter-editions.ts';
import { debugSubscriptionRefresh } from '../debugLogger';

/**
 * Result of preparing users for newsletter generation
 */
export interface PrepareUsersResult {
  /** Users that need newsletter editions generated */
  candidates: Array<{
    id: string;
    email: string;
    subscriptions: Array<{
      id: string;
      show_id: string;
      status: string;
      podcast_shows?: {
        id: string;
        title: string;
        rss_url: string;
      };
    }>;
  }>;
  /** Existing editions to update in L10 mode */
  existingEditionsToUpdate: Array<{
    id: string;
    user_id: string;
    edition_date: string;
    user_email: string;
  }>;
  /** Whether L10 mode was active */
  wasL10Mode: boolean;
  /** Time taken for preparation in milliseconds */
  elapsedMs: number;
}

/**
 * Result of the complete newsletter edition workflow
 */
export interface EditionWorkflowResult {
  /** Total users with active subscriptions */
  totalCandidates: number;
  /** Number of users successfully processed */
  processedUsers: number;
  /** Number of successful newsletter editions generated */
  successfulNewsletters: number;
  /** Number of users that failed to process */
  errorCount: number;
  /** Number of users with no content found */
  noContentCount: number;
  /** Total time taken for the workflow in milliseconds */
  totalElapsedMs: number;
  /** Average processing time per user in milliseconds */
  averageProcessingTimeMs: number;
  /** Success rate as a percentage */
  successRate: number;
  /** Detailed timing breakdown */
  averageTiming: {
    queryMs: number;
    generationMs: number;
    databaseMs: number;
  };
  /** Retry statistics */
  retryStats: {
    totalRetries: number;
    usersWhoRetried: number;
    averageAttemptsPerUser: number;
    maxAttempts: number;
    retrySuccessRate: number;
  };
  /** Error breakdown by type */
  errorBreakdown: Record<string, number>;
  /** Content statistics */
  contentStats: {
    minLength: number;
    maxLength: number;
    averageLength: number;
    totalLength: number;
  };
  /** Episode statistics */
  episodeStats: {
    minEpisodes: number;
    maxEpisodes: number;
    averageEpisodes: number;
    totalEpisodes: number;
  };
}

/**
 * Prepare users for newsletter generation, handling L10 mode logic
 * 
 * This function orchestrates the complete preparation workflow:
 * 1. Query users with active subscriptions
 * 2. In L10 mode: clear existing editions for the last 10 newsletter editions
 * 3. Return the prepared list of users to process
 * 
 * @param supabase - Supabase client instance
 * @param config - Edition worker configuration
 * @returns Promise<PrepareUsersResult> - Prepared users and metadata
 */
export async function prepareUsersForNewsletters(
  supabase: SupabaseClient<Database>,
  config: EditionWorkerConfig
): Promise<PrepareUsersResult> {
  const startTime = Date.now();
  
  debugSubscriptionRefresh('Preparing users for newsletter generation', {
    lookbackHours: config.lookbackHours,
    last10Mode: config.last10Mode,
    mode: config.last10Mode ? 'L10_TESTING' : 'NORMAL'
  });

  try {
    // Step 1: Query users with active subscriptions
    const candidates = await queryUsersWithActiveSubscriptions(supabase);

    debugSubscriptionRefresh('Found users with active subscriptions', {
      candidateCount: candidates.length,
      mode: config.last10Mode ? 'L10' : 'normal'
    });

    let existingEditionsToUpdate: Array<{
      id: string;
      user_id: string;
      edition_date: string;
    }> = [];

    // Step 2: Handle L10 mode - prepare existing editions for update
    if (config.last10Mode) {
      debugSubscriptionRefresh('L10 mode active - preparing existing editions for update');
      
      const editionIds = await queryLast3NewsletterEditionsForUpdate(supabase);
      
      if (editionIds.length > 0) {
        existingEditionsToUpdate = editionIds;
        debugSubscriptionRefresh('Successfully prepared existing editions for update in L10 mode', {
          editionCount: editionIds.length
        });
      }
    }

    const elapsedMs = Date.now() - startTime;
    
    debugSubscriptionRefresh('User preparation completed', {
      candidateCount: candidates.length,
      existingEditionsToUpdateCount: existingEditionsToUpdate.length,
      wasL10Mode: config.last10Mode,
      elapsedMs
    });

    return {
      candidates,
      existingEditionsToUpdate,
      wasL10Mode: config.last10Mode,
      elapsedMs
    };

  } catch (error) {
    console.error('ERROR: Failed to prepare users for newsletters:', error);
    throw error;
  }
}

/**
 * Validate L10 mode requirements
 * 
 * @param candidates - Users to be processed
 * @param config - Edition worker configuration
 * @returns Validation result with warnings and recommendations
 */
export function validateL10Mode(
  candidates: Array<{ id: string; email: string; subscriptions: any[] }>,
  config: EditionWorkerConfig
): {
  isValid: boolean;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (!config.last10Mode) {
    return { isValid: true, warnings: [], recommendations: [] };
  }

  // Check if we have users to process
  if (candidates.length === 0) {
    warnings.push('L10 mode is active but no users with active subscriptions found');
    recommendations.push('Ensure there are users with active podcast subscriptions');
  }

  // Check if we have enough users for meaningful testing
  if (candidates.length < 3) {
    warnings.push(`L10 mode is active but only ${candidates.length} users found - limited test coverage`);
    recommendations.push('Consider running with more users for better test coverage');
  }

  // Check if users have subscriptions
  const usersWithSubscriptions = candidates.filter(user => user.subscriptions.length > 0);
  if (usersWithSubscriptions.length === 0) {
    warnings.push('L10 mode is active but no users have active subscriptions');
    recommendations.push('Ensure users have active podcast subscriptions');
  }

  return {
    isValid: candidates.length > 0,
    warnings,
    recommendations
  };
}

/**
 * Log L10 mode summary
 * 
 * @param prepResult - Result of preparing users
 * @param validation - Validation result for L10 mode
 */
export function logL10ModeSummary(
  prepResult: PrepareUsersResult,
  validation: { isValid: boolean; warnings: string[]; recommendations: string[] }
): void {
  debugSubscriptionRefresh('L10 Mode Summary', {
    candidateCount: prepResult.candidates.length,
    existingEditionsToUpdateCount: prepResult.existingEditionsToUpdate.length,
    isValid: validation.isValid,
    warnings: validation.warnings,
    recommendations: validation.recommendations
  });

  if (validation.warnings.length > 0) {
    debugSubscriptionRefresh('L10 Mode Warnings', {
      warnings: validation.warnings
    });
  }

  if (validation.recommendations.length > 0) {
    debugSubscriptionRefresh('L10 Mode Recommendations', {
      recommendations: validation.recommendations
    });
  }
}

/**
 * Execute the complete newsletter edition workflow
 * 
 * This function orchestrates the complete workflow:
 * 1. Prepare users (handles L10 mode clearing)
 * 2. Process each user to generate newsletter editions
 * 3. Aggregate and return results
 * 
 * @param supabase - Supabase client instance
 * @param config - Edition worker configuration
 * @param nowOverride - Optional timestamp for testability
 * @returns Promise<EditionWorkflowResult> - Complete workflow results
 */
export async function executeEditionWorkflow(
  supabase: SupabaseClient<Database>,
  config: EditionWorkerConfig,
  nowOverride?: number // Optional for testability
): Promise<EditionWorkflowResult> {
  const startTime = Date.now();
  
  debugSubscriptionRefresh('Starting newsletter edition workflow', {
    lookbackHours: config.lookbackHours,
    last10Mode: config.last10Mode,
    mode: config.last10Mode ? 'L10_TESTING' : 'NORMAL'
  });

  try {
    // Step 1: Prepare users (handles L10 mode clearing)
    const prepResult = await prepareUsersForNewsletters(supabase, config);

    if (config.last10Mode) {
      const validation = validateL10Mode(prepResult.candidates, config);
      logL10ModeSummary(prepResult, validation);
    }

    if (prepResult.candidates.length === 0 && !config.last10Mode) {
      debugSubscriptionRefresh('No users found for newsletter generation; exiting');
      return {
        totalCandidates: 0,
        processedUsers: 0,
        successfulNewsletters: 0,
        errorCount: 0,
        noContentCount: 0,
        totalElapsedMs: Date.now() - startTime,
        averageProcessingTimeMs: 0,
        successRate: 0,
        averageTiming: { queryMs: 0, generationMs: 0, databaseMs: 0 },
        retryStats: { totalRetries: 0, usersWhoRetried: 0, averageAttemptsPerUser: 0, maxAttempts: 0, retrySuccessRate: 0 },
        errorBreakdown: {},
        contentStats: { minLength: 0, maxLength: 0, averageLength: 0, totalLength: 0 },
        episodeStats: { minEpisodes: 0, maxEpisodes: 0, averageEpisodes: 0, totalEpisodes: 0 }
      };
    }

    // Step 2: Process each user
    const results: UserProcessingResult[] = [];
    let successfulNewslettersCount = 0;
    
    // L10 mode: Process specific users from existing editions
    if (config.last10Mode && prepResult.existingEditionsToUpdate.length > 0) {
      debugSubscriptionRefresh('L10 mode: Processing users from existing editions', {
        editionCount: prepResult.existingEditionsToUpdate.length
      });
      
      for (const edition of prepResult.existingEditionsToUpdate) {
        // Create a minimal user object for processing
        const user = {
          id: edition.user_id,
          email: edition.user_email,
          subscriptions: [] // L10 mode doesn't need subscriptions
        };
        
        try {
          const result = await processUserForNewsletter(
            supabase,
            user,
            config,
            nowOverride,
            prepResult.existingEditionsToUpdate
          );
          
          results.push(result);
          
          if (result.status === 'done') {
            successfulNewslettersCount++;
            debugSubscriptionRefresh('L10 mode: Successful newsletter generated', {
              userId: user.id,
              userEmail: user.email,
              successfulCount: successfulNewslettersCount,
              targetCount: prepResult.existingEditionsToUpdate.length
            });
          }
          
          // Log progress for each user
          debugSubscriptionRefresh('Processed user', {
            userId: user.id,
            userEmail: user.email,
            status: result.status,
            elapsedMs: result.elapsedMs,
            episodeNotesCount: result.metadata.episodeNotesCount,
            l10Progress: `${successfulNewslettersCount}/${prepResult.existingEditionsToUpdate.length}`
          });
          
          // Add delay between users (except for the last user and in test mode)
          const isLastUser = successfulNewslettersCount === prepResult.existingEditionsToUpdate.length;
          if (!isLastUser && process.env.NODE_ENV !== 'test') {
            debugSubscriptionRefresh('Adding delay between users', {
              delayMs: 10000,
              userIndex: successfulNewslettersCount,
              totalUsers: prepResult.existingEditionsToUpdate.length
            });
            
            await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
          }
          
        } catch (error) {
          // Handle unexpected errors for individual users
          debugSubscriptionRefresh('Unexpected error processing user', {
            userId: user.id,
            userEmail: user.email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          results.push({
            userId: user.id,
            userEmail: user.email,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            elapsedMs: Date.now() - startTime,
            timing: { queryMs: 0, generationMs: 0, databaseMs: 0 },
            metadata: {
              episodeNotesCount: 0,
              subscribedShowsCount: 0,
              totalWordCount: 0,
              averageWordCount: 0
            }
          });
        }
      }
    } else {
      // Normal mode: Process all candidates
      for (let i = 0; i < prepResult.candidates.length; i++) {
        const user = prepResult.candidates[i];
        
        // In L10 mode, stop after 3 successful newsletters
        if (config.last10Mode && successfulNewslettersCount >= 3) {
          debugSubscriptionRefresh('L10 mode: Reached 3 successful newsletters, stopping', {
            processedUsers: i,
            successfulNewsletters: successfulNewslettersCount,
            totalCandidates: prepResult.candidates.length
          });
          break;
        }
      
      const isLastUser = i === prepResult.candidates.length - 1 || 
                         (config.last10Mode && successfulNewslettersCount === 2); // In L10 mode, check if this will be the last successful newsletter
      
      try {
        const result = await processUserForNewsletter(
          supabase, 
          user, 
          config, 
          nowOverride,
          config.last10Mode ? prepResult.existingEditionsToUpdate : undefined
        );
        results.push(result);
        
        // Count successful newsletters in L10 mode
        if (config.last10Mode && result.status === 'done') {
          successfulNewslettersCount++;
          debugSubscriptionRefresh('L10 mode: Successful newsletter generated', {
            userId: user.id,
            userEmail: user.email,
            successfulCount: successfulNewslettersCount,
            targetCount: 3
          });
        }
        
        // Log progress for each user
        debugSubscriptionRefresh('Processed user', {
          userId: user.id,
          userEmail: user.email,
          status: result.status,
          elapsedMs: result.elapsedMs,
          episodeNotesCount: result.metadata.episodeNotesCount,
          l10Progress: config.last10Mode ? `${successfulNewslettersCount}/3` : undefined
        });
        
        // Add 10-second delay between users (except for the last user and in test mode)
        if (!isLastUser && process.env.NODE_ENV !== 'test') {
          debugSubscriptionRefresh('Adding delay between users', {
            delayMs: 10000,
            userIndex: i,
            totalUsers: prepResult.candidates.length,
            nextUserEmail: prepResult.candidates[i + 1].email
          });
          
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        }
        
      } catch (error) {
        // Handle unexpected errors for individual users
        debugSubscriptionRefresh('Unexpected error processing user', {
          userId: user.id,
          userEmail: user.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        results.push({
          userId: user.id,
          userEmail: user.email,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          elapsedMs: Date.now() - startTime,
          timing: { queryMs: 0, generationMs: 0, databaseMs: 0 },
          metadata: {
            episodeNotesCount: 0,
            subscribedShowsCount: user.subscriptions.length,
            totalWordCount: 0,
            averageWordCount: 0
          }
        });
        
        // Add delay even after errors (except for the last user and in test mode)
        if (!isLastUser && process.env.NODE_ENV !== 'test') {
          debugSubscriptionRefresh('Adding delay after error', {
            delayMs: 10000,
            userIndex: i,
            totalUsers: prepResult.candidates.length,
            nextUserEmail: prepResult.candidates[i + 1].email
          });
          
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        }
      }
    }
    }

    // Step 3: Aggregate results
    const summaryStats = aggregateUserProcessingResults(results);
    const totalElapsedMs = Date.now() - startTime;

    const workflowResult: EditionWorkflowResult = {
      totalCandidates: config.last10Mode && prepResult.existingEditionsToUpdate.length > 0 
        ? prepResult.existingEditionsToUpdate.length 
        : prepResult.candidates.length,
      processedUsers: summaryStats.totalUsers,
      successfulNewsletters: summaryStats.successfulNewsletters,
      errorCount: summaryStats.errorCount,
      noContentCount: summaryStats.noContentCount,
      totalElapsedMs,
      averageProcessingTimeMs: summaryStats.averageProcessingTimeMs,
      successRate: summaryStats.successRate,
      averageTiming: summaryStats.averageTiming,
      retryStats: summaryStats.retryStats,
      errorBreakdown: summaryStats.errorBreakdown,
      contentStats: summaryStats.contentStats,
      episodeStats: summaryStats.episodeStats
    };

    debugSubscriptionRefresh('Newsletter edition workflow completed', {
      ...workflowResult,
      success_rate: summaryStats.successRate.toFixed(1),
      avg_timing_ms: summaryStats.averageTiming,
      retry_stats: summaryStats.retryStats,
      error_breakdown: summaryStats.errorBreakdown,
      content_stats: summaryStats.contentStats,
      episode_stats: summaryStats.episodeStats
    });

    return workflowResult;

  } catch (error) {
    console.error('ERROR: Failed to execute newsletter edition workflow:', error);
    throw error;
  }
} 