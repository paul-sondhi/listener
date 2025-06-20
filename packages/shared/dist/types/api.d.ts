/**
 * API-related type definitions for HTTP requests and responses
 * Covers standard response formats, error handling, and API contracts
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp?: string;
}
export interface ApiSuccess<T = unknown> extends ApiResponse<T> {
    success: true;
    data: T;
    error?: never;
}
export interface ApiError extends ApiResponse {
    success: false;
    data?: never;
    error: string;
}
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export interface TranscriptionRequest {
    url: string;
    options?: {
        model?: string;
        language?: string;
        smart_format?: boolean;
        punctuate?: boolean;
        diarize?: boolean;
    };
}
export interface TranscriptionResponse {
    transcript: string;
    confidence?: number;
    duration?: number;
    metadata?: {
        model: string;
        language: string;
        processing_time: number;
    };
}
export interface TranscriptionError {
    error: string;
    code?: string;
    details?: string;
}
export interface SpotifyTokenRequest {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}
export interface SpotifyTokenResponse {
    success: boolean;
    message?: string;
    expires_at?: number;
}
export interface SpotifyTokenError {
    error: string;
    code?: string;
}
export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version?: string;
    services?: {
        database: 'connected' | 'disconnected' | 'error';
        deepgram: 'available' | 'unavailable' | 'error';
        spotify: 'available' | 'unavailable' | 'error';
    };
}
export interface ApiErrorResponse extends ApiResponse {
    success: false;
    error: string;
    code?: string;
    details?: unknown;
    stack?: string;
}
export interface SyncShowsRequest {
    force_refresh?: boolean;
}
export interface SyncShowsResponse extends ApiResponse {
    success: true;
    active_count: number;
    inactive_count: number;
    total_processed: number;
    skipped_count?: number;
    errors?: string[];
}
export interface SyncShowsError extends ApiErrorResponse {
    error: string;
    spotify_errors?: string[];
    database_errors?: string[];
}
export interface UserSpotifyTokens {
    user_id?: string;
}
export interface AuthTokenRequest {
    email: string;
    password: string;
}
export type AuthTokenResponse = ApiSuccess<{
    access_token: string;
    refresh_token: string;
    user: {
        id: string;
        email: string;
        created_at: string;
    };
}>;
export interface RefreshTokenRequest {
    refresh_token: string;
}
export type RefreshTokenResponse = ApiSuccess<{
    access_token: string;
    expires_at: number;
}>;
export interface CreatePodcastRequest {
    title: string;
    description?: string;
    rss_url?: string;
    spotify_url?: string;
    category?: string;
}
export type CreatePodcastResponse = ApiSuccess<{
    id: string;
    title: string;
    created_at: string;
}>;
export interface UpdatePodcastRequest extends Partial<CreatePodcastRequest> {
    id: string;
}
export type UpdatePodcastResponse = ApiSuccess<{
    id: string;
    updated_at: string;
}>;
export interface DeletePodcastRequest {
    id: string;
}
export type DeletePodcastResponse = ApiSuccess<{
    id: string;
    deleted_at: string;
}>;
export interface CreateEpisodeRequest {
    podcast_id: string;
    title: string;
    description?: string;
    audio_url?: string;
    spotify_url?: string;
    duration?: number;
    episode_number?: number;
    season_number?: number;
}
export type CreateEpisodeResponse = ApiSuccess<{
    id: string;
    podcast_id: string;
    title: string;
    created_at: string;
}>;
export interface UpdateEpisodeRequest extends Partial<CreateEpisodeRequest> {
    id: string;
}
export type UpdateEpisodeResponse = ApiSuccess<{
    id: string;
    updated_at: string;
}>;
export interface CreateTranscriptionJobRequest {
    episode_id: string;
    audio_url: string;
    options?: {
        model?: string;
        language?: string;
        priority?: 'low' | 'normal' | 'high';
    };
}
export type CreateTranscriptionJobResponse = ApiSuccess<{
    job_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
}>;
export type GetTranscriptionJobResponse = ApiSuccess<{
    job_id: string;
    episode_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: number;
    transcript?: string;
    error?: string;
    created_at: string;
    updated_at: string;
    completed_at?: string;
}>;
export interface CreateSubscriptionRequest {
    spotify_url: string;
    status?: 'active' | 'inactive';
}
export type CreateSubscriptionResponse = ApiSuccess<{
    id: string;
    spotify_url: string;
    status: string;
    created_at: string;
}>;
export interface UpdateSubscriptionRequest {
    id: string;
    status: 'active' | 'inactive';
}
export type UpdateSubscriptionResponse = ApiSuccess<{
    id: string;
    status: string;
    updated_at: string;
}>;
export interface ListSubscriptionsRequest {
    status?: 'active' | 'inactive' | 'all';
    limit?: number;
    offset?: number;
}
export type ListSubscriptionsResponse = ApiSuccess<{
    subscriptions: Array<{
        id: string;
        spotify_url: string;
        status: string;
        created_at: string;
        updated_at: string;
    }>;
    total: number;
    limit: number;
    offset: number;
}>;
export interface FileUploadRequest {
    file: File | Buffer;
    filename: string;
    content_type: string;
    metadata?: Record<string, unknown>;
}
export type FileUploadResponse = ApiSuccess<{
    file_id: string;
    filename: string;
    url: string;
    size: number;
    content_type: string;
    uploaded_at: string;
}>;
export interface BatchRequest<T> {
    operations: T[];
    options?: {
        stop_on_error?: boolean;
        max_concurrent?: number;
    };
}
export type BatchResponse<T> = ApiSuccess<{
    results: Array<{
        success: boolean;
        data?: T;
        error?: string;
        index: number;
    }>;
    total: number;
    successful: number;
    failed: number;
}>;
export interface WebSocketMessage<T = unknown> {
    type: string;
    payload: T;
    timestamp: string;
    request_id?: string;
}
export interface WebSocketResponse<T = unknown> extends WebSocketMessage<T> {
    success: boolean;
    error?: string;
}
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number;
    retry_after?: number;
}
export interface RateLimitError extends ApiErrorResponse {
    error: 'Rate limit exceeded';
    rate_limit: RateLimitInfo;
}
//# sourceMappingURL=api.d.ts.map