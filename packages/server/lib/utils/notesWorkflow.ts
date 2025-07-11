/**
 * Episode Notes Workflow Orchestrator
 * 
 * High-level functions that coordinate the complete workflow of generating
 * episode notes, including special handling for L10 testing mode.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { NotesWorkerConfig } from '../../config/notesWorkerConfig.js';
import { queryTranscriptsNeedingNotes, TranscriptWithEpisode } from '../db/notesQueries.js';
import { deleteExistingNotes } from '../db/notesDatabase.js';

/**
 * Result of preparing transcripts for notes generation
 */
export interface PrepareTranscriptsResult {
  /** Transcripts that need notes generated */
  candidates: TranscriptWithEpisode[];
  /** Number of existing notes that were cleared (L10 mode only) */
  clearedNotesCount: number;
  /** Whether L10 mode was active */
  wasL10Mode: boolean;
  /** Time taken for preparation in milliseconds */
  elapsedMs: number;
}

/**
 * Prepare transcripts for notes generation, handling L10 mode logic
 * 
 * This function orchestrates the complete preparation workflow:
 * 1. Query candidate transcripts based on mode (normal vs L10)
 * 2. In L10 mode: clear existing notes for the selected transcripts
 * 3. Return the prepared list of transcripts to process
 * 
 * @param supabase - Supabase client instance
 * @param config - Notes worker configuration
 * @returns Promise<PrepareTranscriptsResult> - Prepared transcripts and metadata
 */
export async function prepareTranscriptsForNotes(
  supabase: SupabaseClient<Database>,
  config: NotesWorkerConfig
): Promise<PrepareTranscriptsResult> {
  const startTime = Date.now();
  
  console.log('DEBUG: Preparing transcripts for notes generation', {
    lookbackHours: config.lookbackHours,
    last10Mode: config.last10Mode,
    mode: config.last10Mode ? 'L10_TESTING' : 'NORMAL'
  });

  try {
    // Step 1: Query candidate transcripts
    const candidates = await queryTranscriptsNeedingNotes(
      supabase,
      config.lookbackHours,
      config.last10Mode,
      config.last10Count
    );

    console.log('DEBUG: Found candidate transcripts', {
      candidateCount: candidates.length,
      mode: config.last10Mode ? 'L10' : 'normal'
    });

    let clearedNotesCount = 0;

    // Step 2: Handle L10 mode - clear existing notes for selected transcripts
    if (config.last10Mode && candidates.length > 0) {
      console.log('DEBUG: L10 mode active - clearing existing notes for selected transcripts');
      
      const transcriptIds = candidates.map(c => c.id);
      const deleteResult = await deleteExistingNotes(supabase, transcriptIds);
      
      if (!deleteResult.success) {
        console.warn('DEBUG: Failed to clear some existing notes in L10 mode', {
          error: deleteResult.error,
          transcriptCount: transcriptIds.length
        });
        // Don't fail the entire operation - just log the warning
      } else {
        clearedNotesCount = deleteResult.deletedCount;
        console.log('DEBUG: Successfully cleared existing notes for L10 mode', {
          clearedCount: clearedNotesCount,
          transcriptCount: transcriptIds.length
        });
      }
    }

    const elapsedMs = Date.now() - startTime;
    
    console.log('DEBUG: Transcript preparation completed', {
      candidateCount: candidates.length,
      clearedNotesCount,
      wasL10Mode: config.last10Mode,
      elapsedMs
    });

    return {
      candidates,
      clearedNotesCount,
      wasL10Mode: config.last10Mode,
      elapsedMs
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('DEBUG: Failed to prepare transcripts for notes generation', {
      error: errorMessage,
      lookbackHours: config.lookbackHours,
      last10Mode: config.last10Mode,
      elapsedMs
    });

    // Re-throw the error to be handled by the caller
    throw new Error(`Failed to prepare transcripts: ${errorMessage}`);
  }
}

/**
 * Validate that L10 mode is working correctly
 * 
 * This function performs additional validation when L10 mode is active
 * to ensure the workflow is behaving as expected.
 * 
 * @param candidates - The candidate transcripts returned
 * @param config - Notes worker configuration
 * @returns Object with validation results and warnings
 */
export function validateL10Mode(
  candidates: TranscriptWithEpisode[],
  config: NotesWorkerConfig
): {
  isValid: boolean;
  warnings: string[];
  expectedCount: number;
  actualCount: number;
} {
  const warnings: string[] = [];
  const expectedCount = config.last10Mode ? config.last10Count : -1; // -1 means variable count in normal mode
  const actualCount = candidates.length;

  if (!config.last10Mode) {
    // Normal mode - no specific validation needed
    return {
      isValid: true,
      warnings: [],
      expectedCount: -1,
      actualCount
    };
  }

  // L10 mode validation
  if (actualCount === 0) {
    warnings.push('L10 mode is active but no transcripts were found - this may indicate no transcripts exist in the database');
  } else if (actualCount < config.last10Count) {
    warnings.push(`L10 mode is active but only ${actualCount} transcripts were found (expected up to ${config.last10Count}) - this may be normal if fewer transcripts exist`);
  } else if (actualCount > config.last10Count) {
    warnings.push(`L10 mode returned ${actualCount} transcripts but should be limited to ${config.last10Count} - this indicates a query logic issue`);
  }

  // Check that transcripts are ordered by creation date (most recent first)
  if (actualCount > 1) {
    const isProperlyOrdered = candidates.every((candidate, index) => {
      if (index === 0) return true; // First item is always valid
      const current = new Date(candidate.created_at);
      const previous = new Date(candidates[index - 1].created_at);
      return current <= previous; // Should be descending order (most recent first)
    });

    if (!isProperlyOrdered) {
      warnings.push('L10 mode transcripts are not properly ordered by creation date (most recent first)');
    }
  }

  const isValid = actualCount <= config.last10Count && (actualCount > 0 || warnings.length === 1); // Allow 0 results with warning

  return {
    isValid,
    warnings,
    expectedCount,
    actualCount
  };
}

/**
 * Log L10 mode summary for debugging and monitoring
 * 
 * @param result - The preparation result
 * @param validation - The validation result
 */
export function logL10ModeSummary(
  result: PrepareTranscriptsResult,
  validation: ReturnType<typeof validateL10Mode>
): void {
  if (!result.wasL10Mode) {
    return; // Only log for L10 mode
  }

  console.log('=== L10 MODE SUMMARY ===', {
    mode: 'L10_TESTING',
    transcriptsFound: result.candidates.length,
    expectedCount: validation.expectedCount,
    clearedExistingNotes: result.clearedNotesCount,
    validationPassed: validation.isValid,
    warnings: validation.warnings,
    preparationTimeMs: result.elapsedMs
  });

  if (validation.warnings.length > 0) {
    console.warn('L10 MODE WARNINGS:', validation.warnings);
  }

  if (result.candidates.length > 0) {
    console.log('L10 MODE TRANSCRIPT DETAILS:', {
      oldestTranscript: {
        id: result.candidates[result.candidates.length - 1]?.id,
        createdAt: result.candidates[result.candidates.length - 1]?.created_at
      },
      newestTranscript: {
        id: result.candidates[0]?.id,
        createdAt: result.candidates[0]?.created_at
      }
    });
  }

  console.log('=== END L10 MODE SUMMARY ===');
} 