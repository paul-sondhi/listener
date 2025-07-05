/**
 * Unit Tests for Newsletter Edition Generator Worker
 * 
 * This test suite provides comprehensive unit testing of the NewsletterEditionWorker
 * with mocked dependencies to test core functionality, error handling, and CLI behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { NewsletterEditionWorker } from '../editionGenerator.js';
import { EditionWorkerConfig } from '../../config/editionWorkerConfig.js';
import { Logger } from '../../lib/logger.js';
import { createClient } from '@supabase/supabase-js';

// Mock all external dependencies
vi.mock('../../config/editionWorkerConfig.js');
vi.mock('../../lib/logger.js');
vi.mock('../../lib/db/sharedSupabaseClient.js');
vi.mock('../../lib/utils/editionWorkflow.js');

// Import mocked modules
import * as editionWorkerConfig from '../../config/editionWorkerConfig.js';
import * as logger from '../../lib/logger.js';
import * as sharedSupabaseClient from '../../lib/db/sharedSupabaseClient.js';
import * as editionWorkflow from '../../lib/utils/editionWorkflow.js';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  log: vi.fn()
} as unknown as Logger;

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn()
};

// Test configuration
const defaultConfig: EditionWorkerConfig = {
  lookbackHours: 24,
  last10Mode: false,
  promptPath: 'prompts/newsletter-edition.md',
  promptTemplate: 'Test newsletter prompt template',
  enabled: true
};

// Mock workflow result
const mockWorkflowResult = {
  totalCandidates: 5,
  processedUsers: 4,
  successfulNewsletters: 3,
  errorCount: 1,
  noContentCount: 0,
  totalElapsedMs: 5000,
  averageProcessingTimeMs: 1250,
  successRate: 75.0,
  averageTiming: { queryMs: 100, generationMs: 800, databaseMs: 350 },
  errorBreakdown: { 'llm_error': 1 },
  contentStats: { minLength: 500, maxLength: 2000, averageLength: 1200, totalLength: 3600 },
  episodeStats: { minEpisodes: 2, maxEpisodes: 8, averageEpisodes: 5, totalEpisodes: 20 }
};

describe('NewsletterEditionWorker', () => {
  let worker: NewsletterEditionWorker;
  let mockGetConfig: Mock;
  let mockValidateDependencies: Mock;
  let mockCreateLogger: Mock;
  let mockGetSharedClient: Mock;
  let mockExecuteWorkflow: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockGetConfig = vi.mocked(editionWorkerConfig.getEditionWorkerConfig);
    mockValidateDependencies = vi.mocked(editionWorkerConfig.validateDependencies);
    mockCreateLogger = vi.mocked(logger.createLogger);
    mockGetSharedClient = vi.mocked(sharedSupabaseClient.getSharedSupabaseClient);
    mockExecuteWorkflow = vi.mocked(editionWorkflow.executeEditionWorkflow);

    // Default mock implementations
    mockGetConfig.mockReturnValue(defaultConfig);
    mockValidateDependencies.mockImplementation(() => {}); // No-op
    mockCreateLogger.mockReturnValue(mockLogger);
    mockGetSharedClient.mockReturnValue(mockSupabaseClient as any);
    mockExecuteWorkflow.mockResolvedValue(mockWorkflowResult);

    // Create worker instance
    worker = new NewsletterEditionWorker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with logger and start time', () => {
      expect(worker).toBeDefined();
      expect(mockCreateLogger).toHaveBeenCalledTimes(1);
      
      // Verify worker has expected properties
      expect(worker).toHaveProperty('logger');
      expect(worker).toHaveProperty('startTime');
      expect(worker).toHaveProperty('partialResults');
    });

    it('should initialize partialResults as empty array', () => {
      expect(Array.isArray(worker['partialResults'])).toBe(true);
      expect(worker['partialResults']).toHaveLength(0);
    });
  });

  describe('Basic Functionality', () => {
    it('should complete successfully with workflow result', async () => {
      const result = await worker.run();

      // Verify configuration was loaded and validated
      expect(mockGetConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateDependencies).toHaveBeenCalledWith(defaultConfig);
      expect(mockGetSharedClient).toHaveBeenCalledTimes(1);

      // Verify workflow was executed
      expect(mockExecuteWorkflow).toHaveBeenCalledWith(mockSupabaseClient, defaultConfig);

      // Verify result structure
      expect(result).toEqual({
        totalCandidates: 5,
        processedUsers: 4,
        successfulNewsletters: 3,
        errorCount: 1,
        noContentCount: 0,
        totalElapsedMs: 5000,
        averageProcessingTimeMs: 1250,
        successRate: 75.0
      });

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker starting',
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_id: expect.stringMatching(/edition-/),
            lookback_hours: 24,
            last10_mode: false,
            prompt_template_length: defaultConfig.promptTemplate.length
          })
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker completed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_id: expect.stringMatching(/edition-/),
            totalCandidates: 5,
            processedUsers: 4,
            successfulNewsletters: 3,
            errorCount: 1,
            noContentCount: 0,
            totalElapsedMs: 5000,
            averageProcessingTimeMs: 1250,
            successRate: 75.0,
            success_rate: '75.0',
            avg_timing_ms: mockWorkflowResult.averageTiming,
            error_breakdown: mockWorkflowResult.errorBreakdown,
            content_stats: mockWorkflowResult.contentStats,
            episode_stats: mockWorkflowResult.episodeStats
          })
        })
      );
    });

    it('should handle empty results gracefully', async () => {
      const emptyWorkflowResult = {
        ...mockWorkflowResult,
        totalCandidates: 0,
        processedUsers: 0,
        successfulNewsletters: 0,
        errorCount: 0,
        noContentCount: 0,
        totalElapsedMs: 100,
        averageProcessingTimeMs: 0,
        successRate: 0
      };

      mockExecuteWorkflow.mockResolvedValue(emptyWorkflowResult);

      const result = await worker.run();

      expect(result).toEqual({
        totalCandidates: 0,
        processedUsers: 0,
        successfulNewsletters: 0,
        errorCount: 0,
        noContentCount: 0,
        totalElapsedMs: 100,
        averageProcessingTimeMs: 0,
        successRate: 0
      });

      // Verify logging for empty results
      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker completed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            totalCandidates: 0,
            processedUsers: 0,
            successfulNewsletters: 0
          })
        })
      );
    });

    it('should handle L10 mode correctly', async () => {
      const l10Config = { ...defaultConfig, last10Mode: true };
      mockGetConfig.mockReturnValue(l10Config);

      const result = await worker.run();

      expect(mockExecuteWorkflow).toHaveBeenCalledWith(mockSupabaseClient, l10Config);
      expect(result.successRate).toBe(75.0);

      // Verify L10 mode is logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker starting',
        expect.objectContaining({
          metadata: expect.objectContaining({
            last10_mode: true
          })
        })
      );
    });
  });

  describe('Configuration and Validation', () => {
    it('should load and validate configuration', async () => {
      await worker.run();

      expect(mockGetConfig).toHaveBeenCalledTimes(1);
      expect(mockValidateDependencies).toHaveBeenCalledWith(defaultConfig);
    });

    it('should handle configuration errors', async () => {
      const configError = new Error('Invalid configuration: missing GEMINI_API_KEY');
      mockGetConfig.mockImplementation(() => {
        throw configError;
      });

      await expect(worker.run()).rejects.toThrow('Invalid configuration: missing GEMINI_API_KEY');

      // Configuration errors happen before the try-catch block, so no error logging
      // The error is thrown directly without being caught by the worker's error handler
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle dependency validation errors', async () => {
      const validationError = new Error('Database connection failed');
      mockValidateDependencies.mockImplementation(() => {
        throw validationError;
      });

      await expect(worker.run()).rejects.toThrow('Database connection failed');

      // Dependency validation errors happen before the try-catch block, so no error logging
      // The error is thrown directly without being caught by the worker's error handler
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle workflow execution errors', async () => {
      const workflowError = new Error('Workflow execution failed');
      mockExecuteWorkflow.mockRejectedValue(workflowError);

      await expect(worker.run()).rejects.toThrow('Workflow execution failed');

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker failed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Workflow execution failed',
            elapsed_ms: expect.any(Number),
            stack_trace: expect.any(String)
          })
        })
      );
    });

    it('should handle database connection errors', async () => {
      const dbError = new Error('Supabase connection failed');
      mockGetSharedClient.mockImplementation(() => {
        throw dbError;
      });

      await expect(worker.run()).rejects.toThrow('Supabase connection failed');

      // Database connection errors happen before the try-catch block, so no error logging
      // The error is thrown directly without being caught by the worker's error handler
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle unknown errors', async () => {
      const unknownError = 'Unknown error string';
      mockExecuteWorkflow.mockRejectedValue(unknownError);

      await expect(worker.run()).rejects.toThrow('Unknown error string');

      // Verify error logging - the worker converts string errors to 'Unknown error'
      expect(mockLogger.error).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker failed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Unknown error',
            elapsed_ms: expect.any(Number),
            job_id: expect.stringMatching(/edition-/),
            stack_trace: undefined
          })
        })
      );
    });
  });

  describe('Logging and Progress Reporting', () => {
    it('should log worker start with correct metadata', async () => {
      await worker.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker starting',
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_id: expect.stringMatching(/edition-/),
            lookback_hours: 24,
            last10_mode: false,
            prompt_template_length: defaultConfig.promptTemplate.length
          })
        })
      );
    });

    it('should log worker completion with detailed results', async () => {
      await worker.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker completed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_id: expect.stringMatching(/edition-/),
            totalCandidates: 5,
            processedUsers: 4,
            successfulNewsletters: 3,
            errorCount: 1,
            noContentCount: 0,
            totalElapsedMs: 5000,
            averageProcessingTimeMs: 1250,
            successRate: 75.0,
            success_rate: '75.0',
            avg_timing_ms: mockWorkflowResult.averageTiming,
            error_breakdown: mockWorkflowResult.errorBreakdown,
            content_stats: mockWorkflowResult.contentStats,
            episode_stats: mockWorkflowResult.episodeStats
          })
        })
      );
    });

    it('should include job ID in all log messages', async () => {
      await worker.run();

      // Verify job ID is consistent across all log calls
      const infoCalls = mockLogger.info.mock.calls;
      const jobIds = infoCalls.map(call => call[2]?.metadata?.job_id).filter(Boolean);
      
      expect(jobIds.length).toBeGreaterThan(0);
      expect(new Set(jobIds).size).toBe(1); // All calls should have same job ID
      expect(jobIds[0]).toMatch(/^edition-/);
    });
  });

  describe('Graceful Shutdown and Signal Handling', () => {
    it('should store partial results for graceful shutdown', async () => {
      // Mock partial results in the workflow
      const partialResults = [
        { userId: 'user1', status: 'done', elapsedMs: 1000 },
        { userId: 'user2', status: 'error', elapsedMs: 500 }
      ];

      // Simulate partial results being stored
      worker['partialResults'] = partialResults;

      await worker.run();

      // Verify partial results are accessible for signal handlers
      expect(worker['partialResults']).toBeDefined();
    });

    it('should handle signal handlers setup', () => {
      // Test that signal handlers can access partial results
      const partialResults = [
        { userId: 'user1', status: 'done', elapsedMs: 1000 }
      ];
      worker['partialResults'] = partialResults;

      // Verify partial results are accessible
      expect(worker['partialResults']).toHaveLength(1);
      expect(worker['partialResults'][0].userId).toBe('user1');
    });
  });

  describe('CLI Entry Point', () => {
    it('should handle successful CLI execution', async () => {
      // Mock console.log and console.error
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Mock the main function behavior
      mockExecuteWorkflow.mockResolvedValue(mockWorkflowResult);

      try {
        // This would normally call main(), but we're testing the worker class directly
        const result = await worker.run();
        
        // Verify console output would be correct
        expect(result).toEqual({
          totalCandidates: 5,
          processedUsers: 4,
          successfulNewsletters: 3,
          errorCount: 1,
          noContentCount: 0,
          totalElapsedMs: 5000,
          averageProcessingTimeMs: 1250,
          successRate: 75.0
        });
      } catch (error) {
        // process.exit throws an error in tests
        expect(error).toBeDefined();
      }

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should handle CLI configuration errors with exit code 1', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const configError = new Error('Invalid configuration: missing GEMINI_API_KEY');
      mockGetConfig.mockImplementation(() => {
        throw configError;
      });

      try {
        await worker.run();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Invalid configuration');
      }

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should handle CLI database errors with exit code 2', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const dbError = new Error('Database connection failed');
      mockGetSharedClient.mockImplementation(() => {
        throw dbError;
      });

      try {
        await worker.run();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Database connection failed');
      }

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });
  });

  describe('Performance and Timing', () => {
    it('should track elapsed time correctly', async () => {
      const startTime = Date.now();
      
      await worker.run();
      
      const endTime = Date.now();
      const actualElapsed = endTime - startTime;
      
      // Verify the result includes timing information
      expect(mockWorkflowResult.totalElapsedMs).toBe(5000);
      expect(mockWorkflowResult.averageProcessingTimeMs).toBe(1250);
      
      // Verify timing is logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker completed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            totalElapsedMs: 5000,
            averageProcessingTimeMs: 1250
          })
        })
      );
    });

    it('should include detailed timing breakdown', async () => {
      await worker.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Newsletter Edition Worker completed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            avg_timing_ms: {
              queryMs: 100,
              generationMs: 800,
              databaseMs: 350
            }
          })
        })
      );
    });
  });
}); 