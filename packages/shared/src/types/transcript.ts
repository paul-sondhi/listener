/**
 * Transcript types for podcast episode transcriptions
 * Mirrors the database schema for the transcripts table
 */

import { BaseEntity } from './common.js';

/**
 * Valid transcript status values matching new database constraints
 * - full: Complete transcript stored
 * - partial: Incomplete transcript stored (still usable)
 * - processing: Transcript generation in progress (poll later)
 * - no_transcript_found: Episode exists but no transcript available yet
 * - no_match: Episode (or series) not found in Taddy database
 * - error: Processing failed due to system/API error (see error_details column)
 */
export type TranscriptStatus =
  | 'full'
  | 'partial'
  | 'processing'
  | 'no_transcript_found'
  | 'no_match'
  | 'error';

// Main transcript entity - mirrors the transcripts database table
export interface Transcript extends BaseEntity {
  id: string;
  episode_id: string;
  storage_path: string;         // Full path in transcripts bucket (e.g. show123/episode456.jsonl.gz)
  initial_status: TranscriptStatus; // First status recorded by Worker A
  current_status: TranscriptStatus; // Latest status (may evolve over time)
  word_count: number | null;    // Optional analytics helper (populated after processing)
  error_details?: string | null; // Optional details when status = error
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
  initial_status: TranscriptStatus;
  current_status?: TranscriptStatus; // Optional override; defaults to same as initial_status
  error_details?: string | null;
}

// Transcript update parameters (for status changes)
export interface UpdateTranscriptParams {
  current_status?: TranscriptStatus;
  word_count?: number | null;
  deleted_at?: string | null;
  error_details?: string | null;
  /** @deprecated use current_status */
  status?: TranscriptStatus;
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
  full_count: number;
  partial_count: number;
  processing_count: number;
  no_transcript_found_count: number;
  no_match_count: number;
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