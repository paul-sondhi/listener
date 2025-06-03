// Supabase client configuration
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Type definitions for environment variables
export interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

// Create and export the Supabase client with proper typing
export const createSupabaseClient = (env: SupabaseConfig): SupabaseClient => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
};

// User object structure with proper typing
export interface User {
  id: string;
  email: string;
  created_at: string;
}

// Example user object structure
export const exampleUser: User = {
  id: '',
  email: '',
  created_at: ''
};

// API endpoints configuration with proper typing
export const API_ENDPOINTS = Object.freeze({
  AUTH: '/auth',
  USERS: '/users',
  SPOTIFY_TOKENS: '/api/spotify-tokens',
  TRANSCRIBE: '/api/transcribe',
  SYNC_SHOWS: '/api/sync-shows',
  HEALTH: '/health'
} as const);

// Type for API endpoints
export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

// Export all types
export * from './types/index.js'; 