/**
 * Tests for the Edition Worker Configuration
 * Validates environment variable parsing, prompt template loading, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEditionWorkerConfig, getConfigSummary, validateDependencies, EditionWorkerConfig } from '../editionWorkerConfig';

// Mock environment variables
const originalEnv = process.env;

describe('Edition Worker Configuration', () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    
    // Set required environment variables
    process.env.GEMINI_API_KEY = 'AIzaTestKey123456789';
    process.env.EDITION_WORKER_ENABLED = 'true';
    process.env.EDITION_LOOKBACK_HOURS = '24';
    process.env.EDITION_WORKER_L10 = 'false';
    process.env.EDITION_PROMPT_PATH = 'prompts/newsletter-edition.md';
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('getEditionWorkerConfig', () => {
    it('should load configuration with default values', () => {
      // Remove optional environment variables to test defaults
      delete process.env.EDITION_LOOKBACK_HOURS;
      delete process.env.EDITION_WORKER_L10;
      delete process.env.EDITION_PROMPT_PATH;

      const config = getEditionWorkerConfig();

      expect(config.enabled).toBe(true);
      expect(config.lookbackHours).toBe(24);
      expect(config.last10Mode).toBe(false);
      expect(config.last10Count).toBe(3);
      expect(config.promptPath).toBe('prompts/newsletter-edition.md');
      expect(config.geminiApiKey).toBe('AIzaTestKey123456789');
      expect(config.promptTemplate).toBeTruthy();
      expect(config.promptTemplate.length).toBeGreaterThan(50);
    });

    it('should parse custom environment variables', () => {
      process.env.EDITION_LOOKBACK_HOURS = '48';
      process.env.EDITION_WORKER_L10 = 'true';
      process.env.EDITION_WORKER_L10_COUNT = '5';
      process.env.EDITION_PROMPT_PATH = 'prompts/newsletter-edition.md';

      const config = getEditionWorkerConfig();

      expect(config.lookbackHours).toBe(48);
      expect(config.last10Mode).toBe(true);
      expect(config.last10Count).toBe(5);
      expect(config.promptPath).toBe('prompts/newsletter-edition.md');
    });

    it('should disable worker when EDITION_WORKER_ENABLED is false', () => {
      process.env.EDITION_WORKER_ENABLED = 'false';

      const config = getEditionWorkerConfig();

      expect(config.enabled).toBe(false);
    });

    it('should validate lookback hours range', () => {
      // Test minimum value
      process.env.EDITION_LOOKBACK_HOURS = '1';
      expect(() => getEditionWorkerConfig()).not.toThrow();

      // Test maximum value
      process.env.EDITION_LOOKBACK_HOURS = '168';
      expect(() => getEditionWorkerConfig()).not.toThrow();

      // Test invalid values
      process.env.EDITION_LOOKBACK_HOURS = '0';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_LOOKBACK_HOURS');

      process.env.EDITION_LOOKBACK_HOURS = '169';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_LOOKBACK_HOURS');

      process.env.EDITION_LOOKBACK_HOURS = 'invalid';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_LOOKBACK_HOURS');
    });

    it('should validate last10Count range', () => {
      // Reset to default values
      process.env.EDITION_LOOKBACK_HOURS = '24';
      
      // Test minimum value
      process.env.EDITION_WORKER_L10_COUNT = '1';
      expect(() => getEditionWorkerConfig()).not.toThrow();

      // Test maximum value
      process.env.EDITION_WORKER_L10_COUNT = '10';
      expect(() => getEditionWorkerConfig()).not.toThrow();

      // Test default value
      delete process.env.EDITION_WORKER_L10_COUNT;
      const config = getEditionWorkerConfig();
      expect(config.last10Count).toBe(3);

      // Test invalid values
      process.env.EDITION_WORKER_L10_COUNT = '0';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_WORKER_L10_COUNT');

      process.env.EDITION_WORKER_L10_COUNT = '11';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_WORKER_L10_COUNT');

      process.env.EDITION_WORKER_L10_COUNT = 'invalid';
      expect(() => getEditionWorkerConfig()).toThrow('Invalid EDITION_WORKER_L10_COUNT');
    });

    it('should require GEMINI_API_KEY', () => {
      delete process.env.GEMINI_API_KEY;

      expect(() => getEditionWorkerConfig()).toThrow('GEMINI_API_KEY environment variable is required');
    });

    it('should validate GEMINI_API_KEY format', () => {
      process.env.GEMINI_API_KEY = 'InvalidKey';

      // Should not throw but should warn
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      getEditionWorkerConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: GEMINI_API_KEY does not start with "AIza" - this may not be a valid Google API key.'
      );

      consoleSpy.mockRestore();
    });

    it('should load and validate prompt template', () => {
      const config = getEditionWorkerConfig();

      expect(config.promptTemplate).toBeTruthy();
      expect(config.promptTemplate.length).toBeGreaterThan(50);
      expect(config.promptTemplate).toContain('newsletter');
      expect(config.promptTemplate).toContain('episode notes');
    });

    it('should handle missing prompt template file', () => {
      process.env.EDITION_PROMPT_PATH = 'non-existent-file.md';

      expect(() => getEditionWorkerConfig()).toThrow('Failed to load prompt template');
    });


  });

  describe('getConfigSummary', () => {
    it('should return configuration summary without sensitive data', () => {
      const config: EditionWorkerConfig = {
        enabled: true,
        lookbackHours: 24,
        last10Mode: false,
        promptPath: 'prompts/newsletter-edition.md',
        promptTemplate: 'Test prompt template content',
        geminiApiKey: 'AIzaTestKey123456789',
      };

      const summary = getConfigSummary(config);

      expect(summary.enabled).toBe(true);
      expect(summary.lookback_hours).toBe(24);
      expect(summary.last10_mode).toBe(false);
      expect(summary.prompt_path).toBe('prompts/newsletter-edition.md');
      expect(summary.prompt_template_length).toBe(28);
      expect(summary.gemini_api_key_configured).toBe(true);
      expect(summary.gemini_api_key_prefix).toBe('AIzaTe...');
      
      // Should not include the full API key
      expect(summary).not.toHaveProperty('geminiApiKey');
    });
  });

  describe('validateDependencies', () => {
    it('should validate prompt template structure', () => {
      const config: EditionWorkerConfig = {
        enabled: true,
        lookbackHours: 24,
        last10Mode: false,
        promptPath: 'prompts/newsletter-edition.md',
        promptTemplate: 'This is a test prompt with episode notes and newsletter content for the user',
        geminiApiKey: 'AIzaTestKey123456789',
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateDependencies(config);

      // Should not warn about missing sections
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should warn about missing required sections', () => {
      const config: EditionWorkerConfig = {
        enabled: true,
        lookbackHours: 24,
        last10Mode: false,
        promptPath: 'prompts/newsletter-edition.md',
        promptTemplate: 'This is a test prompt without required sections',
        geminiApiKey: 'AIzaTestKey123456789',
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      validateDependencies(config);

      // Should warn about missing sections
      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Prompt template may be missing expected sections: episode notes, newsletter, user'
      );

      consoleSpy.mockRestore();
    });


  });
}); 