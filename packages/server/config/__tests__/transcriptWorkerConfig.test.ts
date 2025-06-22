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
import { getTranscriptWorkerConfig } from '../transcriptWorkerConfig.js';

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
        useAdvisoryLock: true
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
          'Invalid TRANSCRIPT_MAX_REQUESTS: "0". Must be a number between 1 and 100.'
        );
      });

      it('should reject max requests above maximum', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = '150';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_MAX_REQUESTS: "150". Must be a number between 1 and 100.'
        );
      });

      it('should accept valid max requests at boundaries', () => {
        // Test minimum boundary - need to set concurrency low too
        process.env.TRANSCRIPT_MAX_REQUESTS = '1';
        process.env.TRANSCRIPT_CONCURRENCY = '1';
        let config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(1);

        // Test maximum boundary - need to keep concurrency within limit
        process.env.TRANSCRIPT_MAX_REQUESTS = '100';
        process.env.TRANSCRIPT_CONCURRENCY = '10';
        config = getTranscriptWorkerConfig();
        expect(config.maxRequests).toBe(100);
      });

      it('should reject non-numeric max requests', () => {
        process.env.TRANSCRIPT_MAX_REQUESTS = 'many';
        
        expect(() => getTranscriptWorkerConfig()).toThrow(
          'Invalid TRANSCRIPT_MAX_REQUESTS: "many". Must be a number between 1 and 100.'
        );
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
        useAdvisoryLock: true
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
        useAdvisoryLock: false
      });
    });
  });
}); 