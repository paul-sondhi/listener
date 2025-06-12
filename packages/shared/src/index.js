// Supabase client configuration
import { createClient } from '@supabase/supabase-js';
// Create and export the Supabase client with proper typing
export const createSupabaseClient = (env) => {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
};
// Example user object structure
export const exampleUser = {
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
});
// Export all types
export * from './types/index.js';
