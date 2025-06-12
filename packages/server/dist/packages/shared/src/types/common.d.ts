/**
 * Common utility types used across the application
 * Includes base entities, pagination, and configuration types
 */
export interface PaginationParams {
    page: number;
    limit: number;
    offset?: number;
}
export interface CursorPaginationParams {
    limit: number;
    cursor?: string;
    direction?: 'forward' | 'backward';
}
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    offset?: number;
}
export interface CursorPaginationMeta {
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string;
    prevCursor?: string;
    total?: number;
}
export interface BaseEntity {
    id: string;
    created_at: string;
    updated_at: string;
}
export interface SoftDeleteEntity extends BaseEntity {
    deleted_at: string | null;
    is_deleted: boolean;
}
export interface UserTrackedEntity extends BaseEntity {
    created_by?: string;
    updated_by?: string;
}
export interface FileMetadata {
    filename: string;
    mimetype: string;
    size: number;
    checksum?: string;
    encoding?: string;
}
export interface FileUpload extends FileMetadata {
    buffer: Buffer;
    originalname?: string;
    fieldname?: string;
}
export interface FileUploadResult extends FileMetadata {
    id: string;
    url: string;
    public_url?: string;
    storage_path: string;
    uploaded_at: string;
    expires_at?: string;
}
export interface Environment {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT?: string;
    DATABASE_URL?: string;
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    DEEPGRAM_API_KEY?: string;
    SPOTIFY_CLIENT_ID?: string;
    SPOTIFY_CLIENT_SECRET?: string;
    REDIS_URL?: string;
    LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
    MAX_FILE_SIZE?: string;
    CORS_ORIGIN?: string;
}
export interface ConfigValidation {
    required: (keyof Environment)[];
    optional: (keyof Environment)[];
    defaults: Partial<Environment>;
}
export interface SortParams<T = string> {
    field: T;
    direction: 'asc' | 'desc';
}
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'like' | 'ilike' | 'is_null' | 'not_null' | 'between' | 'not_between';
export interface FilterCondition<T = unknown> {
    field: string;
    operator: FilterOperator;
    value: T | T[];
}
export interface SearchParams {
    query?: string;
    fields?: string[];
    exact?: boolean;
    case_sensitive?: boolean;
}
export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export interface TimeRange {
    start: string;
    end: string;
}
export interface Location {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    address?: string;
    city?: string;
    country?: string;
    postal_code?: string;
}
export interface AuditLogEntry extends BaseEntity {
    entity_type: string;
    entity_id: string;
    action: 'create' | 'update' | 'delete' | 'view';
    user_id?: string;
    user_ip?: string;
    user_agent?: string;
    changes?: Record<string, {
        old_value?: unknown;
        new_value?: unknown;
    }>;
    metadata?: Record<string, unknown>;
}
export interface FeatureFlag {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    rules?: FeatureFlagRule[];
    created_at: string;
    updated_at: string;
}
export interface FeatureFlagRule {
    id: string;
    condition: 'user_id' | 'email' | 'role' | 'percentage';
    operator: 'eq' | 'in' | 'like' | 'lt' | 'gt';
    value: string | number | string[];
    enabled: boolean;
}
export interface CacheConfig {
    ttl: number;
    max_size?: number;
    strategy?: 'lru' | 'fifo' | 'lifo';
    prefix?: string;
}
export interface RateLimitConfig {
    window_ms: number;
    max_requests: number;
    key_generator?: (req: unknown) => string;
    skip_successful_requests?: boolean;
    skip_failed_requests?: boolean;
}
export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, {
        status: 'pass' | 'warn' | 'fail';
        message?: string;
        duration_ms?: number;
        timestamp: string;
    }>;
    timestamp: string;
    uptime_ms: number;
    version?: string;
}
//# sourceMappingURL=common.d.ts.map