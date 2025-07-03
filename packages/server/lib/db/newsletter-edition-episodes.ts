/**
 * Newsletter Edition Episodes Database Helpers
 *
 * Provides CRUD operations for the newsletter_edition_episodes join table.
 * This table tracks which episodes were included in each newsletter edition
 * for traceability and analytics purposes.
 *
 * Table columns:
 *   - id (uuid, PK)
 *   - newsletter_edition_id (uuid, NOT NULL, FK to newsletter_editions)
 *   - episode_id (uuid, NOT NULL, FK to episode_transcript_notes.episode_id)
 *   - created_at (timestamptz, NOT NULL, default now())
 *
 * Constraints:
 *   - UNIQUE (newsletter_edition_id, episode_id) - prevents duplicate entries
 *   - Foreign key: newsletter_edition_id → newsletter_editions(id) ON DELETE CASCADE
 *   - Foreign key: episode_id → episode_transcript_notes(episode_id) ON DELETE CASCADE
 *   - Indexes on newsletter_edition_id and episode_id for efficient lookups
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSharedSupabaseClient } from './sharedSupabaseClient';
import type { Database } from '../../../shared/src/types/database.js';

// Lazy initialization of Supabase client for database operations
let supabase: SupabaseClient<Database> | null = null;

function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    supabase = getSharedSupabaseClient();
  }
  return supabase;
}

/**
 * Parameters for creating a new newsletter edition episode link
 */
export interface CreateNewsletterEditionEpisodeParams {
  newsletter_edition_id: string;
  episode_id: string;
}

/**
 * Parameters for creating multiple newsletter edition episode links
 */
export interface CreateNewsletterEditionEpisodesParams {
  newsletter_edition_id: string;
  episode_ids: string[];
}

/**
 * Insert a single newsletter edition episode link.
 *
 * @param params - Parameters for creating the link
 * @returns The inserted newsletter edition episode record
 * @throws Error if validation fails, foreign key constraints are violated, or insert fails
 */
export async function insertNewsletterEditionEpisode(
  params: CreateNewsletterEditionEpisodeParams
): Promise<Database['public']['Tables']['newsletter_edition_episodes']['Row']> {
  // Validate newsletter_edition_id
  if (!params.newsletter_edition_id || typeof params.newsletter_edition_id !== 'string' || params.newsletter_edition_id.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  // Validate episode_id
  if (!params.episode_id || typeof params.episode_id !== 'string' || params.episode_id.trim() === '') {
    throw new Error('episode_id is required and must be a non-empty string');
  }

  // Validate that newsletter edition exists
  const { data: newsletter, error: newsletterError } = await getSupabaseClient()
    .from('newsletter_editions')
    .select('id')
    .eq('id', params.newsletter_edition_id)
    .single();

  if (newsletterError || !newsletter) {
    throw new Error(`Newsletter edition with id ${params.newsletter_edition_id} does not exist`);
  }

  // Validate that episode transcript note exists (since we reference episode_transcript_notes.episode_id)
  const { data: episodeNote, error: episodeError } = await getSupabaseClient()
    .from('episode_transcript_notes')
    .select('episode_id')
    .eq('episode_id', params.episode_id)
    .single();

  if (episodeError || !episodeNote) {
    throw new Error(`Episode transcript note with episode_id ${params.episode_id} does not exist`);
  }

  const insertData = {
    newsletter_edition_id: params.newsletter_edition_id,
    episode_id: params.episode_id
  };

  // Insert and return the row (following the pattern of other working tests)
  const { data, error } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert newsletter edition episode: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from newsletter edition episode insertion');
  }

  return data;
}

/**
 * Insert multiple newsletter edition episode links.
 *
 * @param params - Parameters containing newsletter edition ID and array of episode IDs
 * @returns Array of inserted newsletter edition episode records
 * @throws Error if validation fails, foreign key constraints are violated, or insert fails
 */
export async function insertNewsletterEditionEpisodes(
  params: CreateNewsletterEditionEpisodesParams
): Promise<Database['public']['Tables']['newsletter_edition_episodes']['Row'][]> {
  // Validate newsletter_edition_id
  if (!params.newsletter_edition_id || typeof params.newsletter_edition_id !== 'string' || params.newsletter_edition_id.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  // Validate episode_ids array
  if (!params.episode_ids || !Array.isArray(params.episode_ids) || params.episode_ids.length === 0) {
    throw new Error('episode_ids array is required and must contain at least one episode_id');
  }

  // Validate each episode_id
  for (let i = 0; i < params.episode_ids.length; i++) {
    const episodeId = params.episode_ids[i];
    if (!episodeId || typeof episodeId !== 'string' || episodeId.trim() === '') {
      throw new Error(`episode_ids[${i}] must be a non-empty string`);
    }
  }

  // Validate that newsletter edition exists
  const { data: newsletter, error: newsletterError } = await getSupabaseClient()
    .from('newsletter_editions')
    .select('id')
    .eq('id', params.newsletter_edition_id)
    .single();

  if (newsletterError || !newsletter) {
    throw new Error(`Newsletter edition with id ${params.newsletter_edition_id} does not exist`);
  }

  // Validate that all episode transcript notes exist
  for (const episodeId of params.episode_ids) {
    const { data: episodeNote, error: episodeError } = await getSupabaseClient()
      .from('episode_transcript_notes')
      .select('episode_id')
      .eq('episode_id', episodeId)
      .single();

    if (episodeError || !episodeNote) {
      throw new Error(`Episode transcript note with episode_id ${episodeId} does not exist`);
    }
  }

  // Remove duplicates to prevent unique constraint violations
  const uniqueEpisodeIds = [...new Set(params.episode_ids)];

  const insertData = uniqueEpisodeIds.map(episodeId => ({
    newsletter_edition_id: params.newsletter_edition_id,
    episode_id: episodeId
  }));

  const { data, error } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .insert(insertData)
    .select();

  if (error) {
    throw new Error(`Failed to insert newsletter edition episodes: ${error.message}`);
  }

  if (Array.isArray(data) && data.length > 0) {
    return data;
  }

  throw new Error('No data returned from newsletter edition episodes insertion');
}

/**
 * Get all episodes included in a specific newsletter edition.
 *
 * @param newsletterEditionId - UUID of the newsletter edition
 * @returns Array of newsletter edition episode records with episode details
 * @throws Error if validation fails or DB query fails
 */
export async function getEpisodesByNewsletterId(
  newsletterEditionId: string
): Promise<Array<Database['public']['Tables']['newsletter_edition_episodes']['Row'] & {
  episodes: Database['public']['Tables']['podcast_episodes']['Row'] | null;
}>> {
  // Validate newsletter_edition_id
  if (!newsletterEditionId || typeof newsletterEditionId !== 'string' || newsletterEditionId.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  // Step 1: Fetch join table rows
  const { data: joinRows, error: joinError } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .select('*')
    .eq('newsletter_edition_id', newsletterEditionId)
    .order('created_at', { ascending: true });

  if (joinError) {
    throw new Error(`Failed to get episodes by newsletter ID: ${joinError.message}`);
  }
  if (!joinRows || joinRows.length === 0) return [];

  // Step 2: Fetch all podcast_episodes for the episode_ids
  const episodeIds = joinRows.map(r => r.episode_id);
  const { data: episodes, error: episodesError } = await getSupabaseClient()
    .from('podcast_episodes')
    .select('*')
    .in('id', episodeIds);

  if (episodesError) {
    throw new Error(`Failed to fetch episodes: ${episodesError.message}`);
  }

  // Step 3: Merge
  const episodeMap = new Map((episodes || []).map(e => [e.id, e]));
  return joinRows.map(row => ({
    ...row,
    episodes: episodeMap.get(row.episode_id) || null
  }));
}

/**
 * Get all newsletter editions that included a specific episode.
 *
 * @param episodeId - UUID of the episode
 * @returns Array of newsletter edition episode records with newsletter details
 * @throws Error if validation fails or DB query fails
 */
export async function getNewslettersByEpisodeId(
  episodeId: string
): Promise<Array<Database['public']['Tables']['newsletter_edition_episodes']['Row'] & {
  newsletter_editions: Database['public']['Tables']['newsletter_editions']['Row'] | null;
}>> {
  // Validate episode_id
  if (!episodeId || typeof episodeId !== 'string' || episodeId.trim() === '') {
    throw new Error('episode_id is required and must be a non-empty string');
  }

  // Step 1: Fetch join table rows
  const { data: joinRows, error: joinError } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .select('*')
    .eq('episode_id', episodeId)
    .order('created_at', { ascending: false });

  if (joinError) {
    throw new Error(`Failed to get newsletters by episode ID: ${joinError.message}`);
  }
  if (!joinRows || joinRows.length === 0) return [];

  // Step 2: Fetch all newsletter_editions for the newsletter_edition_ids
  const newsletterIds = joinRows.map(r => r.newsletter_edition_id);
  const { data: newsletters, error: newslettersError } = await getSupabaseClient()
    .from('newsletter_editions')
    .select('*')
    .in('id', newsletterIds);

  if (newslettersError) {
    throw new Error(`Failed to fetch newsletter editions: ${newslettersError.message}`);
  }

  // Step 3: Merge
  const newsletterMap = new Map((newsletters || []).map(n => [n.id, n]));
  return joinRows.map(row => ({
    ...row,
    newsletter_editions: newsletterMap.get(row.newsletter_edition_id) || null
  }));
}

/**
 * Delete all episode links for a specific newsletter edition.
 *
 * @param newsletterEditionId - UUID of the newsletter edition
 * @returns Number of deleted records
 * @throws Error if validation fails or DB query fails
 */
export async function deleteNewsletterEditionEpisodes(
  newsletterEditionId: string
): Promise<number> {
  // Validate newsletter_edition_id
  if (!newsletterEditionId || typeof newsletterEditionId !== 'string' || newsletterEditionId.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  const { data, error } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .delete()
    .eq('newsletter_edition_id', newsletterEditionId)
    .select('id');

  if (error) {
    throw new Error(`Failed to delete newsletter edition episodes: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * Check if a specific episode is already linked to a newsletter edition.
 *
 * @param newsletterEditionId - UUID of the newsletter edition
 * @param episodeId - UUID of the episode
 * @returns True if the link exists, false otherwise
 * @throws Error if validation fails or DB query fails
 */
export async function isEpisodeLinkedToNewsletter(
  newsletterEditionId: string,
  episodeId: string
): Promise<boolean> {
  // Validate newsletter_edition_id
  if (!newsletterEditionId || typeof newsletterEditionId !== 'string' || newsletterEditionId.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  // Validate episode_id
  if (!episodeId || typeof episodeId !== 'string' || episodeId.trim() === '') {
    throw new Error('episode_id is required and must be a non-empty string');
  }

  const { data, error } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .select('id')
    .eq('newsletter_edition_id', newsletterEditionId)
    .eq('episode_id', episodeId)
    .limit(1)
    .single();

  if (error) {
    // If no record found, that's expected - return false
    if (error.code === 'PGRST116') {
      return false;
    }
    throw new Error(`Failed to check episode link: ${error.message}`);
  }

  return !!data;
}

/**
 * Get count of episodes included in a specific newsletter edition.
 *
 * @param newsletterEditionId - UUID of the newsletter edition
 * @returns Number of episodes included in the newsletter
 * @throws Error if validation fails or DB query fails
 */
export async function getEpisodeCountByNewsletterId(
  newsletterEditionId: string
): Promise<number> {
  // Validate newsletter_edition_id
  if (!newsletterEditionId || typeof newsletterEditionId !== 'string' || newsletterEditionId.trim() === '') {
    throw new Error('newsletter_edition_id is required and must be a non-empty string');
  }

  const { count, error } = await getSupabaseClient()
    .from('newsletter_edition_episodes')
    .select('*', { count: 'exact', head: true })
    .eq('newsletter_edition_id', newsletterEditionId);

  if (error) {
    throw new Error(`Failed to get episode count: ${error.message}`);
  }

  return count || 0;
} 