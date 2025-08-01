/**
 * Unit Tests for Transcript Worker Configuration
 * 
 * This test suite provides comprehensive testing of the transcript worker
 * configuration parsing and validation logic.
 * 
 * Test Coverage:
 * - Environment variable parsing with defaults
 * - Validation logic for all configuration parameters
 * - Error handling for invalid values
 * - Cross-validation rules (concurrency ≤ maxRequests)
 * - Cron expression validation
 * - Configuration summary generation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTranscriptWorkerConfig, getConfigSummary } from '../transcriptWorkerConfig.js';

// Store original environment variables for restoration
let originalEnv: Record<string, string | undefined>;

describe('Transcript Worker Configuration', () => {
  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clear transcript worker environment variables for clean testing
    delete process.env.TRANSCRIPT_LOOKBACK;
    delete process.env.TRANSCRIPT_MAX_REQUESTS;
    delete process.env.TRANSCRIPT_CONCURRENCY;
    delete process.env.TRANSCRIPT_WORKER_ENABLED;
    delete process.env.TRANSCRIPT_WORKER_CRON;
    delete process.env.TRANSCRIPT_ADVISORY_LOCK;
    delete process.env.TRANSCRIPT_TIER;
    delete process.env.TRANSCRIPT_WORKER_L10D;
    delete process.env.DEEPGRAM_FALLBACK_ENABLED;
    delete process.env.DEEPGRAM_FALLBACK_STATUSES;
    delete process.env.DEEPGRAM_FALLBACK_MAX_PER_RUN;
    delete process.env.DEEPGRAM_MAX_FILE_SIZE_MB;
    delete process.env.DISABLE_DEEPGRAM_FALLBACK;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    it('should return default values when no environment variables are set', () => {
      const config = getTranscriptWorkerConfig();

      expect(config).toEqual({
        lookbackHours: 24,
        maxRequests: 15,
        concurrency: 10,
        enabled: true,
        cronSchedule: '0 1 * * *',
        tier: 'business',
        useAdvisoryLock: true,
        last10Mode: false,
        last10Count: 10,
        enableDeepgramFallback: true,
        deepgramFallbackStatuses: ['no_match', 'no_transcript_found', 'error', 'processing'],
        maxDeepgramFallbacksPerRun: 50,
        maxDeepgramFileSizeMB: 500
      });
    });

    it('should handle all environment variables being undefined', () => {
      // Explicitly set to undefined to test edge case
      process.env.TRANSCRIPT_LOOKBACK = undefined;
      process.env.TRANSCRIPT_MAX_REQUESTS = undefined;
      process.env.TRANSCRIPT_CONCURRENCY = undefined;
      process.env.TRANSCRIPT_WORKER_ENABLED = undefined;
      process.env.TRANSCRIPT_WORKER_CRON = undefined;
      process.env.TRANSCRIPT_ADVISORY_LOCK = undefined;

      const config = getTranscriptWorkerConfig();

      expect(config.lookbackHours).toBe(24);
      expect(config.maxRequests).toBe(15);
      expect(config.concurrency).toBe(10);
      expect(config.enabled).toBe(true);
      expect(config.cronSchedule).toBe('0 1 * * *');
      expect(config.tier).toBe('business');
      expect(config.useAdvisoryLock).toBe(true);
      expect(config.last10Mode).toBe(false);
      expect(config.last10Count).toBe(10);
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse valid environment variables correctly', () => {
      process.env.TRANSCRIPT_LOOKBACK = '48';
      process.env.TRANSCRIPT_MAX_REQUESTS = '25';
      process.env.TRANSCRIPT_CONCURRENCY = '15';
      process.env.TRANSCRIPT_WORKER_ENABLED = 'true';
      process.env.TRANSCRIPT_WORKER_CRON = '30 2 * * *';
      process.env.TRANSCRIPT_TIER = 'free';
      process.env.TRANSCRIPT_ADVISORY_LOCK = 'false';

      const config = getTranscriptWorkerConfig();

      expect(config.lookbackHours).toBe(48);
      expect(config.maxRequests).toBe(25);
      expect(config.concurrency).toBe(15);
      expect(config.enabled).toBe(true);
      expect(config.cronSchedule).toBe('30 2 * * *');
      expect(config.tier).toBe('free');
      expect(config.useAdvisoryLock).toBe(false);
      expect(config.last10Mode).toBe(false);
    });

    it('should handle string "false" for enabled flag', () => {
      process.env.TRANSCRIPT_WORKER_ENABLED = 'false';
      
      const config = getTranscriptWorkerConfig();
      
      expect(config.enabled).toBe(false);
    });

    it('should handle string "false" for advisory lock flag', () => {
      process.env.TRANSCRIPT_ADVISORY_LOCK = 'false';
      
      const config = getTranscriptWorkerConfig();
      
      expect(config.useAdvisoryLock).toBe(false);
    });

    it('should handle boolean values correctly', () => {
      // Test enabled flag - only 'false' makes it false
      process.env.TRANSCRIPT_WORKER_ENABLED = 'false';
      let config = getTranscriptWorkerConfig();
      expect(config.enabled).toBe(false);

      // Any other value (including undefined) makes it true
      process.env.TRANSCRIPT_WORKER_ENABLED = 'true';
      config = getTranscriptWorkerConfig();
      expect(config.enabled).toBe(true);

      process.env.TRANSCRIPT_WORKER_ENABLED = 'anything';
      config = getTranscriptWorkerConfig();
      expect(config.enabled).toBe(true);

      // Test advisory lock flag - only 'false' makes it false
      process.env.TRANSCRIPT_ADVISORY_LOCK = 'false';
      config = getTranscriptWorkerConfig();
      expect(config.useAdvisoryLock).toBe(false);

      process.env.TRANSCRIPT_ADVISORY_LOCK = 'true';
      config = getTranscriptWorkerConfig();
      expect(config.useAdvisoryLock).toBe(true);
    });

    /**
     * New tests for TRANSCRIPT_WORKER_L10D semantics (strict boolean)
     */
    describe('last10Mode Flag (TRANSCRIPT_WORKER_L10D)', () => {
      it('should set last10Mode = true when env var is "true"', () => {
        process.env.TRANSCRIPT_WORKER_L10D = 'true';

        const config = getTranscriptWorkerConfig();

        expect(config.last10Mode).toBe(true);
      });

      it('should set last10Mode = false when env var is "false"', () => {
        process.env.TRANSCRIPT_WORKER_L10D = 'false';

        const config = getTranscriptWorkerConfig();

        expect(config.last10Mode).toBe(false);
      });

      it('should default last10Mode to false when env var is unset', () => {
        delete process.env.TRANSCRIPT_WORKER_L10D; // ensure unset

        const config = getTranscriptWorkerConfig();

        expect(config.last10Mode).toBe(false);
      });
    });

    /**
     * Tests for TRANSCRIPT_WORKER_L10_COUNT configuration
     */
    describe('last10Count Configuration (TRANSCRIPT_WORKER_L10_COUNT)', () => {
      it('should default last10Count to 10 when env var is unset', () => {
        delete process.env.TRANSCRIPT_WORKER_L10_COUNT; // ensure unset

        const config = getTranscriptWorkerConfig();

        expect(config.last10Count).toBe(10);
      });

      it('should parse valid last10Count values', () => {
        // Test minimum boundary
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '1';
        let config = getTranscriptWorkerConfig();
        expect(config.last10Count).toBe(1);

        // Test maximum boundary
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '100';
        config = getTranscriptWorkerConfig();
        expect(config.last10Count).toBe(100);

        // Test default value
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '10';
        config = getTranscriptWorkerConfig();
        expect(config.last10Count).toBe(10);
      });

      it('should reject last10Count below minimum', () => {
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '0';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_WORKER_L10_COUNT: "0". Must be a number between 1 and 100.'
        );
      });

      it('should reject last10Count above maximum', () => {
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '101';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_WORKER_L10_COUNT: "101". Must be a number between 1 and 100.'
        );
      });

      it('should reject non-numeric last10Count', () => {
        process.env.TRANSCRIPT_WORKER_L10_COUNT = 'invalid';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_WORKER_L10_COUNT: "invalid". Must be a number between 1 and 100.'
        );
      });

      it('should treat empty string last10Count as default (10)', () => {
        process.env.TRANSCRIPT_WORKER_L10_COUNT = '';
        const config = getTranscriptWorkerConfig();
        expect(config.last10Count).toBe(10);
      });
    });
  });

  describe('Validation Logic', () => {
    describe('Lookback Hours Validation', () => {
      it('should reject lookback hours below minimum', () => {
        process.env.TRANSCRIPT_LOOKBACK = '0';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_LOOKBACK: "0". Must be a number between 1 and 168 (hours).'
        );
      });

      it('should reject lookback hours above maximum', () => {
        process.env.TRANSCRIPT_LOOKBACK = '200';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_LOOKBACK: "200". Must be a number between 1 and 168 (hours).'
        );
      });

      it('should accept valid lookback hours at boundaries', () => {
        // Test minimum boundary
        process.env.TRANSCRIPT_LOOKBACK = '1';
        let config = getTranscriptWorkerConfig();
        expect(config.lookbackHours).toBe(1);

        // Test maximum boundary
        process.env.TRANSCRIPT_LOOKBACK = '168';
        config = getTranscriptWorkerConfig();
        expect(config.lookbackHours).toBe(168);
      });

      it('should reject non-numeric lookback hours', () => {
        process.env.TRANSCRIPT_LOOKBACK = 'invalid';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_LOOKBACK: "invalid". Must be a number between 1 and 168 (hours).'
        );
      });
    });

    describe('Max Requests Validation', () => {
      it('should reject max requests below minimum', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '0';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_MAX_REQUESTS: "0". Must be a number between 1 and 1000.'
        );
      });

      it('should reject max requests above maximum', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '1500';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_MAX_REQUESTS: "1500". Must be a number between 1 and 1000.'
        );
      });

      it('should accept valid max requests at boundaries', () => {
        // Test minimum boundary - need to set concurrency low too
        process.env.TRANSCRIPT_MAX_REQUESTS = '1';
        process.env.TRANSCRIPT_CONCURRENCY = '1';
        let config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(1);

        // Test maximum boundary - need to keep concurrency within limit
        process.env.TRANSCRIPT_MAX_REQUESTS = '1000';
        process.env.TRANSCRIPT_CONCURRENCY = '10';
        config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(1000);
      });

      it('should reject non-numeric max requests', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = 'many';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_MAX_REQUESTS: "many". Must be a number between 1 and 1000.'
        );
      });

      it('should accept values in the expanded range', () => {
        // Test values in the new expanded range
        const testValues = [500, 750, 999];
        
        for (const value of testValues) {
          process.env.TRANSCRIPT_MAX_REQUESTS = value.toString();
          process.env.TRANSCRIPT_CONCURRENCY = '10'; // Keep concurrency within limit
          
          const config = getTranscriptWorkerConfig();
          expect(config.maxRequests).toBe(value);
        }
      });
    });

    describe('Concurrency Validation', () => {
      it('should reject concurrency below minimum', () => {
        process.env.TRANSCRIPT_CONCURRENCY = '0';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_CONCURRENCY: "0". Must be a number between 1 and 50.'
        );
      });

      it('should reject concurrency above maximum', () => {
        process.env.TRANSCRIPT_CONCURRENCY = '75';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_CONCURRENCY: "75". Must be a number between 1 and 50.'
        );
      });

      it('should accept valid concurrency at boundaries', () => {
        // Test minimum boundary
        process.env.TRANSCRIPT_CONCURRENCY = '1';
        process.env.TRANSCRIPT_MAX_REQUESTS = '15'; // Reset to default
        let config = getTranscriptWorkerConfig();
        expect(config.concurrency).toBe(1);

        // Test maximum boundary - need high max requests
        process.env.TRANSCRIPT_CONCURRENCY = '50';
        process.env.TRANSCRIPT_MAX_REQUESTS = '50';
        config = getTranscriptWorkerConfig();
        expect(config.concurrency).toBe(50);
      });

      it('should reject non-numeric concurrency', () => {
        process.env.TRANSCRIPT_CONCURRENCY = 'parallel';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_CONCURRENCY: "parallel". Must be a number between 1 and 50.'
        );
      });
    });

    describe('Tier Validation', () => {
      it('should accept valid tier values', () => {
        // Test 'free' tier
        process.env.TRANSCRIPT_TIER = 'free';
        let config = getTranscriptWorkerConfig();
        expect(config.tier).toBe('free');

        // Test 'business' tier
        process.env.TRANSCRIPT_TIER = 'business';
        config = getTranscriptWorkerConfig();
        expect(config.tier).toBe('business');
      });

      it('should default to business tier when TRANSCRIPT_TIER is not set', () => {
        delete process.env.TRANSCRIPT_TIER;
        
        const config = getTranscriptWorkerConfig();
        expect(config.tier).toBe('business');
      });

      it('should default to business tier when TRANSCRIPT_TIER is empty string', () => {
        process.env.TRANSCRIPT_TIER = '';
        
        const config = getTranscriptWorkerConfig();
        expect(config.tier).toBe('business');
      });

      it('should reject invalid tier values', () => {
        const invalidTiers = [
          'premium',
          'enterprise',
          'basic',
          'standard',
          'pro',
          'FREE',
          'BUSINESS',
          'Free',
          'Business',
          'invalid',
          '123',
          'free business',
          'business-tier'
        ];

        for (const invalidTier of invalidTiers) {
          process.env.TRANSCRIPT_TIER = invalidTier;
          expect(() => getTranscriptWorkerConfig()).toThrow(
            `Invalid TRANSCRIPT_TIER: "${invalidTier}". Must be either 'free' or 'business'.`
          );
        }
      });

      it('should handle whitespace in tier values', () => {
        // Leading/trailing whitespace should be rejected
        const whitespaceValues = [
          ' free',
          'free ',
          ' free ',
          '\tfree',
          'free\n',
          ' business',
          'business ',
          ' business ',
          '\tbusiness',
          'business\n'
        ];

        for (const tierValue of whitespaceValues) {
          process.env.TRANSCRIPT_TIER = tierValue;
          expect(() => getTranscriptWorkerConfig()).toThrow(
            `Invalid TRANSCRIPT_TIER: "${tierValue}". Must be either 'free' or 'business'.`
          );
        }
      });

      it('should reject null and undefined explicitly set values', () => {
        // Test explicit undefined
        process.env.TRANSCRIPT_TIER = 'undefined';
        expect(() => getTranscriptWorkerConfig()).toThrow(
          `Invalid TRANSCRIPT_TIER: "undefined". Must be either 'free' or 'business'.`
        );

        // Test explicit null
        process.env.TRANSCRIPT_TIER = 'null';
        expect(() => getTranscriptWorkerConfig()).toThrow(
          `Invalid TRANSCRIPT_TIER: "null". Must be either 'free' or 'business'.`
        );
      });

      it('should handle case sensitivity strictly', () => {
        // Only lowercase 'free' and 'business' should be accepted
        const caseSensitiveValues = [
          'FREE',
          'BUSINESS',
          'Free',
          'Business',
          'fReE',
          'bUsInEsS',
          'frEE',
          'BUSINESS'
        ];

        for (const tierValue of caseSensitiveValues) {
          process.env.TRANSCRIPT_TIER = tierValue;
          expect(() => getTranscriptWorkerConfig()).toThrow(
            `Invalid TRANSCRIPT_TIER: "${tierValue}". Must be either 'free' or 'business'.`
          );
        }
      });
    });

    describe('Cross-Validation Rules', () => {
      it('should reject concurrency greater than max requests', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '10';
        process.env.TRANSCRIPT_CONCURRENCY = '15';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'TRANSCRIPT_CONCURRENCY (15) cannot exceed TRANSCRIPT_MAX_REQUESTS (10).'
        );
      });

      it('should accept concurrency equal to max requests', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '20';
        process.env.TRANSCRIPT_CONCURRENCY = '20';
        
        const config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(20);
        expect(config.concurrency).toBe(20);
      });

      it('should accept concurrency less than max requests', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '25';
        process.env.TRANSCRIPT_CONCURRENCY = '10';
        
        const config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(25);
        expect(config.concurrency).toBe(10);
      });
    });

    describe('Cron Expression Validation', () => {
      it('should accept valid cron expressions', () => {
        const validCronExpressions = [
          '0 1 * * *',     // 1:00 AM daily
          '30 2 * * 1',    // 2:30 AM on Mondays
          '0 0 1 * *',     // Midnight on the 1st of every month
          '*/15 * * * *',  // Every 15 minutes
          '0 9-17 * * 1-5' // 9 AM to 5 PM on weekdays
        ];

        for (const cronExpr of validCronExpressions) {
          process.env.TRANSCRIPT_WORKER_CRON = cronExpr;
          const config = getTranscriptWorkerConfig();
          expect(config.cronSchedule).toBe(cronExpr);
        }
      });

      it('should reject invalid cron expressions', () => {
        const invalidCronExpressions = [
          '0 1 * *',       // Missing field
          '0 1 * * * *'    // Too many fields
        ];

        for (const cronExpr of invalidCronExpressions) {
          process.env.TRANSCRIPT_WORKER_CRON = cronExpr;
          expect(() => getTranscriptWorkerConfig()).toThrow(
            `Invalid TRANSCRIPT_WORKER_CRON: "${cronExpr}". Must be a valid cron expression.`
          );
        }
      });

      it('should accept commonly used cron expressions', () => {
        const validCronExpressions = [
          '0 1 * * *',     // 1:00 AM daily
          '30 2 * * 1',    // 2:30 AM on Mondays
          '0 0 1 * *',     // Midnight on the 1st of every month
          '*/15 * * * *',  // Every 15 minutes
          '0 9-17 * * 1-5' // 9 AM to 5 PM on weekdays
        ];

        for (const cronExpr of validCronExpressions) {
          process.env.TRANSCRIPT_WORKER_CRON = cronExpr;
          const config = getTranscriptWorkerConfig();
          expect(config.cronSchedule).toBe(cronExpr);
        }
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty string environment variables', () => {
      process.env.TRANSCRIPT_LOOKBACK = '';
      process.env.TRANSCRIPT_MAX_REQUESTS = '';
      process.env.TRANSCRIPT_CONCURRENCY = '';
      process.env.TRANSCRIPT_WORKER_CRON = '';

      // Empty strings should fall back to defaults (including cron)
      const config = getTranscriptWorkerConfig();
      expect(config.lookbackHours).toBe(24);
      expect(config.maxRequests).toBe(15);
      expect(config.concurrency).toBe(10);
      expect(config.cronSchedule).toBe('0 1 * * *'); // Default cron
      expect(config.tier).toBe('business'); // Default tier
    });

    it('should handle whitespace-only environment variables', () => {
      process.env.TRANSCRIPT_LOOKBACK = '  ';
      process.env.TRANSCRIPT_MAX_REQUESTS = '\t';
      process.env.TRANSCRIPT_CONCURRENCY = '\n';

      expect(() => getTranscriptWorkerConfig()).toThrow(
        'Invalid TRANSCRIPT_LOOKBACK'
      );
    });

    it('should handle floating point numbers by truncating', () => {
      process.env.TRANSCRIPT_LOOKBACK = '24.5';
      process.env.TRANSCRIPT_MAX_REQUESTS = '15.9';
      process.env.TRANSCRIPT_CONCURRENCY = '10.1';

      const config = getTranscriptWorkerConfig();
      expect(config.lookbackHours).toBe(24);
      expect(config.maxRequests).toBe(15);
      expect(config.concurrency).toBe(10);
    });

    it('should handle negative numbers', () => {
      process.env.TRANSCRIPT_LOOKBACK = '-5';
      
      expect(() => getTranscriptWorkerConfig()).toThrow(
        'Invalid TRANSCRIPT_LOOKBACK: "-5". Must be a number between 1 and 168 (hours).'
      );
    });
  });

  describe('Integration with Real Environment', () => {
    it('should work with typical production configuration', () => {
      process.env.TRANSCRIPT_LOOKBACK = '24';
      process.env.TRANSCRIPT_MAX_REQUESTS = '15';
      process.env.TRANSCRIPT_CONCURRENCY = '10';
      process.env.TRANSCRIPT_WORKER_ENABLED = 'true';
      process.env.TRANSCRIPT_WORKER_CRON = '0 1 * * *';
      process.env.TRANSCRIPT_TIER = 'business';
      process.env.TRANSCRIPT_ADVISORY_LOCK = 'true';

      const config = getTranscriptWorkerConfig();

      expect(config).toEqual({
        lookbackHours: 24,
        maxRequests: 15,
        concurrency: 10,
        enabled: true,
        cronSchedule: '0 1 * * *',
        tier: 'business',
        useAdvisoryLock: true,
        last10Mode: false,
        last10Count: 10,
        enableDeepgramFallback: true,
        deepgramFallbackStatuses: ['no_match', 'no_transcript_found', 'error', 'processing'],
        maxDeepgramFallbacksPerRun: 50,
        maxDeepgramFileSizeMB: 500
      });
    });

    it('should work with typical development configuration', () => {
      process.env.TRANSCRIPT_LOOKBACK = '1';
      process.env.TRANSCRIPT_MAX_REQUESTS = '5';
      process.env.TRANSCRIPT_CONCURRENCY = '2';
      process.env.TRANSCRIPT_WORKER_ENABLED = 'false';
      process.env.TRANSCRIPT_WORKER_CRON = '*/5 * * * *';
      process.env.TRANSCRIPT_TIER = 'free';
      process.env.TRANSCRIPT_ADVISORY_LOCK = 'false';

      const config = getTranscriptWorkerConfig();

      expect(config).toEqual({
        lookbackHours: 1,
        maxRequests: 5,
        concurrency: 2,
        enabled: false,
        cronSchedule: '*/5 * * * *',
        tier: 'free',
        useAdvisoryLock: false,
        last10Mode: false,
        last10Count: 10,
        enableDeepgramFallback: true,
        deepgramFallbackStatuses: ['no_match', 'no_transcript_found', 'error', 'processing'],
        maxDeepgramFallbacksPerRun: 50,
        maxDeepgramFileSizeMB: 500
      });
    });
  });

  describe('Deepgram Fallback Configuration', () => {
    it('should parse DEEPGRAM_FALLBACK_ENABLED correctly', () => {
      process.env.DEEPGRAM_FALLBACK_ENABLED = 'false';
      const config = getTranscriptWorkerConfig();
      expect(config.enableDeepgramFallback).toBe(false);

      process.env.DEEPGRAM_FALLBACK_ENABLED = 'true';
      const config2 = getTranscriptWorkerConfig();
      expect(config2.enableDeepgramFallback).toBe(true);
    });

    it('should handle DISABLE_DEEPGRAM_FALLBACK flag', () => {
      process.env.DISABLE_DEEPGRAM_FALLBACK = 'true';
      const config = getTranscriptWorkerConfig();
      expect(config.enableDeepgramFallback).toBe(false);

      delete process.env.DISABLE_DEEPGRAM_FALLBACK;
      process.env.DEEPGRAM_FALLBACK_ENABLED = 'true';
      const config2 = getTranscriptWorkerConfig();
      expect(config2.enableDeepgramFallback).toBe(true);
    });

    it('should parse custom fallback statuses', () => {
      process.env.DEEPGRAM_FALLBACK_STATUSES = 'error,no_match';
      const config = getTranscriptWorkerConfig();
      expect(config.deepgramFallbackStatuses).toEqual(['error', 'no_match']);
    });

    it('should validate fallback statuses', () => {
      process.env.DEEPGRAM_FALLBACK_STATUSES = 'invalid_status';
      expect(() => getTranscriptWorkerConfig()).toThrow('Invalid DEEPGRAM_FALLBACK_STATUSES: "invalid_status"');
    });

    it('should parse max fallbacks per run', () => {
      process.env.DEEPGRAM_FALLBACK_MAX_PER_RUN = '25';
      const config = getTranscriptWorkerConfig();
      expect(config.maxDeepgramFallbacksPerRun).toBe(25);
    });

    it('should validate max fallbacks per run range', () => {
      process.env.DEEPGRAM_FALLBACK_MAX_PER_RUN = '1001';
      expect(() => getTranscriptWorkerConfig()).toThrow('Invalid DEEPGRAM_FALLBACK_MAX_PER_RUN');

      process.env.DEEPGRAM_FALLBACK_MAX_PER_RUN = '-1';
      expect(() => getTranscriptWorkerConfig()).toThrow('Invalid DEEPGRAM_FALLBACK_MAX_PER_RUN');
    });

    it('should parse max file size', () => {
      process.env.DEEPGRAM_MAX_FILE_SIZE_MB = '1000';
      const config = getTranscriptWorkerConfig();
      expect(config.maxDeepgramFileSizeMB).toBe(1000);
    });

    it('should validate max file size range', () => {
      process.env.DEEPGRAM_MAX_FILE_SIZE_MB = '3000';
      expect(() => getTranscriptWorkerConfig()).toThrow('Invalid DEEPGRAM_MAX_FILE_SIZE_MB');

      process.env.DEEPGRAM_MAX_FILE_SIZE_MB = '0';
      expect(() => getTranscriptWorkerConfig()).toThrow('Invalid DEEPGRAM_MAX_FILE_SIZE_MB');
    });

    it('should include Deepgram config in summary', () => {
      const config = getTranscriptWorkerConfig();
      const summary = getConfigSummary(config);
      
      expect(summary).toHaveProperty('deepgram_fallback_enabled');
      expect(summary).toHaveProperty('deepgram_fallback_statuses');
      expect(summary).toHaveProperty('deepgram_max_fallbacks_per_run');
      expect(summary).toHaveProperty('deepgram_max_file_size_mb');
    });
  });
}); 