/**
 * Newsletter Edition Processing Utilities
 * 
 * Functions to process individual users and generate newsletter editions
 * for logging, monitoring, and summary reporting.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { EditionWorkerConfig } from '../../config/editionWorkerConfig.js';
import { UserWithSubscriptions, EpisodeNoteWithEpisode, queryEpisodeNotesForUser } from '../db/editionQueries.js';
import { generateNewsletterEdition, generateNewsletterSubjectLine } from '../llm/gemini.js';
import { sanitizeNewsletterContent } from './buildNewsletterEditionPrompt.js';
import { upsertNewsletterEdition } from '../db/newsletter-editions.ts';
import { insertNewsletterEditionEpisodes } from '../db/newsletter-edition-episodes.ts';
import { _NewsletterEdition } from '@listener/shared';
import { debugSubscriptionRefresh } from '../debugLogger';
import { retryWithBackoff, DEFAULT_NEWSLETTER_RETRY_OPTIONS, RetryResult } from './retryWithBackoff.js';

/**
 * Result of processing a single user for newsletter generation
 */
export interface UserProcessingResult {
  /** User ID that was processed */
  userId: string;
  /** User email for identification */
  userEmail: string;
  /** Final status of the processing */
  status: 'done' | 'error' | 'no_content_found';
  /** Generated newsletter content (only present when status is 'done') */
  newsletterContent?: string;
  /** Newsletter edition ID (only present when status is 'done') */
  newsletterEditionId?: string;
  /** Episode IDs included in the newsletter (only present when status is 'done') */
  episodeIds?: string[];
  /** Error message (only present when status is 'error') */
  error?: string;
  /** Total time taken to process this user in milliseconds */
  elapsedMs: number;
  /** Breakdown of time spent in each phase */
  timing: {
    queryMs: number;
    generationMs: number;
    databaseMs: number;
  };
  /** Metadata about the processing */
  metadata: {
    episodeNotesCount: number;
    subscribedShowsCount: number;
    totalWordCount: number;
    averageWordCount: number;
  };
  /** Retry information for newsletter generation */
  retryInfo?: {
    attemptsUsed: number;
    totalRetryTimeMs: number;
    wasRetried: boolean;
  };
  /** Additional fields for test assertions */
  html_content?: string;
  sanitized_content?: string;
  episode_count?: number;
}

/**
 * Process a single user to generate a newsletter edition
 * 
 * This function orchestrates the complete workflow for a single user:
 * 1. Query episode notes for the user's subscribed shows within lookback window
 * 2. Generate newsletter content using Gemini API
 * 3. Upsert the results to the database with episode references
 * 4. Return a structured result object
 * 
 * @param supabase - Supabase client instance
 * @param user - User record with subscription information
 * @param config - Edition worker configuration
 * @param nowOverride - Optional timestamp for testability
 * @returns Promise<UserProcessingResult> - Structured result of the processing
 */
export async function processUserForNewsletter(
  supabase: SupabaseClient<Database>,
  user: UserWithSubscriptions,
  config: EditionWorkerConfig,
  nowOverride?: number, // Optional for testability
  existingEditionsToUpdate?: Array<{ id: string; user_id: string; edition_date: string; user_email: string }> // L10 mode existing editions
): Promise<UserProcessingResult> {
  const startTime = Date.now();
  const timing = { queryMs: 0, generationMs: 0, databaseMs: 0 };
  
  const baseResult: Omit<UserProcessingResult, 'status' | 'elapsedMs'> = {
    userId: user.id,
    userEmail: user.email,
    timing,
    metadata: {
      episodeNotesCount: 0,
      subscribedShowsCount: user.subscriptions.length,
      totalWordCount: 0,
      averageWordCount: 0
    }
  };

  debugSubscriptionRefresh('Processing user for newsletter', {
    userId: user.id,
    userEmail: user.email,
    subscribedShowsCount: user.subscriptions.length,
    lookbackHours: config.lookbackHours
  });

  try {
    // Phase 1: Query episode notes for the user
    const queryStart = Date.now();
    let episodeNotes: EpisodeNoteWithEpisode[];

    try {
      episodeNotes = await queryEpisodeNotesForUser(
        supabase,
        user.id,
        config.lookbackHours,
        nowOverride
      );
      timing.queryMs = Date.now() - queryStart;
      
      debugSubscriptionRefresh('Successfully queried episode notes', {
        userId: user.id,
        episodeNotesCount: episodeNotes.length,
        queryMs: timing.queryMs
      });
      
    } catch (error) {
      timing.queryMs = Date.now() - queryStart;
      
      const errorMessage = `Failed to query episode notes: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      debugSubscriptionRefresh('Failed to query episode notes', {
        userId: user.id,
        error: errorMessage,
        queryMs: timing.queryMs
      });

      return {
        ...baseResult,
        status: 'error',
        error: errorMessage,
        elapsedMs: Date.now() - startTime
      };
    }

    // Check if we have any episode notes to process
    if (episodeNotes.length === 0) {
      debugSubscriptionRefresh('No episode notes found for user', {
        userId: user.id,
        subscribedShowsCount: user.subscriptions.length,
        lookbackHours: config.lookbackHours
      });

      return {
        ...baseResult,
        status: 'no_content_found',
        elapsedMs: Date.now() - startTime
      };
    }

    // Update metadata with query results
    const notesTexts = episodeNotes.map(note => note.notes);
    const episodeMetadata = episodeNotes.map(note => ({
      showTitle: note.episode?.podcast_shows?.title || 'Unknown Show',
      spotifyUrl: note.episode?.podcast_shows?.spotify_url || ''
    }));
    const totalWordCount = notesTexts.reduce((sum, notes) => sum + countWords(notes), 0);
    const averageWordCount = episodeNotes.length > 0 ? totalWordCount / episodeNotes.length : 0;
    
    baseResult.metadata.episodeNotesCount = episodeNotes.length;
    baseResult.metadata.totalWordCount = totalWordCount;
    baseResult.metadata.averageWordCount = averageWordCount;

    // Phase 2: Generate newsletter content using Gemini with retry logic
    const generationStart = Date.now();
    let newsletterContent: string;
    let generationResult: any; // Make generationResult available in the DB save phase
    let retryResult: RetryResult<any>;
    let subjectLine: string | null = null; // Subject line for the newsletter

    try {
      const editionDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Wrap newsletter generation in retry logic
      retryResult = await retryWithBackoff(
        async () => {
          const result = await generateNewsletterEdition(
            notesTexts, 
            user.email, 
            editionDate, 
            episodeMetadata,
            undefined, // promptOverrides
            config.promptPath // Pass the configured prompt path
          );
          
          if (!result.success) {
            throw new Error(result.error || 'Newsletter generation failed');
          }
          
          return result;
        },
        {
          ...DEFAULT_NEWSLETTER_RETRY_OPTIONS,
          context: `newsletter generation for user ${user.email}`
        }
      );
      
      generationResult = retryResult.result;
      timing.generationMs = Date.now() - generationStart;
      
      // Use the sanitized content from the result
      newsletterContent = generationResult.sanitizedContent;
      
      debugSubscriptionRefresh('Successfully generated newsletter content', {
        userId: user.id,
        contentLength: newsletterContent.length,
        model: generationResult.model,
        generationMs: timing.generationMs,
        attemptsUsed: retryResult.attemptsUsed,
        wasRetried: retryResult.attemptsUsed > 1,
        totalRetryTimeMs: retryResult.totalElapsedMs
      });
      
      // Phase 2b: Generate subject line for the newsletter
      const subjectLineStart = Date.now();
      
      try {
        const subjectLineResult = await generateNewsletterSubjectLine(generationResult.htmlContent);
        
        if (subjectLineResult.success) {
          subjectLine = subjectLineResult.subjectLine;
          
          debugSubscriptionRefresh('Successfully generated subject line', {
            userId: user.id,
            subjectLine: subjectLine,
            wordCount: subjectLineResult.wordCount,
            subjectLineMs: Date.now() - subjectLineStart
          });
        } else {
          debugSubscriptionRefresh('Failed to generate subject line', {
            userId: user.id,
            error: subjectLineResult.error,
            subjectLineMs: Date.now() - subjectLineStart
          });
          // Continue without subject line - it's optional
        }
      } catch (error) {
        debugSubscriptionRefresh('Error generating subject line', {
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          subjectLineMs: Date.now() - subjectLineStart
        });
        // Continue without subject line - it's optional
      }
      
    } catch (error) {
      timing.generationMs = Date.now() - generationStart;
      
      const errorMessage = `Newsletter generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      debugSubscriptionRefresh('Failed to generate newsletter content', {
        userId: user.id,
        episodeNotesCount: episodeNotes.length,
        error: errorMessage,
        generationMs: timing.generationMs,
        attemptsUsed: retryResult?.attemptsUsed || 0,
        totalRetryTimeMs: retryResult?.totalElapsedMs || 0
      });

      return {
        ...baseResult,
        status: 'error',
        error: errorMessage,
        elapsedMs: Date.now() - startTime,
        retryInfo: retryResult ? {
          attemptsUsed: retryResult.attemptsUsed,
          totalRetryTimeMs: retryResult.totalElapsedMs,
          wasRetried: retryResult.attemptsUsed > 1
        } : undefined
      };
    }

    // Phase 3: Save results to database with episode references
    const databaseStart = Date.now();
    
    // Initialize variables that will be set during database save
    // These need to be declared outside the try-catch block to avoid "not defined" errors
    let newsletterEditionId: string | undefined;
    let episodeIds: string[] = [];
    let htmlContent: string = '';
    let sanitizedContent: string = '';
    let episodeCount: number = 0;
    
    try {
      // Insert the newsletter edition
      const editionDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // In L10 mode, use existing edition dates if available for this user
      let targetEditionDate = editionDate;
      let targetEditionId: string | undefined;
      if (config.last10Mode && existingEditionsToUpdate) {
        const userExistingEdition = existingEditionsToUpdate.find(edition => edition.user_id === user.id);
        if (userExistingEdition) {
          targetEditionDate = userExistingEdition.edition_date;
          targetEditionId = userExistingEdition.id;
          debugSubscriptionRefresh('Using existing edition date for L10 mode update', {
            userId: user.id,
            originalDate: editionDate,
            existingDate: targetEditionDate,
            editionId: targetEditionId
          });
        }
      }
      
      const editionResult = await upsertNewsletterEdition({
        user_id: user.id,
        edition_date: targetEditionDate,
        content: newsletterContent,
        status: 'generated',
        model: generationResult.model,
        error_message: null,
        subject_line: subjectLine,
        edition_id: targetEditionId
      });
      
      // DEBUG: Log the editionResult to diagnose test failures
      debugSubscriptionRefresh('editionResult', { editionResult });
      debugSubscriptionRefresh('editionResult type', { type: typeof editionResult });
      debugSubscriptionRefresh('editionResult keys', { keys: editionResult ? Object.keys(editionResult) : 'undefined' });
      debugSubscriptionRefresh('editionResult.id', { id: editionResult?.id });

      // Remove all fallback logic - let it fail if DB helpers don't work
      if (!editionResult) {
        throw new Error(`Database save failed: upsertNewsletterEdition returned undefined`);
      }

      newsletterEditionId = editionResult.id;

      // Insert episode references (skip for L10 mode since content is being regenerated)
      episodeIds = episodeNotes.map(note => note.episode_id);
      let episodeLinksResult;
      
      if (config.last10Mode && targetEditionId) {
        // Skip episode linking for L10 mode - content is being regenerated, episode links already exist
        debugSubscriptionRefresh('Skipping episode linking for L10 mode update', {
          userId: user.id,
          newsletterEditionId,
          episodeCount: episodeIds.length
        });
        episodeLinksResult = []; // Empty array to maintain compatibility
      } else {
        // Normal mode - insert episode links
        episodeLinksResult = await insertNewsletterEditionEpisodes({
          newsletter_edition_id: newsletterEditionId,
          episode_ids: episodeIds
        });

        // Remove fallback logic for episodeLinksResult
        if (!episodeLinksResult) {
          throw new Error(`Database save failed: insertNewsletterEditionEpisodes returned undefined`);
        }
      }

      // --- Set additional fields for test assertions ---
      // 1. html_content: the generated newsletter HTML (from newsletterContent)
      // 2. sanitized_content: sanitized version of the newsletter (using sanitizeNewsletterContent)
      // 3. episode_count: number of episode links
      //
      // If your DB schema does not support these fields, you may need to update the row after insert.
      // For now, we add them to the result object for test assertions.
      htmlContent = newsletterContent;
      sanitizedContent = sanitizeNewsletterContent(newsletterContent);
      episodeCount = episodeLinksResult.length;

      // Log for debugging
      debugSubscriptionRefresh('Setting additional fields for test assertions', {
        htmlContent,
        sanitizedContent,
        episodeCount
      });

      debugSubscriptionRefresh('Successfully inserted episode links', {
        userId: user.id,
        newsletterEditionId,
        episodeCount: episodeIds.length,
        linksCount: episodeLinksResult.length
      });
      
      timing.databaseMs = Date.now() - databaseStart;
      
      debugSubscriptionRefresh('Successfully saved newsletter to database', {
        userId: user.id,
        newsletterEditionId,
        episodeCount: episodeIds.length,
        databaseMs: timing.databaseMs,
        wasL10Mode: config.last10Mode && targetEditionId
      });
      
    } catch (error) {
      timing.databaseMs = Date.now() - databaseStart;
      
      const errorMessage = `Database save failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      debugSubscriptionRefresh('Failed to save newsletter to database', {
        userId: user.id,
        error: errorMessage,
        databaseMs: timing.databaseMs
      });

      return {
        ...baseResult,
        status: 'error',
        error: errorMessage,
        elapsedMs: Date.now() - startTime
      };
    }

    // Success! Return complete result
    const elapsedMs = Date.now() - startTime;
    
    debugSubscriptionRefresh('User processing completed successfully', {
      userId: user.id,
      totalElapsedMs: elapsedMs,
      timing,
      contentLength: newsletterContent.length,
      episodeCount: episodeNotes.length
    });

    return {
      ...baseResult,
      status: 'done',
      newsletterContent,
      newsletterEditionId,
      episodeIds,
      html_content: htmlContent,
      sanitized_content: sanitizedContent,
      episode_count: episodeCount,
      elapsedMs,
      retryInfo: retryResult ? {
        attemptsUsed: retryResult.attemptsUsed,
        totalRetryTimeMs: retryResult.totalElapsedMs,
        wasRetried: retryResult.attemptsUsed > 1
      } : undefined
    };

  } catch (error) {
    // Catch any unhandled exceptions
    const errorMessage = `Unexpected error processing user: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    debugSubscriptionRefresh('Unexpected error in user processing', {
      userId: user.id,
      error: errorMessage
    });

    return {
      ...baseResult,
      status: 'error',
      error: errorMessage,
      elapsedMs: Date.now() - startTime
    };
  }
}

/**
 * Helper function to count words in a string
 * @param text - Text to count words in
 * @returns Number of words
 */
function countWords(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  // Simple word counting - split on whitespace and filter out empty strings
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Aggregate multiple user processing results into a summary
 * 
 * @param results - Array of user processing results
 * @returns Summary statistics and aggregated data
 */
export function aggregateUserProcessingResults(results: UserProcessingResult[]): {
  totalUsers: number;
  successfulNewsletters: number;
  errorCount: number;
  noContentCount: number;
  successRate: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
  averageTiming: {
    queryMs: number;
    generationMs: number;
    databaseMs: number;
  };
  retryStats: {
    totalRetries: number;
    usersWhoRetried: number;
    averageAttemptsPerUser: number;
    maxAttempts: number;
    retrySuccessRate: number;
  };
  errorBreakdown: Record<string, number>;
  contentStats: {
    minLength: number;
    maxLength: number;
    averageLength: number;
    totalLength: number;
  };
  episodeStats: {
    minEpisodes: number;
    maxEpisodes: number;
    averageEpisodes: number;
    totalEpisodes: number;
  };
} {
  const totalUsers = results.length;
  const successfulResults = results.filter(r => r.status === 'done');
  const errorResults = results.filter(r => r.status === 'error');
  const noContentResults = results.filter(r => r.status === 'no_content_found');
  
  const successfulNewsletters = successfulResults.length;
  const errorCount = errorResults.length;
  const noContentCount = noContentResults.length;
  const successRate = totalUsers > 0 ? (successfulNewsletters / totalUsers) * 100 : 0;
  
  const totalElapsedMs = results.reduce((sum, r) => sum + r.elapsedMs, 0);
  const averageProcessingTimeMs = totalUsers > 0 ? totalElapsedMs / totalUsers : 0;
  
  // Aggregate timing data
  const averageTiming = {
    queryMs: totalUsers > 0 ? results.reduce((sum, r) => sum + r.timing.queryMs, 0) / totalUsers : 0,
    generationMs: totalUsers > 0 ? results.reduce((sum, r) => sum + r.timing.generationMs, 0) / totalUsers : 0,
    databaseMs: totalUsers > 0 ? results.reduce((sum, r) => sum + r.timing.databaseMs, 0) / totalUsers : 0
  };
  
  // Aggregate error breakdown
  const errorBreakdown: Record<string, number> = {};
  errorResults.forEach(result => {
    if (result.error) {
      // Extract error type from error message
      const errorType = extractErrorType(result.error);
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    }
  });
  
  // Content length statistics
  const contentLengths = successfulResults
    .map(r => r.newsletterContent?.length || 0)
    .filter(length => length > 0);
  
  const contentStats = {
    minLength: contentLengths.length > 0 ? Math.min(...contentLengths) : 0,
    maxLength: contentLengths.length > 0 ? Math.max(...contentLengths) : 0,
    averageLength: contentLengths.length > 0 ? contentLengths.reduce((sum, length) => sum + length, 0) / contentLengths.length : 0,
    totalLength: contentLengths.reduce((sum, length) => sum + length, 0)
  };
  
  // Retry statistics
  const resultsWithRetryInfo = results.filter(r => r.retryInfo);
  const usersWhoRetried = resultsWithRetryInfo.filter(r => r.retryInfo!.wasRetried).length;
  const totalAttempts = resultsWithRetryInfo.reduce((sum, r) => sum + (r.retryInfo!.attemptsUsed || 1), 0);
  const maxAttempts = resultsWithRetryInfo.length > 0 ? Math.max(...resultsWithRetryInfo.map(r => r.retryInfo!.attemptsUsed)) : 0;
  const retriedResults = resultsWithRetryInfo.filter(r => r.retryInfo!.wasRetried);
  const retrySuccessRate = retriedResults.length > 0 ? (retriedResults.filter(r => r.status === 'done').length / retriedResults.length) * 100 : 0;
  
  const retryStats = {
    totalRetries: totalAttempts - resultsWithRetryInfo.length, // Total extra attempts beyond first
    usersWhoRetried,
    averageAttemptsPerUser: resultsWithRetryInfo.length > 0 ? totalAttempts / resultsWithRetryInfo.length : 0,
    maxAttempts,
    retrySuccessRate
  };

  // Episode count statistics
  const episodeCounts = successfulResults
    .map(r => r.episodeIds?.length || 0)
    .filter(count => count > 0);
  
  const episodeStats = {
    minEpisodes: episodeCounts.length > 0 ? Math.min(...episodeCounts) : 0,
    maxEpisodes: episodeCounts.length > 0 ? Math.max(...episodeCounts) : 0,
    averageEpisodes: episodeCounts.length > 0 ? episodeCounts.reduce((sum, count) => sum + count, 0) / episodeCounts.length : 0,
    totalEpisodes: episodeCounts.reduce((sum, count) => sum + count, 0)
  };
  
  return {
    totalUsers,
    successfulNewsletters,
    errorCount,
    noContentCount,
    successRate,
    totalElapsedMs,
    averageProcessingTimeMs,
    averageTiming,
    retryStats,
    errorBreakdown,
    contentStats,
    episodeStats
  };
}

/**
 * Extract error type from error message for categorization
 * @param errorMessage - Full error message
 * @returns Categorized error type
 */
function extractErrorType(errorMessage: string): string {
  const lowerError = errorMessage.toLowerCase();
  
  if (lowerError.includes('database') || lowerError.includes('supabase')) {
    return 'database_error';
  }
  
  if (lowerError.includes('gemini') || lowerError.includes('api') || lowerError.includes('generation')) {
    return 'generation_error';
  }
  
  if (lowerError.includes('query') || lowerError.includes('fetch')) {
    return 'query_error';
  }
  
  if (lowerError.includes('validation') || lowerError.includes('invalid')) {
    return 'validation_error';
  }
  
  return 'unknown_error';
}

/**
 * Process an existing newsletter edition to generate only a subject line
 * Used in subject line test mode - will overwrite existing subject lines
 * 
 * @param supabase - Initialized Supabase client
 * @param edition - Existing edition with HTML content
 * @returns Processing result
 */
export async function processEditionForSubjectLineOnly(
  supabase: SupabaseClient<Database>,
  edition: { 
    id: string; 
    user_id: string; 
    edition_date: string; 
    user_email: string; 
    content: string;
    subject_line: string | null;
  }
): Promise<{
  editionId: string;
  userId: string;
  userEmail: string;
  status: 'success' | 'error';
  subjectLine?: string;
  previousSubjectLine?: string | null;
  error?: string;
  elapsedMs: number;
}> {
  const startTime = Date.now();
  const isOverwriting = edition.subject_line !== null;
  
  debugSubscriptionRefresh('Processing edition for subject line only', {
    editionId: edition.id,
    userId: edition.user_id,
    userEmail: edition.user_email,
    contentLength: edition.content.length,
    hasExistingSubjectLine: isOverwriting,
    existingSubjectLine: edition.subject_line
  });
  
  try {
    // Generate subject line from existing content
    const subjectLineResult = await generateNewsletterSubjectLine(edition.content);
    
    if (!subjectLineResult.success) {
      throw new Error(subjectLineResult.error || 'Failed to generate subject line');
    }
    
    // Update the edition with the new subject line
    const { error: updateError } = await supabase
      .from('newsletter_editions')
      .update({ 
        subject_line: subjectLineResult.subjectLine,
        updated_at: new Date().toISOString()
      })
      .eq('id', edition.id);
    
    if (updateError) {
      throw new Error(`Failed to update subject line: ${updateError.message}`);
    }
    
    if (isOverwriting) {
      debugSubscriptionRefresh('Successfully overwrote existing subject line', {
        editionId: edition.id,
        oldSubjectLine: edition.subject_line,
        newSubjectLine: subjectLineResult.subjectLine,
        wordCount: subjectLineResult.wordCount,
        elapsedMs: Date.now() - startTime
      });
    } else {
      debugSubscriptionRefresh('Successfully generated and saved subject line', {
        editionId: edition.id,
        subjectLine: subjectLineResult.subjectLine,
        wordCount: subjectLineResult.wordCount,
        elapsedMs: Date.now() - startTime
      });
    }
    
    return {
      editionId: edition.id,
      userId: edition.user_id,
      userEmail: edition.user_email,
      status: 'success',
      subjectLine: subjectLineResult.subjectLine,
      previousSubjectLine: edition.subject_line,
      elapsedMs: Date.now() - startTime
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    debugSubscriptionRefresh('Failed to process edition for subject line', {
      editionId: edition.id,
      error: errorMessage,
      elapsedMs: Date.now() - startTime
    });
    
    return {
      editionId: edition.id,
      userId: edition.user_id,
      userEmail: edition.user_email,
      status: 'error',
      error: errorMessage,
      elapsedMs: Date.now() - startTime
    };
  }
} 