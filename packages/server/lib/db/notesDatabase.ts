/**
 * Database operations for Episode Notes
 * 
 * Functions to insert and update episode notes in the episode_transcript_notes table,
 * handling both successful notes generation and error cases.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';

/**
 * Parameters for upserting episode notes
 */
export interface UpsertNotesParams {
  /** Episode ID (foreign key to podcast_episodes) */
  episodeId: string;
  /** Transcript ID (foreign key to transcripts) */
  transcriptId: string;
  /** Generated notes text (null for error cases) */
  notes?: string;
  /** Model used for generation (e.g., 'gemini-1.5-flash') */
  model?: string;
  /** Processing status ('done' or 'error') */
  status: 'done' | 'error';
  /** Error message (required when status is 'error') */
  errorMessage?: string;
  /** Input token count (optional for v1) */
  inputTokens?: number;
  /** Output token count (optional for v1) */
  outputTokens?: number;
}

/**
 * Result of upserting episode notes
 */
export interface UpsertNotesResult {
  /** Whether the upsert was successful */
  success: boolean;
  /** ID of the created/updated notes record */
  noteId?: string;
  /** Error message if upsert failed */
  error?: string;
  /** Time taken for the database operation in milliseconds */
  elapsedMs: number;
}

/**
 * Upsert episode notes into the database
 * 
 * This function handles both successful note generation (status='done') and
 * error cases (status='error'). It uses PostgreSQL's UPSERT functionality
 * to either insert a new record or update an existing one.
 * 
 * @param supabase - Supabase client instance
 * @param params - Parameters for the upsert operation
 * @returns Promise<UpsertNotesResult> - Result of the upsert operation
 */
export async function upsertEpisodeNotes(
  supabase: SupabaseClient<Database>,
  params: UpsertNotesParams
): Promise<UpsertNotesResult> {
  const startTime = Date.now();
  
  console.log('DEBUG: Upserting episode notes', {
    episodeId: params.episodeId,
    transcriptId: params.transcriptId,
    status: params.status,
    hasNotes: !!params.notes,
    hasError: !!params.errorMessage
  });

  try {
    // Validate required parameters
    if (!params.episodeId || !params.transcriptId) {
      throw new Error('episodeId and transcriptId are required');
    }

    if (!params.status || (params.status !== 'done' && params.status !== 'error')) {
      throw new Error('status must be either "done" or "error"');
    }

    if (params.status === 'error' && !params.errorMessage) {
      throw new Error('errorMessage is required when status is "error"');
    }

    if (params.status === 'done' && !params.notes) {
      throw new Error('notes are required when status is "done"');
    }

    // Prepare the data for upsert
    const now = new Date().toISOString();
    const upsertData: any = {
      episode_id: params.episodeId,
      transcript_id: params.transcriptId,
      status: params.status,
      updated_at: now,
      deleted_at: null // Ensure the record is not soft-deleted
    };

    // Add fields based on status
    if (params.status === 'done') {
      upsertData.notes = params.notes;
      upsertData.model = params.model || 'gemini-1.5-flash';
      upsertData.error_message = null; // Clear any previous error
    } else {
      // Prepare trimmed & classified error message
      const rawError = params.errorMessage || 'Unknown error';
      const errorType = classifyError(rawError);
      const prefix = `${errorType}: `;
      const maxErrorLength = 260 - prefix.length; // Reserve space for prefix
      const trimmed = rawError.length > maxErrorLength ? rawError.substring(0, maxErrorLength - 3) + '...' : rawError;
      upsertData.notes = null; // Clear notes on error
      upsertData.model = null; // Clear model on error
      upsertData.error_message = `${errorType}: ${trimmed}`;
    }

    // Add optional token counts if provided
    if (params.inputTokens !== undefined) {
      upsertData.input_tokens = params.inputTokens;
    }
    if (params.outputTokens !== undefined) {
      upsertData.output_tokens = params.outputTokens;
    }

    console.log('DEBUG: Prepared upsert data', {
      episodeId: params.episodeId,
      transcriptId: params.transcriptId,
      status: upsertData.status,
      hasNotes: !!upsertData.notes,
      hasError: !!upsertData.error_message,
      model: upsertData.model
    });

    // Perform the upsert operation
    // Note: We use the unique constraint on (episode_id) to handle conflicts
    const { data, error } = await supabase
      .from('episode_transcript_notes')
      .upsert(upsertData, {
        onConflict: 'episode_id',
        ignoreDuplicates: false // We want to update existing records
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Database upsert failed: ${error.message}`);
    }

    const elapsedMs = Date.now() - startTime;
    
    console.log('DEBUG: Successfully upserted episode notes', {
      noteId: data?.id,
      episodeId: params.episodeId,
      status: params.status,
      elapsedMs
    });

    return {
      success: true,
      noteId: data?.id,
      elapsedMs
    };

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('DEBUG: Failed to upsert episode notes', {
      episodeId: params.episodeId,
      transcriptId: params.transcriptId,
      error: errorMessage,
      elapsedMs
    });

    return {
      success: false,
      error: errorMessage,
      elapsedMs
    };
  }
}

/**
 * Delete existing notes for specific transcript IDs (used in L10 mode)
 * 
 * This function soft-deletes existing notes by setting the deleted_at timestamp.
 * This is used in L10 testing mode to clear existing notes before generating new ones.
 * 
 * @param supabase - Supabase client instance
 * @param transcriptIds - Array of transcript IDs to clear notes for
 * @returns Promise<{ success: boolean; deletedCount: number; error?: string }>
 */
export async function deleteExistingNotes(
  supabase: SupabaseClient<Database>,
  transcriptIds: string[]
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  if (transcriptIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  console.log('DEBUG: Soft-deleting existing notes', {
    transcriptCount: transcriptIds.length,
    transcriptIds: transcriptIds.slice(0, 3) // Log first 3 for debugging
  });

  try {
    const { data, error } = await supabase
      .from('episode_transcript_notes')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('transcript_id', transcriptIds)
      .is('deleted_at', null) // Only update active notes
      .select('id');

    if (error) {
      throw new Error(`Failed to delete existing notes: ${error.message}`);
    }

    const deletedCount = data?.length || 0;
    
    console.log('DEBUG: Successfully deleted existing notes', {
      deletedCount,
      transcriptCount: transcriptIds.length
    });

    return {
      success: true,
      deletedCount
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('DEBUG: Failed to delete existing notes', {
      error: errorMessage,
      transcriptCount: transcriptIds.length
    });

    return {
      success: false,
      deletedCount: 0,
      error: errorMessage
    };
  }
}

/**
 * Check if episode notes already exist for a given episode
 * 
 * @param supabase - Supabase client instance
 * @param episodeId - Episode ID to check
 * @returns Promise<boolean> - True if notes exist, false otherwise
 */
export async function episodeNotesExist(
  supabase: SupabaseClient<Database>,
  episodeId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('episode_transcript_notes')
      .select('id')
      .eq('episode_id', episodeId)
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (error) {
      // If no records found, that's expected - return false
      if (error.code === 'PGRST116') {
        return false;
      }
      throw error;
    }

    return !!data;

  } catch (error) {
    console.warn('DEBUG: Error checking if episode notes exist', {
      episodeId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // On error, assume notes don't exist to be safe
    return false;
  }
}

/**
 * Get existing episode notes for debugging/verification
 * 
 * @param supabase - Supabase client instance
 * @param episodeId - Episode ID to get notes for
 * @returns Promise with notes data or null if not found
 */
export async function getEpisodeNotes(
  supabase: SupabaseClient<Database>,
  episodeId: string
): Promise<{
  id: string;
  notes: string | null;
  status: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
} | null> {
  try {
    const { data, error } = await supabase
      .from('episode_transcript_notes')
      .select('id, notes, status, model, created_at, updated_at')
      .eq('episode_id', episodeId)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No records found
      }
      throw error;
    }

    return data;

  } catch (error) {
    console.warn('DEBUG: Error getting episode notes', {
      episodeId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return null;
  }
}

/**
 * Classify error messages into high-level categories
 */
function classifyError(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('404') || msg.includes('not found')) return 'download_error';
  if (msg.includes('gunzip') || msg.includes('parse') || msg.includes('jsonl')) return 'transcript_parse_error';
  if (msg.includes('gemini') || msg.includes('api')) return 'generation_error';
  if (msg.includes('database') || msg.includes('upsert')) return 'database_error';
  return 'unknown_error';
} 