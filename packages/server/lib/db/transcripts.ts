/**
 * Database helper functions for transcript operations
 * Provides CRUD operations for the transcripts table with proper error handling
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSharedSupabaseClient } from './sharedSupabaseClient';
import {
  Transcript,
  TranscriptStatus,
  UpdateTranscriptParams,
  TranscriptFilters
} from '@listener/shared';

// Lazy initialization of Supabase client for database operations
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = getSharedSupabaseClient();
  }
  return supabase;
}

/**
 * Insert a new transcript record with specified status
 * @param episodeId - UUID of the episode this transcript belongs to
 * @param storagePath - Full path to the transcript file in storage bucket (can be empty for processing status)
 * @param status - Transcript status (available, processing, error, etc.)
 * @param wordCount - Optional word count for the transcript (only set if provided)
 * @param source - Optional source of the transcript ('taddy' or 'podcaster')
 * @returns Promise<Transcript> The created transcript record
 * @throws Error if insertion fails or episode_id doesn't exist
 */
export async function insertTranscript(
  episodeId: string,
  storagePath: string,
  initialStatus: TranscriptStatus,
  currentStatus?: TranscriptStatus,
  wordCount?: number,
  source?: 'taddy' | 'podcaster',
  errorDetails?: string | null
): Promise<Transcript> {
  // Default currentStatus to initialStatus if not provided
  const resolvedCurrentStatus = currentStatus ?? initialStatus;

  const insertData: any = {
    episode_id: episodeId,
    initial_status: initialStatus,
    current_status: resolvedCurrentStatus
  };

  if (errorDetails) {
    insertData.error_details = errorDetails;
  }

  // Only set word_count if explicitly provided
  if (wordCount !== undefined) {
    insertData.word_count = wordCount;
  }

  // Set storage_path appropriately based on currentStatus
  if (storagePath) {
    insertData.storage_path = storagePath;
  } else if (resolvedCurrentStatus === 'error' || resolvedCurrentStatus === 'processing') {
    // For error and processing statuses, explicitly set empty string instead of NULL
    insertData.storage_path = '';
  }
  // For other statuses without storagePath, allow NULL (don't set the field)

  // Include source if provided
  if (source) {
    insertData.source = source;
  }

  const { data, error } = await getSupabaseClient()
    .from('transcripts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert transcript: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from transcript insertion');
  }

  return data as Transcript;
}

/**
 * Insert a new transcript record with 'processing' status (replacement for insertPending)
 * @param episodeId - UUID of the episode this transcript belongs to
 * @param storagePath - Full path to the transcript file in storage bucket (usually empty until file is stored)
 */
export async function insertProcessing(
  episodeId: string,
  storagePath: string = ''
): Promise<Transcript> {
  return insertTranscript(episodeId, storagePath, 'processing');
}

/**
 * Mark a transcript as available and optionally set word count
 * @param episodeId - UUID of the episode
 * @param wordCount - Optional word count for analytics
 * @returns Promise<Transcript> The updated transcript record
 * @throws Error if update fails or transcript not found
 */
export async function markAvailable(
  episodeId: string, 
  wordCount?: number
): Promise<Transcript> {
  const updateData: UpdateTranscriptParams = {
    current_status: 'full' as TranscriptStatus,
  };

  if (wordCount !== undefined) {
    updateData.word_count = wordCount;
  }

  const { data, error } = await getSupabaseClient()
    .from('transcripts')
    .update(updateData)
    .eq('episode_id', episodeId)
    .is('deleted_at', null) // Only update non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark transcript as available: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No transcript found for episode_id: ${episodeId}`);
  }

  return data as Transcript;
}

/**
 * Mark a transcript as error status
 * @param episodeId - UUID of the episode
 * @param reason - Optional error reason (stored in logs, not database)
 * @returns Promise<Transcript> The updated transcript record
 * @throws Error if update fails or transcript not found
 */
export async function markError(
  episodeId: string, 
  reason?: string
): Promise<Transcript> {
  // Log the error reason for debugging (not stored in database)
  if (reason) {
    console.error(`Transcript error for episode ${episodeId}: ${reason}`);
  }

  const updatePayload: UpdateTranscriptParams = {
    current_status: 'error' as TranscriptStatus,
  };

  if (reason) {
    updatePayload.error_details = reason;
  }

  const { data, error } = await getSupabaseClient()
    .from('transcripts')
    .update(updatePayload)
    .eq('episode_id', episodeId)
    .is('deleted_at', null) // Only update non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark transcript as error: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No transcript found for episode_id: ${episodeId}`);
  }

  return data as Transcript;
}

/**
 * Soft delete a transcript record by setting deleted_at timestamp
 * @param id - UUID of the transcript record
 * @returns Promise<Transcript> The soft-deleted transcript record
 * @throws Error if soft delete fails or transcript not found
 */
export async function softDelete(id: string): Promise<Transcript> {
  const { data, error } = await getSupabaseClient()
    .from('transcripts')
    .update({ 
      deleted_at: new Date().toISOString() 
    })
    .eq('id', id)
    .is('deleted_at', null) // Only soft-delete non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to soft delete transcript: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No transcript found with id: ${id}`);
  }

  return data as Transcript;
}

/**
 * Get a transcript by episode ID
 * @param episodeId - UUID of the episode
 * @param includeDeleted - Whether to include soft-deleted records (default: false)
 * @returns Promise<Transcript | null> The transcript record or null if not found
 * @throws Error if query fails
 */
export async function getByEpisodeId(
  episodeId: string, 
  includeDeleted: boolean = false
): Promise<Transcript | null> {
  let query = getSupabaseClient()
    .from('transcripts')
    .select()
    .eq('episode_id', episodeId);

  // Filter out soft-deleted records unless explicitly requested
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query.single();

  if (error) {
    // Return null if no record found (not an error condition)
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get transcript by episode_id: ${error.message}`);
  }

  return data as Transcript;
}

/**
 * Get transcripts with optional filtering
 * @param filters - Optional filters to apply
 * @returns Promise<Transcript[]> Array of transcript records
 * @throws Error if query fails
 */
export async function getTranscripts(filters?: TranscriptFilters): Promise<Transcript[]> {
  let query = getSupabaseClient().from('transcripts').select();

  // Apply filters if provided
  if (filters) {
    if (filters.episode_id) {
      query = query.eq('episode_id', filters.episode_id);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    if (filters.created_after) {
      query = query.gte('created_at', filters.created_after);
    }

    if (filters.created_before) {
      query = query.lte('created_at', filters.created_before);
    }

    if (filters.has_word_count !== undefined) {
      if (filters.has_word_count) {
        query = query.not('word_count', 'is', null);
      } else {
        query = query.is('word_count', null);
      }
    }

    // Filter out soft-deleted records unless explicitly requested
    if (!filters.include_deleted) {
      query = query.is('deleted_at', null);
    }
  } else {
    // Default: exclude soft-deleted records
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get transcripts: ${error.message}`);
  }

  return data as Transcript[];
}

/**
 * Count transcripts by status for dashboard/analytics
 * @param includeDeleted - Whether to include soft-deleted records (default: false)
 * @returns Promise<Record<TranscriptStatus, number>> Count by status
 * @throws Error if query fails
 */
export async function getStatusCounts(
  includeDeleted: boolean = false
): Promise<Record<TranscriptStatus, number>> {
  let query = getSupabaseClient()
    .from('transcripts')
    .select('status');

  // Filter out soft-deleted records unless explicitly requested
  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get transcript status counts: ${error.message}`);
  }

  // Count by status
  const counts: Record<TranscriptStatus, number> = {
    available: 0,
    processing: 0,
    error: 0
  };

  if (data) {
    for (const record of data) {
      const status = record.status as TranscriptStatus;
      if (status in counts) {
        counts[status]++;
      }
    }
  }

  return counts;
}

/**
 * Overwrite an existing transcript row for an episode (used by last-10 reprocessing)
 * Replaces status, storage_path, word_count, and source while keeping created_at intact.
 * @param episodeId - UUID of the episode whose transcript we are overwriting
 * @param storagePath - New storage path ("" allowed for processing/error)
 * @param initialStatus - Initial transcript status
 * @param currentStatus - New transcript status
 * @param wordCount - Optional new word count
 * @param source - Optional transcript source (e.g., 'taddy' or 'podcaster')
 * @param errorDetails - Optional error details
 * @returns Promise<Transcript> The updated transcript record
 */
export async function overwriteTranscript(
  episodeId: string,
  storagePath: string,
  initialStatus: TranscriptStatus,
  currentStatus: TranscriptStatus,
  wordCount?: number,
  source?: 'taddy' | 'podcaster',
  errorDetails?: string | null
): Promise<Transcript> {
  const updateData: any = {
    initial_status: initialStatus,
    current_status: currentStatus,
    storage_path: storagePath,
  };

  if (errorDetails) {
    updateData.error_details = errorDetails;
  }

  // Only set word_count if explicitly provided
  if (wordCount !== undefined) {
    updateData.word_count = wordCount;
  }

  // Include source if provided
  if (source !== undefined) {
    updateData.source = source;
  }

  const { data, error } = await getSupabaseClient()
    .from('transcripts')
    .update(updateData)
    .eq('episode_id', episodeId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to overwrite transcript: ${error.message}`);
  }
  if (!data) {
    throw new Error(`No transcript found for episode_id: ${episodeId}`);
  }
  return data as Transcript;
} 