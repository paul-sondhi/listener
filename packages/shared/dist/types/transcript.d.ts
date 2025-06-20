/**
 * Transcript types for podcast episode transcriptions
 * Mirrors the database schema for the transcripts table
 */
import { BaseEntity } from './common.js';
export type TranscriptStatus = 'pending' | 'available' | 'error';
export interface Transcript extends BaseEntity {
    id: string;
    episode_id: string;
    storage_path: string;
    status: TranscriptStatus;
    word_count: number | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}
export interface TranscriptWithEpisode extends Transcript {
    episode: {
        id: string;
        title: string;
        show_id: string;
        guid: string;
        pub_date: string;
    };
}
export interface CreateTranscriptParams {
    episode_id: string;
    storage_path: string;
    status?: TranscriptStatus;
}
export interface UpdateTranscriptParams {
    status?: TranscriptStatus;
    word_count?: number | null;
    deleted_at?: string | null;
}
export interface TranscriptFilters {
    episode_id?: string;
    status?: TranscriptStatus | TranscriptStatus[];
    show_id?: string;
    has_word_count?: boolean;
    created_after?: string;
    created_before?: string;
    include_deleted?: boolean;
}
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
export type TranscriptFileFormat = 'jsonl' | 'txt' | 'jsonl.gz' | 'txt.gz';
export interface TranscriptFileMetadata {
    format: TranscriptFileFormat;
    compression: 'none' | 'gzip';
    size_bytes: number;
    word_count?: number;
    language?: string;
    confidence_score?: number;
}
//# sourceMappingURL=transcript.d.ts.map