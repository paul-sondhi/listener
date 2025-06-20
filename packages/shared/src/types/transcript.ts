/**
 * Transcript types for podcast episode transcriptions
 * Mirrors the database schema for the transcripts table
 */

import { BaseEntity } from './common.js';

// Transcript status values (must match database check constraint)
export type TranscriptStatus = 'pending' | 'available' | 'error';

// Main transcript entity - mirrors the transcripts database table
export interface Transcript extends BaseEntity {
  id: string;
  episode_id: string;
  storage_path: string;         // Full path in transcripts bucket (e.g. show123/episode456.jsonl.gz)
  status: TranscriptStatus;     // Current processing status
  word_count: number | null;    // Optional analytics helper (populated after processing)
  created_at: string;           // ISO 8601 timestamp
  updated_at: string;           // ISO 8601 timestamp (auto-updated by trigger)
  deleted_at: string | null;    // Soft delete timestamp
}

// Transcript with episode information for joined queries
export interface TranscriptWithEpisode extends Transcript {
  episode: {
    id: string;
    title: string;
    show_id: string;
    guid: string;
    pub_date: string;
  };
}

// Transcript creation parameters (for insertPending function)
export interface CreateTranscriptParams {
  episode_id: string;
  storage_path: string;
  status?: TranscriptStatus;    // Defaults to 'pending'
}

// Transcript update parameters (for status changes)
export interface UpdateTranscriptParams {
  status?: TranscriptStatus;
  word_count?: number | null;
  deleted_at?: string | null;
}

// Search/filter parameters for transcript queries
export interface TranscriptFilters {
  episode_id?: string;
  status?: TranscriptStatus | TranscriptStatus[];
  show_id?: string;             // For filtering by podcast show
  has_word_count?: boolean;     // Filter by whether word_count is populated
  created_after?: string;       // ISO 8601 date string
  created_before?: string;      // ISO 8601 date string
  include_deleted?: boolean;    // Whether to include soft-deleted records
}

// Transcript statistics for dashboard/analytics
export interface TranscriptStats {
  total_transcripts: number;
  pending_count: number;
  available_count: number;
  error_count: number;
  total_word_count: number;
  average_word_count: number;
  transcripts_today: number;
  transcripts_this_week: number;
}

// File format types for transcript storage
export type TranscriptFileFormat = 'jsonl' | 'txt' | 'jsonl.gz' | 'txt.gz';

// Transcript file metadata (for storage operations)
export interface TranscriptFileMetadata {
  format: TranscriptFileFormat;
  compression: 'none' | 'gzip';
  size_bytes: number;
  word_count?: number;
  language?: string;
  confidence_score?: number;
} 