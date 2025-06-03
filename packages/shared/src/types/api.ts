// API request and response types

import { ApiResponse } from './common.js';

// HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// API request configuration
export interface ApiRequestConfig {
  method: HttpMethod;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

// Transcription request
export interface TranscriptionRequest {
  audioUrl: string;
  language?: string;
  model?: string;
}

// Transcription response
export interface TranscriptionResponse {
  transcript: string;
  confidence: number;
  duration: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

// Spotify token request
export interface SpotifyTokenRequest {
  code?: string;
  refresh_token?: string;
  grant_type: 'authorization_code' | 'refresh_token';
}

// Spotify token response
export interface SpotifyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Sync shows request
export interface SyncShowsRequest {
  showUrl: string;
  forceRefresh?: boolean;
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version?: string;
  uptime?: number;
  services?: {
    database: 'up' | 'down';
    supabase: 'up' | 'down';
  };
}

// Error response structure
export interface ApiErrorResponse extends ApiResponse {
  success: false;
  error: string;
  statusCode: number;
  timestamp: string;
  path: string;
} 