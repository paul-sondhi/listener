// Spotify API types

// Spotify authentication scopes
export type SpotifyScope = 
  | 'user-read-private'
  | 'user-read-email'
  | 'user-library-read'
  | 'user-library-modify'
  | 'playlist-read-private'
  | 'playlist-modify-public'
  | 'playlist-modify-private';

// Spotify user profile
export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  followers: {
    total: number;
  };
  country: string;
  product: 'free' | 'premium';
}

// Spotify show (podcast)
export interface SpotifyShow {
  id: string;
  name: string;
  description: string;
  publisher: string;
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  languages: string[];
  media_type: string;
  explicit: boolean;
  total_episodes: number;
  external_urls: {
    spotify: string;
  };
  html_description: string;
  available_markets: string[];
}

// Spotify episode
export interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  duration_ms: number;
  explicit: boolean;
  external_urls: {
    spotify: string;
  };
  images: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  language: string;
  languages: string[];
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  audio_preview_url?: string;
  html_description: string;
  show: {
    id: string;
    name: string;
    description: string;
    publisher: string;
    images: Array<{
      url: string;
      height: number;
      width: number;
    }>;
    external_urls: {
      spotify: string;
    };
  };
}

// Spotify API error
export interface SpotifyApiError {
  error: {
    status: number;
    message: string;
  };
}

// Spotify token storage
export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  scope: string;
}

// Spotify OAuth state
export interface SpotifyOAuthState {
  user_id: string;
  redirect_uri: string;
  state: string;
}

// Spotify pagination
export interface SpotifyPagination<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  href: string;
  next?: string;
  previous?: string;
}

// Spotify show episodes response
export interface SpotifyShowEpisodes extends SpotifyPagination<SpotifyEpisode> {}

// Spotify user's saved shows
export interface SpotifyUserShows extends SpotifyPagination<{
  added_at: string;
  show: SpotifyShow;
}> {}

// === Vault & Token Management Types ===

// Vault operation result for token operations
export interface VaultOperationResult {
  success: boolean;
  data?: SpotifyTokens;
  error?: string;
  elapsed_ms: number;
}

// Vault delete operation result
export interface VaultDeleteResult {
  success: boolean;
  status_code: number;
  elapsed_ms: number;
  error?: string;
}

// Token refresh operation result
export interface TokenRefreshResult {
  success: boolean;
  tokens?: SpotifyTokens;
  requires_reauth: boolean;
  error?: string;
  elapsed_ms: number;
}

// Token validation result
export interface TokenValidationResult {
  valid: boolean;
  expires_in_minutes: number;
  needs_refresh: boolean;
  error?: string;
}

// Spotify rate limit state
export interface SpotifyRateLimit {
  is_limited: boolean;
  reset_at?: number; // Unix timestamp when limit resets
  retry_after_seconds?: number;
}

// Token service configuration
export interface TokenServiceConfig {
  refresh_threshold_minutes: number; // When to refresh tokens before expiry (default: 5)
  max_refresh_retries: number; // Max retries on refresh failure (default: 1)
  cache_ttl_seconds: number; // Cache TTL in seconds (default: 60)
  rate_limit_pause_seconds: number; // Global pause on 429 errors (default: 30)
} 