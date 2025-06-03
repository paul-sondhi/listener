/**
 * Common utility types used across the application
 * Includes base entities, pagination, and configuration types
 */

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

// Enhanced pagination with cursor support
export interface CursorPaginationParams {
  limit: number;
  cursor?: string;
  direction?: 'forward' | 'backward';
}

// Paginated response metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  offset?: number;
}

// Cursor pagination metadata
export interface CursorPaginationMeta {
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: string;
  prevCursor?: string;
  total?: number;
}

// Generic database entity with timestamps
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// Entity with soft delete
export interface SoftDeleteEntity extends BaseEntity {
  deleted_at: string | null;
  is_deleted: boolean;
}

// Entity with user tracking
export interface UserTrackedEntity extends BaseEntity {
  created_by?: string;
  updated_by?: string;
}

// File metadata types
export interface FileMetadata {
  filename: string;
  mimetype: string;
  size: number;
  checksum?: string;
  encoding?: string;
}

// File upload with metadata
export interface FileUpload extends FileMetadata {
  buffer: Buffer;
  originalname?: string;
  fieldname?: string;
}

// File upload result
export interface FileUploadResult extends FileMetadata {
  id: string;
  url: string;
  public_url?: string;
  storage_path: string;
  uploaded_at: string;
  expires_at?: string;
}

// Environment configuration
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

// Configuration validation
export interface ConfigValidation {
  required: (keyof Environment)[];
  optional: (keyof Environment)[];
  defaults: Partial<Environment>;
}

// Sort parameters
export interface SortParams<T = string> {
  field: T;
  direction: 'asc' | 'desc';
}

// Filter operators
export type FilterOperator = 
  | 'eq' | 'neq' 
  | 'gt' | 'gte' 
  | 'lt' | 'lte' 
  | 'in' | 'nin' 
  | 'like' | 'ilike' 
  | 'is_null' | 'not_null'
  | 'between' | 'not_between';

// Generic filter condition
export interface FilterCondition<T = unknown> {
  field: string;
  operator: FilterOperator;
  value: T | T[];
}

// Search parameters
export interface SearchParams {
  query?: string;
  fields?: string[];
  exact?: boolean;
  case_sensitive?: boolean;
}

// Common status types
export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

// Time range
export interface TimeRange {
  start: string; // ISO 8601 date string
  end: string;   // ISO 8601 date string
}

// Geographic location
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

// Audit log entry
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

// Feature flag
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

// Cache configuration
export interface CacheConfig {
  ttl: number; // Time to live in seconds
  max_size?: number;
  strategy?: 'lru' | 'fifo' | 'lifo';
  prefix?: string;
}

// Rate limiting configuration
export interface RateLimitConfig {
  window_ms: number;
  max_requests: number;
  key_generator?: (req: unknown) => string;
  skip_successful_requests?: boolean;
  skip_failed_requests?: boolean;
}

// Health check status
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