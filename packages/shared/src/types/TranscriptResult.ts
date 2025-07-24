import { TranscriptSource } from './transcript.js';

/**
 * Shared TranscriptResult type for all transcript lookup operations
 * 
 * This discriminated union represents all possible outcomes when fetching
 * transcripts from any provider (Taddy Free, Taddy Business, etc.)
 * 
 * Variants:
 * - full: Complete transcript with all text available
 * - partial: Incomplete transcript (still processing or partially available)
 * - processing: Transcript generation is in progress (Business tier only)
 * - not_found: No transcript available for this episode
 * - no_match: Episode/podcast not found in provider database
 * - error: API error or processing failure
 */
export type TranscriptResult =
  | { kind: 'full'; text: string; wordCount: number }
  | { kind: 'partial'; text: string; wordCount: number }
  | { kind: 'processing' }
  | { kind: 'not_found' }
  | { kind: 'no_match' }
  | { kind: 'error'; message: string };

/**
 * Extended TranscriptResult with provider-specific metadata
 * Used internally by clients to track source and credit consumption
 */
export type ExtendedTranscriptResult = TranscriptResult & {
  source?: TranscriptSource;
  creditsConsumed?: number;
}; 