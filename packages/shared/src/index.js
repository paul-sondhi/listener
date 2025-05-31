// Supabase client configuration
import { createClient } from '@supabase/supabase-js';

// Create and export the Supabase client
export const createSupabaseClient = (env) => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
};

// Example user object structure
export const exampleUser = {
  id: '',
  email: '',
  created_at: ''
};

// Export any other shared utilities or constants here
export const API_ENDPOINTS = Object.freeze({
  AUTH: '/auth',
  USERS: '/users',
}); 