/**
 * Tests for the Send Newsletter Worker Configuration
 * Validates environment variable parsing, email validation, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSendNewsletterWorkerConfig, getConfigSummary, validateDependencies, SendNewsletterWorkerConfig } from '../sendNewsletterWorkerConfig';

// Mock environment variables
const originalEnv = process.env;

describe('Send Newsletter Worker Configuration', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    
    // Set required environment variables
    process.env.RESEND_API_KEY = 're_test_key_123456789';
    process.env.SEND_FROM_EMAIL = 'test@example.com';
    process.env.TEST_RECEIVER_EMAIL = 'paulsondhi1@gmail.com';
    process.env.SEND_WORKER_ENABLED = 'true';
    process.env.SEND_WORKER_CRON = '0 5 * * 1-5';
    process.env.SEND_LOOKBACK = '24';
    process.env.SEND_WORKER_L10 = 'false';
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('getSendNewsletterWorkerConfig', () => {
    it('should load configuration with default values', () => {
      // Remove optional environment variables to test defaults
      delete process.env.SEND_WORKER_CRON;
      delete process.env.SEND_LOOKBACK;
      delete process.env.SEND_WORKER_L10;

      const config = getSendNewsletterWorkerConfig();

      expect(config.enabled).toBe(true);
      expect(config.cronSchedule).toBe('0 5 * * 1-5');
      expect(config.lookbackHours).toBe(24);
      expect(config.last10Mode).toBe(false);
      expect(config.resendApiKey).toBe('re_test_key_123456789');
      expect(config.sendFromEmail).toBe('test@example.com');
      expect(config.testReceiverEmail).toBe('paulsondhi1@gmail.com');
    });

    it('should parse custom environment variables', () => {
      process.env.SEND_WORKER_CRON = '0 6 * * 1-5';
      process.env.SEND_LOOKBACK = '48';
      process.env.SEND_WORKER_L10 = 'true';

      const config = getSendNewsletterWorkerConfig();

      expect(config.cronSchedule).toBe('0 6 * * 1-5');
      expect(config.lookbackHours).toBe(48);
      expect(config.last10Mode).toBe(true);
    });

    it('should disable worker when SEND_WORKER_ENABLED is false', () => {
      process.env.SEND_WORKER_ENABLED = 'false';

      const config = getSendNewsletterWorkerConfig();

      expect(config.enabled).toBe(false);
    });

    it('should validate lookback hours range', () => {
      // Test minimum value
      process.env.SEND_LOOKBACK = '1';
      expect(() => getSendNewsletterWorkerConfig()).not.toThrow();

      // Test maximum value
      process.env.SEND_LOOKBACK = '168';
      expect(() => getSendNewsletterWorkerConfig()).not.toThrow();

      // Test invalid values
      process.env.SEND_LOOKBACK = '0';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_LOOKBACK');

      process.env.SEND_LOOKBACK = '169';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_LOOKBACK');

      process.env.SEND_LOOKBACK = 'invalid';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_LOOKBACK');
    });

    it('should validate cron schedule format', () => {
      // Test valid cron expressions
      process.env.SEND_WORKER_CRON = '0 5 * * 1-5';
      expect(() => getSendNewsletterWorkerConfig()).not.toThrow();

      process.env.SEND_WORKER_CRON = '30 2 * * *';
      expect(() => getSendNewsletterWorkerConfig()).not.toThrow();

      // Test invalid cron expressions
      process.env.SEND_WORKER_CRON = 'invalid';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_WORKER_CRON');

      process.env.SEND_WORKER_CRON = '0 5 * *';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_WORKER_CRON');

      process.env.SEND_WORKER_CRON = '0 5 * * 1-5 extra';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_WORKER_CRON');
    });

    it('should require RESEND_API_KEY', () => {
      delete process.env.RESEND_API_KEY;

      expect(() => getSendNewsletterWorkerConfig()).toThrow('RESEND_API_KEY environment variable is required');
    });

    it('should validate RESEND_API_KEY format', () => {
      process.env.RESEND_API_KEY = 'invalid_key';

      // Should not throw but should warn
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      getSendNewsletterWorkerConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: RESEND_API_KEY does not start with "re_" - this may not be a valid Resend API key.'
      );

      consoleSpy.mockRestore();
    });

    it('should require SEND_FROM_EMAIL', () => {
      delete process.env.SEND_FROM_EMAIL;

      expect(() => getSendNewsletterWorkerConfig()).toThrow('SEND_FROM_EMAIL environment variable is required');
    });

    it('should validate SEND_FROM_EMAIL format', () => {
      process.env.SEND_FROM_EMAIL = 'invalid-email';

      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_FROM_EMAIL');

      process.env.SEND_FROM_EMAIL = 'test@';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_FROM_EMAIL');

      process.env.SEND_FROM_EMAIL = '@example.com';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid SEND_FROM_EMAIL');
    });

    it('should require TEST_RECEIVER_EMAIL', () => {
      delete process.env.TEST_RECEIVER_EMAIL;

      expect(() => getSendNewsletterWorkerConfig()).toThrow('TEST_RECEIVER_EMAIL environment variable is required');
    });

    it('should validate TEST_RECEIVER_EMAIL format', () => {
      process.env.TEST_RECEIVER_EMAIL = 'invalid-email';

      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid TEST_RECEIVER_EMAIL');

      process.env.TEST_RECEIVER_EMAIL = 'test@';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid TEST_RECEIVER_EMAIL');

      process.env.TEST_RECEIVER_EMAIL = '@example.com';
      expect(() => getSendNewsletterWorkerConfig()).toThrow('Invalid TEST_RECEIVER_EMAIL');
    });

    it('should accept valid email addresses', () => {
      process.env.SEND_FROM_EMAIL = 'test@example.com';
      process.env.TEST_RECEIVER_EMAIL = 'paulsondhi1@gmail.com';

      expect(() => getSendNewsletterWorkerConfig()).not.toThrow();

      const config = getSendNewsletterWorkerConfig();
      expect(config.sendFromEmail).toBe('test@example.com');
      expect(config.testReceiverEmail).toBe('paulsondhi1@gmail.com');
    });

    it('should trim whitespace from email addresses', () => {
      process.env.SEND_FROM_EMAIL = '  test@example.com  ';
      process.env.TEST_RECEIVER_EMAIL = '  paulsondhi1@gmail.com  ';

      const config = getSendNewsletterWorkerConfig();

      expect(config.sendFromEmail).toBe('test@example.com');
      expect(config.testReceiverEmail).toBe('paulsondhi1@gmail.com');
    });
  });

  describe('getConfigSummary', () => {
    it('should return configuration summary without sensitive data', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      const summary = getConfigSummary(config);

      expect(summary.enabled).toBe(true);
      expect(summary.cron_schedule).toBe('0 5 * * 1-5');
      expect(summary.lookback_hours).toBe(24);
      expect(summary.last10_mode).toBe(false);
      expect(summary.send_from_email).toBe('test@example.com');
      expect(summary.test_receiver_email).toBe('paulsondhi1@gmail.com');
      expect(summary.resend_api_key_configured).toBe(true);
      expect(summary.resend_api_key_prefix).toBe('re_tes...');
      
      // Should not include the full API key
      expect(summary).not.toHaveProperty('resendApiKey');
    });
  });

  describe('validateDependencies', () => {
    it('should validate complete configuration', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      expect(() => validateDependencies(config)).not.toThrow();
    });

    it('should throw error for missing RESEND_API_KEY', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: '',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      expect(() => validateDependencies(config)).toThrow('RESEND_API_KEY is required');
    });

    it('should throw error for missing SEND_FROM_EMAIL', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: '',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      expect(() => validateDependencies(config)).toThrow('SEND_FROM_EMAIL is required');
    });

    it('should throw error for missing TEST_RECEIVER_EMAIL', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: '',
      };

      expect(() => validateDependencies(config)).toThrow('TEST_RECEIVER_EMAIL is required');
    });

    it('should throw error for invalid SEND_FROM_EMAIL format', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'invalid-email',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      expect(() => validateDependencies(config)).toThrow('SEND_FROM_EMAIL is not a valid email address');
    });

    it('should throw error for invalid TEST_RECEIVER_EMAIL format', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: '0 5 * * 1-5',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: 'invalid-email',
      };

      expect(() => validateDependencies(config)).toThrow('TEST_RECEIVER_EMAIL is not a valid email address');
    });

    it('should throw error for invalid cron schedule', () => {
      const config: SendNewsletterWorkerConfig = {
        enabled: true,
        cronSchedule: 'invalid',
        lookbackHours: 24,
        last10Mode: false,
        resendApiKey: 're_test_key_123456789',
        sendFromEmail: 'test@example.com',
        testReceiverEmail: 'paulsondhi1@gmail.com',
      };

      expect(() => validateDependencies(config)).toThrow('Invalid cron schedule');
    });
  });
}); 