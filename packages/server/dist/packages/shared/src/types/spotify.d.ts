export type SpotifyScope = 'user-read-private' | 'user-read-email' | 'user-library-read' | 'user-library-modify' | 'playlist-read-private' | 'playlist-modify-public' | 'playlist-modify-private';
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
export interface SpotifyApiError {
    error: {
        status: number;
        message: string;
    };
}
export interface SpotifyTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    scope: string;
}
export interface SpotifyOAuthState {
    user_id: string;
    redirect_uri: string;
    state: string;
}
export interface SpotifyPagination<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    href: string;
    next?: string;
    previous?: string;
}
export type SpotifyShowEpisodes = SpotifyPagination<SpotifyEpisode>;
export type SpotifyUserShows = SpotifyPagination<{
    added_at: string;
    show: SpotifyShow;
}>;
export interface VaultOperationResult {
    success: boolean;
    data?: SpotifyTokens;
    error?: string;
    elapsed_ms: number;
}
export interface VaultDeleteResult {
    success: boolean;
    status_code: number;
    elapsed_ms: number;
    error?: string;
}
export interface TokenRefreshResult {
    success: boolean;
    tokens?: SpotifyTokens;
    requires_reauth: boolean;
    error?: string;
    elapsed_ms: number;
}
export interface TokenValidationResult {
    valid: boolean;
    expires_in_minutes: number;
    needs_refresh: boolean;
    error?: string;
}
export interface SpotifyRateLimit {
    is_limited: boolean;
    reset_at?: number;
    retry_after_seconds?: number;
}
export interface TokenServiceConfig {
    refresh_threshold_minutes: number;
    max_refresh_retries: number;
    cache_ttl_seconds: number;
    rate_limit_pause_seconds: number;
}
//# sourceMappingURL=spotify.d.ts.map