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
export interface SpotifyShowEpisodes extends SpotifyPagination<SpotifyEpisode> {
}
export interface SpotifyUserShows extends SpotifyPagination<{
    added_at: string;
    show: SpotifyShow;
}> {
}
//# sourceMappingURL=spotify.d.ts.map