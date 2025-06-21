import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';

/**
 * Lightweight singleton wrapper around Supabase `createClient`.
 * It avoids multiple isolated in-memory mock databases during Vitest runs
 * but leaves `createClient` itself untouched so existing mocks/spies still
 * work exactly as before.
 */

let sharedClient: SupabaseClient<Database> | null = null;

export function getSharedSupabaseClient(): SupabaseClient<Database> {
  if (sharedClient) return sharedClient;

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  sharedClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return sharedClient;
} 