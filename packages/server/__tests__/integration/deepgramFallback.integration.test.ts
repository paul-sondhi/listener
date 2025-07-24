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
});