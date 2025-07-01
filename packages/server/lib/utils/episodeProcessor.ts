/**
 * Episode Processing Utilities
 * 
 * Functions to process individual episodes and generate structured results
 * for logging, monitoring, and summary reporting.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { NotesWorkerConfig } from '../../config/notesWorkerConfig.js';
import { TranscriptWithEpisode } from '../db/notesQueries.js';
import { downloadAndParseTranscript, TranscriptDownloadError } from './transcriptDownloader.js';
import { generateNotesWithPrompt, NotesGenerationResult } from './notesGenerator.js';
import { upsertEpisodeNotes, UpsertNotesResult } from '../db/notesDatabase.js';

/**
 * Result of processing a single episode for notes generation
 */
export interface EpisodeProcessingResult {
  /** Episode ID that was processed */
  episodeId: string;
  /** Transcript ID that was used */
  transcriptId: string;
  /** Final status of the processing */
  status: 'done' | 'error';
  /** Generated notes (only present when status is 'done') */
  notes?: string;
  /** Model used for generation (only present when status is 'done') */
  model?: string;
  /** Error message (only present when status is 'error') */
  error?: string;
  /** Total time taken to process this episode in milliseconds */
  elapsedMs: number;
  /** Breakdown of time spent in each phase */
  timing: {
    downloadMs: number;
    generationMs: number;
    databaseMs: number;
  };
  /** Metadata about the transcript and processing */
  metadata: {
    transcriptWordCount?: number;
    transcriptSizeBytes?: number;
    storagePath: string;
    episodeTitle?: string;
    showTitle?: string;
  };
}

/**
 * Process a single episode to generate notes
 * 
 * This function orchestrates the complete workflow for a single episode:
 * 1. Download and parse the transcript from storage
 * 2. Generate notes using Gemini API
 * 3. Upsert the results to the database
 * 4. Return a structured result object
 * 
 * @param supabase - Supabase client instance
 * @param transcript - Transcript record with episode info
 * @param config - Notes worker configuration
 * @returns Promise<EpisodeProcessingResult> - Structured result of the processing
 */
export async function processEpisodeForNotes(
  supabase: SupabaseClient<Database>,
  transcript: TranscriptWithEpisode,
  config: NotesWorkerConfig
): Promise<EpisodeProcessingResult> {
  const startTime = Date.now();
  const timing = { downloadMs: 0, generationMs: 0, databaseMs: 0 };
  
  const baseResult: Omit<EpisodeProcessingResult, 'status' | 'elapsedMs'> = {
    episodeId: transcript.episode_id,
    transcriptId: transcript.id,
    timing,
    metadata: {
      storagePath: transcript.storage_path,
      episodeTitle: transcript.episode?.title,
      showTitle: transcript.episode?.podcast_shows?.title
    }
  };

  console.log('DEBUG: Processing episode for notes', {
    episodeId: transcript.episode_id,
    transcriptId: transcript.id,
    storagePath: transcript.storage_path,
    episodeTitle: transcript.episode?.title,
    showTitle: transcript.episode?.podcast_shows?.title
  });

  try {
    // Phase 1: Download and parse transcript
    const downloadStart = Date.now();
    let transcriptText: string;
    let wordCount: number;
    let fileSizeBytes: number;

    try {
      const downloadResult = await downloadAndParseTranscript(supabase, transcript.storage_path);
      transcriptText = downloadResult.transcript;
      wordCount = downloadResult.wordCount;
      fileSizeBytes = downloadResult.fileSizeBytes;
      timing.downloadMs = Date.now() - downloadStart;
      
      console.log('DEBUG: Successfully downloaded transcript', {
        episodeId: transcript.episode_id,
        transcriptLength: transcriptText.length,
        wordCount,
        fileSizeBytes,
        downloadMs: timing.downloadMs
      });
      
    } catch (error) {
      timing.downloadMs = Date.now() - downloadStart;
      
      let errorMessage: string;
      if (error instanceof TranscriptDownloadError) {
        errorMessage = `Transcript download failed: ${error.message}`;
      } else {
        errorMessage = `Unexpected download error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
      
      console.error('DEBUG: Failed to download transcript', {
        episodeId: transcript.episode_id,
        storagePath: transcript.storage_path,
        error: errorMessage,
        downloadMs: timing.downloadMs
      });

      // Record the error in database and return error result
      await recordErrorResult(supabase, transcript, errorMessage, timing);
      
      return {
        ...baseResult,
        status: 'error',
        error: errorMessage,
        elapsedMs: Date.now() - startTime
      };
    }

    // Update metadata with download results
    baseResult.metadata.transcriptWordCount = wordCount;
    baseResult.metadata.transcriptSizeBytes = fileSizeBytes;

    // Phase 2: Generate notes using Gemini
    const generationStart = Date.now();
    let notesResult: NotesGenerationResult;

    try {
      notesResult = await generateNotesWithPrompt(transcriptText, config);
      timing.generationMs = Date.now() - generationStart;
      
      if (!notesResult.success) {
        throw new Error(notesResult.error || 'Notes generation failed');
      }
      
      console.log('DEBUG: Successfully generated notes', {
        episodeId: transcript.episode_id,
        notesLength: notesResult.notes.length,
        model: notesResult.model,
        generationMs: timing.generationMs
      });
      
    } catch (error) {
      timing.generationMs = Date.now() - generationStart;
      
      const errorMessage = `Notes generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      console.error('DEBUG: Failed to generate notes', {
        episodeId: transcript.episode_id,
        transcriptWordCount: wordCount,
        error: errorMessage,
        generationMs: timing.generationMs
      });

      // Record the error in database and return error result
      await recordErrorResult(supabase, transcript, errorMessage, timing);
      
      return {
        ...baseResult,
        status: 'error',
        error: errorMessage,
        elapsedMs: Date.now() - startTime
      };
    }

    // Phase 3: Save results to database
    const databaseStart = Date.now();
    
    try {
      const upsertResult = await upsertEpisodeNotes(supabase, {
        episodeId: transcript.episode_id,
        transcriptId: transcript.id,
        notes: notesResult.notes,
        model: notesResult.model,
        status: 'done'
      });
      
      timing.databaseMs = Date.now() - databaseStart;
      
      if (!upsertResult.success) {
        throw new Error(upsertResult.error || 'Database upsert failed');
      }
      
      console.log('DEBUG: Successfully saved notes to database', {
        episodeId: transcript.episode_id,
        noteId: upsertResult.noteId,
        databaseMs: timing.databaseMs
      });
      
    } catch (error) {
      timing.databaseMs = Date.now() - databaseStart;
      
      const errorMessage = `Database save failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      console.error('DEBUG: Failed to save notes to database', {
        episodeId: transcript.episode_id,
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
    
    console.log('DEBUG: Episode processing completed successfully', {
      episodeId: transcript.episode_id,
      totalElapsedMs: elapsedMs,
      timing,
      notesLength: notesResult.notes.length
    });

    return {
      ...baseResult,
      status: 'done',
      notes: notesResult.notes,
      model: notesResult.model,
      elapsedMs
    };

  } catch (error) {
    // Catch-all for any unexpected errors
    const elapsedMs = Date.now() - startTime;
    const errorMessage = `Unexpected processing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    console.error('DEBUG: Unexpected error processing episode', {
      episodeId: transcript.episode_id,
      error: errorMessage,
      elapsedMs,
      timing
    });

    // Try to record the error, but don't fail if this also errors
    try {
      await recordErrorResult(supabase, transcript, errorMessage, timing);
    } catch (dbError) {
      console.error('DEBUG: Failed to record error result', {
        episodeId: transcript.episode_id,
        originalError: errorMessage,
        dbError: dbError instanceof Error ? dbError.message : 'Unknown DB error'
      });
    }

    return {
      ...baseResult,
      status: 'error',
      error: errorMessage,
      elapsedMs
    };
  }
}

/**
 * Record an error result in the database
 * 
 * @param supabase - Supabase client instance
 * @param transcript - Transcript record
 * @param errorMessage - Error message to record
 * @param timing - Timing information
 */
async function recordErrorResult(
  supabase: SupabaseClient<Database>,
  transcript: TranscriptWithEpisode,
  errorMessage: string,
  timing: { downloadMs: number; generationMs: number; databaseMs: number }
): Promise<void> {
  const dbStart = Date.now();
  
  try {
    const result = await upsertEpisodeNotes(supabase, {
      episodeId: transcript.episode_id,
      transcriptId: transcript.id,
      status: 'error',
      errorMessage: errorMessage
    });
    
    timing.databaseMs = Date.now() - dbStart;
    
    if (!result.success) {
      console.error('DEBUG: Failed to record error in database', {
        episodeId: transcript.episode_id,
        originalError: errorMessage,
        dbError: result.error
      });
    }
    
  } catch (error) {
    timing.databaseMs = Date.now() - dbStart;
    
    console.error('DEBUG: Exception while recording error in database', {
      episodeId: transcript.episode_id,
      originalError: errorMessage,
      dbException: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Aggregate multiple episode processing results into a summary
 * 
 * @param results - Array of episode processing results
 * @returns Summary statistics and aggregated data
 */
export function aggregateProcessingResults(results: EpisodeProcessingResult[]): {
  totalEpisodes: number;
  successfulNotes: number;
  errorCount: number;
  successRate: number;
  totalElapsedMs: number;
  averageProcessingTimeMs: number;
  averageTiming: {
    downloadMs: number;
    generationMs: number;
    databaseMs: number;
  };
  errorBreakdown: Record<string, number>;
  wordCountStats: {
    min: number;
    max: number;
    average: number;
    total: number;
  };
} {
  const totalEpisodes = results.length;
  const successfulResults = results.filter(r => r.status === 'done');
  const errorResults = results.filter(r => r.status === 'error');
  
  const successfulNotes = successfulResults.length;
  const errorCount = errorResults.length;
  const successRate = totalEpisodes > 0 ? (successfulNotes / totalEpisodes) * 100 : 0;
  
  const totalElapsedMs = results.reduce((sum, r) => sum + r.elapsedMs, 0);
  const averageProcessingTimeMs = totalEpisodes > 0 ? totalElapsedMs / totalEpisodes : 0;
  
  // Aggregate timing data
  const averageTiming = {
    downloadMs: totalEpisodes > 0 ? results.reduce((sum, r) => sum + r.timing.downloadMs, 0) / totalEpisodes : 0,
    generationMs: totalEpisodes > 0 ? results.reduce((sum, r) => sum + r.timing.generationMs, 0) / totalEpisodes : 0,
    databaseMs: totalEpisodes > 0 ? results.reduce((sum, r) => sum + r.timing.databaseMs, 0) / totalEpisodes : 0
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
  
  // Word count statistics
  const wordCounts = results
    .map(r => r.metadata.transcriptWordCount)
    .filter((count): count is number => count !== undefined);
  
  const wordCountStats = {
    min: wordCounts.length > 0 ? Math.min(...wordCounts) : 0,
    max: wordCounts.length > 0 ? Math.max(...wordCounts) : 0,
    average: wordCounts.length > 0 ? wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length : 0,
    total: wordCounts.reduce((sum, count) => sum + count, 0)
  };
  
  return {
    totalEpisodes,
    successfulNotes,
    errorCount,
    successRate,
    totalElapsedMs,
    averageProcessingTimeMs,
    averageTiming,
    errorBreakdown,
    wordCountStats
  };
}

/**
 * Extract error type from error message for categorization
 * 
 * @param errorMessage - The full error message
 * @returns Simplified error type for grouping
 */
function extractErrorType(errorMessage: string): string {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('download') || lowerMessage.includes('storage') || lowerMessage.includes('file')) {
    return 'download_error';
  }
  
  if (lowerMessage.includes('gemini') || lowerMessage.includes('api') || lowerMessage.includes('generation')) {
    return 'generation_error';
  }
  
  if (lowerMessage.includes('database') || lowerMessage.includes('upsert') || lowerMessage.includes('save')) {
    return 'database_error';
  }
  
  if (lowerMessage.includes('transcript') && (lowerMessage.includes('empty') || lowerMessage.includes('parse'))) {
    return 'transcript_parse_error';
  }
  
  return 'unknown_error';
} 