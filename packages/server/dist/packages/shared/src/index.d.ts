import { SupabaseClient } from '@supabase/supabase-js';
export interface SupabaseConfig {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}
export declare const createSupabaseClient: (env: SupabaseConfig) => SupabaseClient;
export interface User {
    id: string;
    email: string;
    created_at: string;
}
export declare const exampleUser: User;
export declare const API_ENDPOINTS: Readonly<{
    readonly AUTH: "/auth";
    readonly USERS: "/users";
    readonly SPOTIFY_TOKENS: "/api/spotify-tokens";
    readonly TRANSCRIBE: "/api/transcribe";
    readonly SYNC_SHOWS: "/api/sync-shows";
    readonly HEALTH: "/health";
}>;
export type ApiEndpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];
export * from './types/index.js';
//# sourceMappingURL=index.d.ts.map