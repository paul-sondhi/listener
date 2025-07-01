/**
 * Database helper functions for episode transcript notes operations
 * Provides CRUD operations for the episode_transcript_notes table with proper error handling
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSharedSupabaseClient } from './sharedSupabaseClient';
import { EpisodeTranscriptNote } from '@listener/shared';

// Lazy initialization of Supabase client for database operations
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = getSharedSupabaseClient();
  }
  return supabase;
}

/**
 * Parameters for creating a new episode transcript note
 */
export interface CreateEpisodeTranscriptNoteParams {
  episode_id: string;
  transcript_id: string;
  notes?: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  status: string;
  error_message?: string | null;
}

/**
 * Parameters for updating an existing episode transcript note
 */
export interface UpdateEpisodeTranscriptNoteParams {
  notes?: string | null;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  status?: string;
  error_message?: string | null;
  deleted_at?: string | null;
}

/**
 * Insert a new episode transcript note record
 * @param params - Parameters for creating the note
 * @returns Promise<EpisodeTranscriptNote> The created note record
 * @throws Error if insertion fails or foreign key constraints are violated
 */
export async function insertEpisodeTranscriptNote(
  params: CreateEpisodeTranscriptNoteParams
): Promise<EpisodeTranscriptNote> {
  // Validate non-negative token counts
  if (params.input_tokens < 0) {
    throw new Error('input_tokens must be non-negative');
  }
  if (params.output_tokens < 0) {
    throw new Error('output_tokens must be non-negative');
  }

  const insertData = {
    episode_id: params.episode_id,
    transcript_id: params.transcript_id,
    notes: params.notes || null,
    model: params.model,
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    status: params.status,
    error_message: params.error_message || null
  };

  const { data, error } = await getSupabaseClient()
    .from('episode_transcript_notes')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert episode transcript note: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from episode transcript note insertion');
  }

  return data as EpisodeTranscriptNote;
}

/**
 * Update an existing episode transcript note
 * @param id - UUID of the note to update
 * @param params - Parameters to update
 * @returns Promise<EpisodeTranscriptNote> The updated note record
 * @throws Error if update fails or note not found
 */
export async function updateEpisodeTranscriptNote(
  id: string,
  params: UpdateEpisodeTranscriptNoteParams
): Promise<EpisodeTranscriptNote> {
  // Validate non-negative token counts if provided
  if (params.input_tokens !== undefined && params.input_tokens < 0) {
    throw new Error('input_tokens must be non-negative');
  }
  if (params.output_tokens !== undefined && params.output_tokens < 0) {
    throw new Error('output_tokens must be non-negative');
  }

  const { data, error } = await getSupabaseClient()
    .from('episode_transcript_notes')
    .update(params)
    .eq('id', id)
    .is('deleted_at', null) // Only update non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update episode transcript note: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No episode transcript note found with id: ${id}`);
  }

  return data as EpisodeTranscriptNote;
}

/**
 * Get an episode transcript note by episode ID
 * @param episodeId - UUID of the episode
 * @param includeDeleted - Whether to include soft-deleted records
 * @returns Promise<EpisodeTranscriptNote | null> The note record or null if not found
 */
export async function getByEpisodeId(
  episodeId: string,
  includeDeleted: boolean = false
): Promise<EpisodeTranscriptNote | null> {
  let query = getSupabaseClient()
    .from('episode_transcript_notes')
    .select('*')
    .eq('episode_id', episodeId);

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query.single();

  if (error) {
    // If no record found, return null instead of throwing
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get episode transcript note by episode_id: ${error.message}`);
  }

  return data as EpisodeTranscriptNote;
}

/**
 * Get an episode transcript note by ID
 * @param id - UUID of the note
 * @param includeDeleted - Whether to include soft-deleted records
 * @returns Promise<EpisodeTranscriptNote | null> The note record or null if not found
 */
export async function getById(
  id: string,
  includeDeleted: boolean = false
): Promise<EpisodeTranscriptNote | null> {
  let query = getSupabaseClient()
    .from('episode_transcript_notes')
    .select('*')
    .eq('id', id);

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query.single();

  if (error) {
    // If no record found, return null instead of throwing
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get episode transcript note by id: ${error.message}`);
  }

  return data as EpisodeTranscriptNote;
}

/**
 * Soft delete an episode transcript note by setting deleted_at timestamp
 * @param id - UUID of the note record
 * @returns Promise<EpisodeTranscriptNote> The soft-deleted note record
 * @throws Error if soft delete fails or note not found
 */
export async function softDelete(id: string): Promise<EpisodeTranscriptNote> {
  const { data, error } = await getSupabaseClient()
    .from('episode_transcript_notes')
    .update({ 
      deleted_at: new Date().toISOString() 
    })
    .eq('id', id)
    .is('deleted_at', null) // Only soft-delete non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to soft delete episode transcript note: ${error.message}`);
  }

  if (!data) {
    throw new Error(`No episode transcript note found with id: ${id}`);
  }

  return data as EpisodeTranscriptNote;
}

/**
 * Get all episode transcript notes with optional filtering
 * @param includeDeleted - Whether to include soft-deleted records
 * @returns Promise<EpisodeTranscriptNote[]> Array of note records
 */
export async function getAllEpisodeTranscriptNotes(
  includeDeleted: boolean = false
): Promise<EpisodeTranscriptNote[]> {
  let query = getSupabaseClient()
    .from('episode_transcript_notes')
    .select('*')
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get episode transcript notes: ${error.message}`);
  }

  return (data || []) as EpisodeTranscriptNote[];
} 