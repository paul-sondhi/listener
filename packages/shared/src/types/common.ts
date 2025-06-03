// Common utility types used across the application

// Generic response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Generic error response
export interface ApiError {
  success: false;
  error: string;
  message?: string;
  details?: unknown;
}

// Generic success response
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

// Paginated response
export interface PaginatedResponse<T> extends ApiSuccess<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Generic database entity
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// File upload types
export interface FileUpload {
  filename: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
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
} 