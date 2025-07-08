/**
 * Database queries for the Send Newsletter Worker
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { debugDatabase } from '../debugLogger';

export interface NewsletterEditionWithUser {
  id: string;
  user_id: string;
  edition_date: string;
  status: string;
  user_email: string;
  content: string | null;
  model: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sent_at: string | null;
}

export async function queryNewsletterEditionsForSending(
  supabase: SupabaseClient<Database>,
  lookbackHours: number = 24,
  nowOverride?: number
): Promise<NewsletterEditionWithUser[]> {
  const now = nowOverride ?? Date.now();
  const lookbackDate = new Date(now - lookbackHours * 60 * 60 * 1000).toISOString();
  
  debugDatabase('Starting newsletter editions query for sending', {
    lookbackHours,
    lookbackDate,
    mode: 'NORMAL'
  });

  try {
    const { data: editions, error: queryError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('status', 'generated')
      .is('sent_at', null)
      .is('deleted_at', null)
      .gte('created_at', lookbackDate)
      .order('created_at', { ascending: true });

    if (queryError) {
      throw new Error(`Failed to query newsletter editions for sending: ${queryError.message}`);
    }

    return (editions || []) as NewsletterEditionWithUser[];

  } catch (error) {
    console.error('ERROR: Failed to query newsletter editions for sending:', error);
    throw error;
  }
}

export async function queryLast10NewsletterEditionsForSending(
  supabase: SupabaseClient<Database>
): Promise<NewsletterEditionWithUser[]> {
  debugDatabase('Starting L10 newsletter editions query for sending');

  try {
    const { data: editions, error: queryError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('status', 'generated')
      .is('sent_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (queryError) {
      throw new Error(`Failed to query last 10 newsletter editions for sending: ${queryError.message}`);
    }

    // Reverse to get chronological order (oldest first)
    return (editions || []).reverse() as NewsletterEditionWithUser[];

  } catch (error) {
    console.error('ERROR: Failed to query last 10 newsletter editions for sending:', error);
    throw error;
  }
}

export async function updateNewsletterEditionSentAt(
  supabase: SupabaseClient<Database>,
  editionId: string,
  sentAt?: string
): Promise<NewsletterEditionWithUser> {
  const timestamp = sentAt ?? new Date().toISOString();
  
  try {
    // Update the sent_at field
    const { data: _updateResult, error: updateError } = await supabase
      .from('newsletter_editions')
      .update({ sent_at: timestamp })
      .eq('id', editionId);
    
    if (updateError) {
      throw new Error(`Failed to update newsletter edition sent_at: ${updateError.message}`);
    }
    
    // Fetch the updated edition separately
    const { data: edition, error: fetchError } = await supabase
      .from('newsletter_editions')
      .select('*')
      .eq('id', editionId)
      .single();
    
    if (fetchError) {
      throw new Error(`Failed to fetch updated newsletter edition: ${fetchError.message}`);
    }

    if (!edition) {
      throw new Error(`No newsletter edition found with id: ${editionId}`);
    }

    return edition as NewsletterEditionWithUser;

  } catch (error) {
    console.error('ERROR: Failed to update newsletter edition sent_at:', error);
    throw error;
  }
} 