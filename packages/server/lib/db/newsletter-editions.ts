/**
 * Newsletter Editions Database Helpers
 *
 * Provides CRUD and upsert operations for the newsletter_editions table.
 *
 * Table columns:
 *   - id (uuid, PK)
 *   - user_id (uuid, NOT NULL, FK to auth.users)
 *   - edition_date (date, NOT NULL)
 *   - status (text, NOT NULL, CHECK: 'generated' | 'error' | 'no_notes_found')
 *   - user_email (text, NOT NULL)
 *   - content (text, nullable)
 *   - model (text, nullable)
 *   - error_message (text, nullable)
 *   - created_at (timestamptz, NOT NULL, default now())
 *   - updated_at (timestamptz, NOT NULL, default now())
 *   - deleted_at (timestamptz, nullable)
 *   - sent (boolean, NOT NULL, default false)
 *
 * Constraints:
 *   - UNIQUE (user_id, edition_date) WHERE deleted_at IS NULL
 *   - Foreign key: user_id → auth.users(id) ON DELETE CASCADE
 *   - CHECK (status IN ('generated', 'error', 'no_notes_found'))
 *   - Indexes on user_id, edition_date, status (all partial on deleted_at IS NULL)
 *   - updated_at auto-updated by trigger
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSharedSupabaseClient } from './sharedSupabaseClient';
import type { NewsletterEdition } from '@listener/shared';
import { randomUUID } from 'crypto';

// Lazy initialization of Supabase client for database operations
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = getSharedSupabaseClient();
  }
  return supabase;
}

/**
 * Parameters for creating a new newsletter edition
 */
export interface CreateNewsletterEditionParams {
  user_id: string;
  edition_date: string; // ISO YYYY-MM-DD
  status: string;
  content?: string | null;
  model?: string | null;
  error_message?: string | null;
}

/**
 * Parameters for updating the status (and optional error message) of a newsletter edition
 */
export interface UpdateNewsletterEditionStatusParams {
  status: string;
  error_message?: string | null;
}

/**
 * Insert a new newsletter edition row.
 *
 * - Validates user_id and edition_date.
 * - Fetches user_email from users table (throws if not found).
 * - Inserts a new row into newsletter_editions.
 *
 * @param params - Parameters for creating the edition
 * @returns The inserted NewsletterEdition row
 * @throws Error if validation fails or user not found or insert fails
 */
export async function insertNewsletterEdition(
  params: CreateNewsletterEditionParams
): Promise<NewsletterEdition> {
  // Validate user_id
  if (!params.user_id || typeof params.user_id !== 'string' || params.user_id.trim() === '') {
    throw new Error('user_id is required and must be a non-empty string');
  }
  // Validate edition_date (must be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.edition_date)) {
    throw new Error('edition_date must be a valid YYYY-MM-DD string');
  }

  // Fetch user_email from users table
  const { data: user, error: userError } = await getSupabaseClient()
    .from('users')
    .select('email')
    .eq('id', params.user_id)
    .single();
  if (userError) {
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }
  if (!user || !user.email) {
    throw new Error(`No user found with id: ${params.user_id}`);
  }

  // Prepare insert data
  const insertData = {
    user_id: params.user_id,
    edition_date: params.edition_date,
    status: params.status,
    user_email: user.email,
    content: params.content ?? null,
    model: params.model ?? null,
    error_message: params.error_message ?? null,
    deleted_at: null,
    id: randomUUID()
  };

  // Insert the row
  const { data, error } = await getSupabaseClient()
    .from('newsletter_editions')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert newsletter edition: ${error.message}`);
  }
  if (!data) {
    throw new Error('No data returned from newsletter edition insertion');
  }

  return data as NewsletterEdition;
}

/**
 * Upsert a newsletter edition row (insert or update on conflict).
 *
 * - Validates user_id and edition_date.
 * - Fetches user_email from users table (throws if not found).
 * - On conflict (user_id, edition_date), updates all fields, sets deleted_at = NULL, updated_at = NOW().
 *
 * @param params - Parameters for creating/updating the edition
 * @returns The upserted NewsletterEdition row
 * @throws Error if validation fails, user not found, or upsert fails
 */
export async function upsertNewsletterEdition(
  params: CreateNewsletterEditionParams
): Promise<NewsletterEdition> {
  // Validate user_id
  if (!params.user_id || typeof params.user_id !== 'string' || params.user_id.trim() === '') {
    throw new Error('user_id is required and must be a non-empty string');
  }
  // Validate edition_date (must be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.edition_date)) {
    throw new Error('edition_date must be a valid YYYY-MM-DD string');
  }

  // Fetch user_email from users table
  const { data: user, error: userError } = await getSupabaseClient()
    .from('users')
    .select('email')
    .eq('id', params.user_id)
    .single();
  if (userError) {
    throw new Error(`Failed to fetch user: ${userError.message}`);
  }
  if (!user || !user.email) {
    throw new Error(`No user found with id: ${params.user_id}`);
  }

  // Prepare upsert data
  const upsertData = {
    user_id: params.user_id,
    edition_date: params.edition_date,
    status: params.status,
    user_email: user.email,
    content: params.content ?? null,
    model: params.model ?? null,
    error_message: params.error_message ?? null,
    deleted_at: null,
    id: randomUUID()
  };

  // Perform upsert: ON CONFLICT (user_id, edition_date) DO UPDATE SET ...
  const { data, error } = await getSupabaseClient()
    .from('newsletter_editions')
    .upsert(upsertData, { onConflict: 'user_id,edition_date' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert newsletter edition: ${error.message}`);
  }
  if (!data) {
    throw new Error('No data returned from newsletter edition upsert');
  }

  return data as NewsletterEdition;
}

/**
 * Update the status (and optional error_message) of a newsletter edition by id.
 *
 * @param id - UUID of the newsletter edition to update
 * @param status - New status string
 * @param error_message - Optional error message string (or null)
 * @returns The updated NewsletterEdition row
 * @throws Error if validation fails, not found, or update fails
 */
export async function updateNewsletterEditionStatus(
  id: string,
  status: string,
  error_message?: string | null
): Promise<NewsletterEdition> {
  // Validate id
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('id is required and must be a non-empty string');
  }
  // Validate status
  if (!status || typeof status !== 'string' || status.trim() === '') {
    throw new Error('status is required and must be a non-empty string');
  }

  // Prepare update data
  const updateData: { status: string; error_message?: string | null } = { status };
  if (error_message !== undefined) {
    updateData.error_message = error_message;
  }

  // Update the row
  const { data, error } = await getSupabaseClient()
    .from('newsletter_editions')
    .update(updateData)
    .eq('id', id)
    .is('deleted_at', null) // Only update non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update newsletter edition status: ${error.message}`);
  }
  if (!data) {
    throw new Error(`No newsletter edition found with id: ${id}`);
  }

  return data as NewsletterEdition;
}

/**
 * Get a newsletter edition by user_id and edition_date.
 *
 * @param user_id - User ID (string)
 * @param edition_date - Edition date (YYYY-MM-DD string)
 * @param includeDeleted - Whether to include soft-deleted records (default: false)
 * @returns The NewsletterEdition row, or null if not found
 * @throws Error if validation fails or DB query fails
 */
export async function getByUserAndDate(
  user_id: string,
  edition_date: string,
  includeDeleted: boolean = false
): Promise<NewsletterEdition | null> {
  // Validate user_id
  if (!user_id || typeof user_id !== 'string' || user_id.trim() === '') {
    throw new Error('user_id is required and must be a non-empty string');
  }
  // Validate edition_date (must be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edition_date)) {
    throw new Error('edition_date must be a valid YYYY-MM-DD string');
  }

  // Build query
  let query = getSupabaseClient()
    .from('newsletter_editions')
    .select('*')
    .eq('user_id', user_id)
    .eq('edition_date', edition_date);

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  // Execute query
  const { data, error } = await query.single();

  if (error) {
    // If no record found, return null instead of throwing
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get newsletter edition by user_id and edition_date: ${error.message}`);
  }

  return data as NewsletterEdition;
}

/**
 * Soft delete a newsletter edition by setting deleted_at timestamp.
 *
 * @param id - UUID of the newsletter edition to soft delete
 * @returns The soft-deleted NewsletterEdition row
 * @throws Error if validation fails, not found, or update fails
 */
export async function softDelete(id: string): Promise<NewsletterEdition> {
  // Validate id
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('id is required and must be a non-empty string');
  }

  // Set deleted_at to current timestamp
  const { data, error } = await getSupabaseClient()
    .from('newsletter_editions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null) // Only soft delete non-deleted records
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to soft delete newsletter edition: ${error.message}`);
  }
  if (!data) {
    throw new Error(`No newsletter edition found with id: ${id}`);
  }

  return data as NewsletterEdition;
}

// (CRUD/upsert functions will be implemented in the next steps) 