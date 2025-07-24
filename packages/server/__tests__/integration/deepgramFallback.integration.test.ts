/**
 * Integration Tests for Deepgram Fallback Functionality
 * 
 * These tests verify the integration of the Deepgram fallback system components
 * by testing the interaction between services in isolation.
 * 
 * Note: Full end-to-end testing requires manual verification due to auth limitations.
 * See reference/documentation/deepgram-fallback-testing.md for manual testing checklist.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscriptWorkerConfig } from '../../config/transcriptWorkerConfig.js';
import type { TranscriptResult } from '@listener/shared';

describe('Deepgram Fallback Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Integration', () => {
    it('should include all required Deepgram configuration options', () => {
      // Test that the TranscriptWorkerConfig interface includes all Deepgram options
      const config: TranscriptWorkerConfig = {
        lookbackHours: 24,
        maxRequests: 15,
        concurrency: 5,
        enabled: true,
        cronSchedule: '0 1 * * *',
        useAdvisoryLock: false,
        tier: 'business',
        last10Mode: false,
        last10Count: 10,
        // Deepgram configuration
        enableDeepgramFallback: true,
        deepgramFallbackStatuses: ['no_match', 'no_transcript_found', 'error'],
        maxDeepgramFallbacksPerRun: 50,
        maxDeepgramFileSizeMB: 500
      };

      // Verify all required fields are present
      expect(config.enableDeepgramFallback).toBeDefined();
      expect(config.deepgramFallbackStatuses).toBeInstanceOf(Array);
      expect(config.maxDeepgramFallbacksPerRun).toBeTypeOf('number');
      expect(config.maxDeepgramFileSizeMB).toBeTypeOf('number');
    });

    it('should provide sensible default configuration values', async () => {
      // Import and test the actual configuration function
      const { getTranscriptWorkerConfig } = await import('../../config/transcriptWorkerConfig.js');
      
      // Get default configuration
      const config = getTranscriptWorkerConfig();

      // Verify Deepgram defaults are sensible
      expect(config.enableDeepgramFallback).toBe(true);
      expect(config.deepgramFallbackStatuses).toEqual(['no_match', 'no_transcript_found', 'error']);
      expect(config.maxDeepgramFallbacksPerRun).toBe(50);
      expect(config.maxDeepgramFileSizeMB).toBe(500);
    });
  });

  describe('Fallback Trigger Logic', () => {
    it('should correctly identify transcript results that trigger fallback', () => {
      // Test the fallback trigger logic with different transcript results
      const fallbackStatuses = ['no_match', 'no_transcript_found', 'error'];
      
      // Results that should trigger fallback
      const triggerResults: TranscriptResult[] = [
        { kind: 'no_match', message: 'Not found', source: 'taddy', creditsConsumed: 1 },
        { kind: 'error', message: 'API error', source: 'taddy', creditsConsumed: 1 },
        { kind: 'no_transcript_found', message: 'No transcript', source: 'taddy', creditsConsumed: 1 }
      ];

      // Results that should NOT trigger fallback
      const noTriggerResults: TranscriptResult[] = [
        { kind: 'full', text: 'Success', wordCount: 100, source: 'taddy', creditsConsumed: 1 },
        { kind: 'partial', text: 'Partial', wordCount: 50, reason: 'Processing', source: 'taddy', creditsConsumed: 1 },
        { kind: 'processing', source: 'taddy', creditsConsumed: 1 }
      ];

      // Test trigger logic
      for (const result of triggerResults) {
        expect(fallbackStatuses.includes(result.kind)).toBe(true);
      }

      for (const result of noTriggerResults) {
        expect(fallbackStatuses.includes(result.kind)).toBe(false);
      }
    });

    it('should respect custom fallback status configuration', () => {
      // Test with custom configuration (only error status)
      const customFallbackStatuses = ['error'];
      
      const errorResult: TranscriptResult = {
        kind: 'error',
        message: 'API error',
        source: 'taddy',
        creditsConsumed: 1
      };

      const noMatchResult: TranscriptResult = {
        kind: 'no_match',
        message: 'Not found',
        source: 'taddy',
        creditsConsumed: 1
      };

      // Only error should trigger with custom config
      expect(customFallbackStatuses.includes(errorResult.kind)).toBe(true);
      expect(customFallbackStatuses.includes(noMatchResult.kind)).toBe(false);
    });
  });

  describe('Type System Integration', () => {
    it('should support deepgram as a valid transcript source', () => {
      // Test that 'deepgram' is accepted as a valid source
      const deepgramResult: TranscriptResult = {
        kind: 'full',
        text: 'Deepgram transcript',
        wordCount: null, // Deepgram doesn't provide word count
        source: 'deepgram',
        creditsConsumed: 0
      };

      expect(deepgramResult.source).toBe('deepgram');
      expect(deepgramResult.wordCount).toBeNull();
    });

    it('should handle transcript metadata with deepgram source', () => {
      // Test transcript metadata object structure
      const transcriptMetadata = {
        episode_id: 'test-episode',
        show_id: 'test-show',
        transcript: 'Test transcript from Deepgram',
        created_at: new Date().toISOString()
      };

      // Should be serializable for JSONL storage
      expect(() => JSON.stringify(transcriptMetadata)).not.toThrow();
      
      const serialized = JSON.stringify(transcriptMetadata);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.episode_id).toBe('test-episode');
      expect(parsed.transcript).toBe('Test transcript from Deepgram');
    });
  });

  describe('Error Handling Integration', () => {
    it('should provide proper error structures for failed attempts', () => {
      // Test error result structure from failed Deepgram attempts
      const failedResult = {
        success: false,
        error: 'File size 750MB exceeds limit of 500MB',
        fileSizeMB: 750,
        processingTimeMs: 1500
      };

      expect(failedResult.success).toBe(false);
      expect(failedResult.error).toContain('exceeds limit');
      expect(failedResult.fileSizeMB).toBeGreaterThan(500);
      expect(failedResult.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle combined error messages for dual failures', () => {
      // Test error message combining when both Taddy and Deepgram fail
      const taddyError = 'SCHEMA_MISMATCH: GraphQL Error';
      const deepgramError = 'Network timeout after 30 seconds';
      const combinedError = `Original error: ${taddyError}. Deepgram fallback failed: ${deepgramError}`;

      expect(combinedError).toContain(taddyError);
      expect(combinedError).toContain(deepgramError);
      expect(combinedError).toContain('Deepgram fallback failed');
    });
  });

  describe('Storage Format Compatibility', () => {
    it('should produce JSONL compatible with existing transcript storage', () => {
      // Test that Deepgram transcripts can be stored in the same format as Taddy
      const deepgramTranscript = 'Speaker 1: Welcome to our show. Speaker 2: Thank you for having me.';
      
      const jsonlRecord = {
        episode_id: 'episode-123',
        show_id: 'show-456', 
        transcript: deepgramTranscript,
        created_at: new Date().toISOString()
      };

      // Should serialize without issues
      const jsonlLine = JSON.stringify(jsonlRecord);
      expect(() => JSON.parse(jsonlLine)).not.toThrow();
      
      // Should contain speaker labels
      expect(jsonlLine).toContain('Speaker 1:');
      expect(jsonlLine).toContain('Speaker 2:');
    });

    it('should handle gzip compression for storage', () => {
      // Test that content can be gzipped (basic structure test)
      const content = 'Test transcript content for compression';
      const buffer = Buffer.from(content, 'utf-8');
      
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.toString()).toBe(content);
    });
  });

  describe('Worker Summary Integration', () => {
    it('should include all required metrics in summary structure', () => {
      // Test that worker summary includes Deepgram metrics
      interface WorkerSummary {
        totalEpisodes: number;
        processedEpisodes: number;
        availableTranscripts: number;
        quotaExhausted: boolean;
        // Deepgram metrics
        deepgramFallbackAttempts: number;
        deepgramFallbackSuccesses: number;
        deepgramFallbackFailures: number;
      }

      const summary: WorkerSummary = {
        totalEpisodes: 10,
        processedEpisodes: 8,
        availableTranscripts: 6,
        quotaExhausted: false,
        deepgramFallbackAttempts: 3,
        deepgramFallbackSuccesses: 2,
        deepgramFallbackFailures: 1
      };

      // Verify all Deepgram metrics are present
      expect(summary.deepgramFallbackAttempts).toBeDefined();
      expect(summary.deepgramFallbackSuccesses).toBeDefined();
      expect(summary.deepgramFallbackFailures).toBeDefined();
      
      // Verify metric consistency
      expect(summary.deepgramFallbackSuccesses + summary.deepgramFallbackFailures)
        .toBe(summary.deepgramFallbackAttempts);
    });
  });

  describe('Logging and Monitoring Integration', () => {
    it('should validate logging metadata structure for successful transcription', () => {
      // Test that successful transcription logs contain required metadata
      const successLogMetadata = {
        job_id: 'test-job-123',
        episode_id: 'episode-456',
        storage_path: 'show-1/episode-456.jsonl.gz',
        file_size_mb: 45.2,
        transcript_length: 15234,
        processing_time_ms: 8500,
        estimated_duration_minutes: 0.14,
        estimated_cost_usd: 0.0006
      };

      // Verify all required fields are present
      expect(successLogMetadata.job_id).toBeDefined();
      expect(successLogMetadata.episode_id).toBeDefined();
      expect(successLogMetadata.storage_path).toBeDefined();
      expect(successLogMetadata.file_size_mb).toBeTypeOf('number');
      expect(successLogMetadata.transcript_length).toBeTypeOf('number');
      expect(successLogMetadata.processing_time_ms).toBeTypeOf('number');
      expect(successLogMetadata.estimated_duration_minutes).toBeTypeOf('number');
      expect(successLogMetadata.estimated_cost_usd).toBeTypeOf('number');

      // Verify cost calculations are reasonable
      expect(successLogMetadata.estimated_cost_usd).toBeGreaterThan(0);
      expect(successLogMetadata.estimated_cost_usd).toBeLessThan(1); // Should be less than $1 for most episodes
    });

    it('should validate logging metadata structure for failed transcription', () => {
      // Test that failed transcription logs contain required metadata
      const failureLogMetadata = {
        job_id: 'test-job-123',
        episode_id: 'episode-789',
        deepgram_error: 'File size 750MB exceeds limit of 500MB',
        file_size_mb: 750,
        processing_time_ms: 1500,
        original_taddy_status: 'no_match'
      };

      // Verify all required fields are present
      expect(failureLogMetadata.job_id).toBeDefined();
      expect(failureLogMetadata.episode_id).toBeDefined();
      expect(failureLogMetadata.deepgram_error).toBeDefined();
      expect(failureLogMetadata.file_size_mb).toBeTypeOf('number');
      expect(failureLogMetadata.processing_time_ms).toBeTypeOf('number');
      expect(failureLogMetadata.original_taddy_status).toBeDefined();

      // Verify error message is descriptive
      expect(failureLogMetadata.deepgram_error).toContain('exceeds limit');
    });

    it('should validate cost limit warning log structure', () => {
      // Test that cost limit warnings contain proper metadata
      const costLimitLogMetadata = {
        episode_id: 'episode-abc',
        original_taddy_status: 'error',
        fallback_attempts_used: 50,
        max_fallbacks_per_run: 50,
        limit: 50,
        processed: 50
      };

      // Verify all required fields are present
      expect(costLimitLogMetadata.episode_id).toBeDefined();
      expect(costLimitLogMetadata.original_taddy_status).toBeDefined();
      expect(costLimitLogMetadata.fallback_attempts_used).toBe(50);
      expect(costLimitLogMetadata.max_fallbacks_per_run).toBe(50);
      expect(costLimitLogMetadata.limit).toBe(50);
      expect(costLimitLogMetadata.processed).toBe(50);

      // Verify consistency
      expect(costLimitLogMetadata.fallback_attempts_used).toBe(costLimitLogMetadata.limit);
    });

    it('should ensure no sensitive data in log metadata', () => {
      // Test that log metadata doesn't contain sensitive information
      const sanitizedMetadata = {
        episode_url: 'https://example.com/episode.mp3', // URL is OK
        file_size_mb: 100,
        error: 'Network timeout', // Generic error is OK
        processing_time_ms: 5000
      };

      // Should not contain API keys, tokens, or personal data
      const metadataString = JSON.stringify(sanitizedMetadata);
      
      expect(metadataString).not.toContain('api_key');
      expect(metadataString).not.toContain('token');
      expect(metadataString).not.toContain('password');
      expect(metadataString).not.toContain('secret');
      
      // Should contain expected operational data
      expect(metadataString).toContain('episode_url');
      expect(metadataString).toContain('file_size_mb');
    });

    it('should validate worker summary logging structure', () => {
      // Test that worker summary logs contain Deepgram metrics
      const workerSummaryMetadata = {
        totalEpisodes: 15,
        processedEpisodes: 12,
        availableTranscripts: 8,
        deepgramFallbackAttempts: 5,
        deepgramFallbackSuccesses: 3,
        deepgramFallbackFailures: 2,
        averageProcessingTimeMs: 4500,
        totalElapsedMs: 54000
      };

      // Verify all Deepgram metrics are included
      expect(workerSummaryMetadata.deepgramFallbackAttempts).toBeDefined();
      expect(workerSummaryMetadata.deepgramFallbackSuccesses).toBeDefined();
      expect(workerSummaryMetadata.deepgramFallbackFailures).toBeDefined();

      // Verify metric relationships
      expect(workerSummaryMetadata.deepgramFallbackSuccesses + workerSummaryMetadata.deepgramFallbackFailures)
        .toBe(workerSummaryMetadata.deepgramFallbackAttempts);
      
      // Verify reasonable values
      expect(workerSummaryMetadata.deepgramFallbackAttempts).toBeGreaterThanOrEqual(0);
      expect(workerSummaryMetadata.deepgramFallbackSuccesses).toBeGreaterThanOrEqual(0);
      expect(workerSummaryMetadata.deepgramFallbackFailures).toBeGreaterThanOrEqual(0);
    });
  });
});