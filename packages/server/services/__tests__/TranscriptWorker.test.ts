/**
 * Unit Tests for TranscriptWorker Service
 * 
 * This test suite provides basic unit testing of the TranscriptWorker service
 * with mocked dependencies to test core functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { TranscriptWorker } from '../TranscriptWorker.js';
import { TranscriptWorkerConfig } from '../../config/transcriptWorkerConfig.js';
import { Logger } from '../../lib/logger.js';
import * as transcriptDb from '../../lib/db/transcripts.js';
import { TranscriptService } from '../../lib/services/TranscriptService.js';
import { createClient } from '@supabase/supabase-js';

// Mock all external dependencies
vi.mock('../../lib/db/transcripts.js');
vi.mock('../../lib/services/TranscriptService.js');
vi.mock('@supabase/supabase-js');

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

// Mock Supabase client with storage
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn(),
  storage: {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null })
    })
  }
};

// Test configuration
const defaultConfig: TranscriptWorkerConfig = {
  lookbackHours: 24,
  maxRequests: 15,
  concurrency: 10,
  enabled: true,
  cronSchedule: '0 1 * * *',
  useAdvisoryLock: true
};

describe('TranscriptWorker', () => {
  let worker: TranscriptWorker;
  let mockTranscriptDb: any;
  let mockTranscriptService: any;
  let mockCreateClient: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockTranscriptDb = transcriptDb as any;
    mockTranscriptService = TranscriptService as any;
    mockCreateClient = createClient as Mock;

    // Setup default mock returns
    mockCreateClient.mockReturnValue(mockSupabaseClient);
    
    // Mock database queries - need to handle both podcast_episodes and transcripts queries
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'podcast_episodes') {
        // First query: complex chain for podcast_episodes
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: [], error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        };
      } else if (table === 'transcripts') {
        // Second query: simpler chain for transcripts
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          })
        };
      }
      // Default fallback
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null })
      };
    });

    // Setup advisory lock mock
    mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

    // Mock TranscriptService constructor
    mockTranscriptService.mockImplementation(() => ({
      getTranscript: vi.fn().mockResolvedValue({
        kind: 'not_found',
        message: 'No transcript found'
      })
    }));

    // Mock database functions
    mockTranscriptDb.insertTranscript = vi.fn().mockResolvedValue({});

    // Create worker instance
    worker = new TranscriptWorker(defaultConfig, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with provided config and logger', () => {
      const customConfig = { ...defaultConfig, maxRequests: 25 };
      const customWorker = new TranscriptWorker(customConfig, mockLogger);

      expect(customWorker).toBeDefined();
    });

    it('should create Supabase client with correct configuration', () => {
      expect(mockCreateClient).toHaveBeenCalledWith(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    });

    it('should throw error if required environment variables are missing', () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => new TranscriptWorker(defaultConfig, mockLogger)).toThrow(
        'Missing required Supabase environment variables'
      );

      // Restore environment variables
      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });
  });

  describe('Basic Functionality', () => {
    it('should complete successfully when no episodes need transcripts', async () => {
      const result = await worker.run();

      expect(result.totalEpisodes).toBe(0);
      expect(result.processedEpisodes).toBe(0);
      expect(result.fullTranscripts).toBe(0);
      expect(result.partialTranscripts).toBe(0);
      expect(result.errorCount).toBe(0);
    });

    it('should handle advisory lock when enabled', async () => {
      const configWithLock = { ...defaultConfig, useAdvisoryLock: true };
      const workerWithLock = new TranscriptWorker(configWithLock, mockLogger);

      mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

      await workerWithLock.run();

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('pg_try_advisory_lock', {
        key: 'transcript_worker'
      });
    });

    it('should skip advisory lock when disabled', async () => {
      const configWithoutLock = { ...defaultConfig, useAdvisoryLock: false };
      const workerWithoutLock = new TranscriptWorker(configWithoutLock, mockLogger);

      await workerWithoutLock.run();

      expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith('pg_try_advisory_lock', expect.anything());
    });

    it('should handle advisory lock acquisition failure gracefully', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: false, error: null });

      const result = await worker.run();

      expect(result.totalEpisodes).toBe(0);
      expect(result.processedEpisodes).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'system',
        expect.stringContaining('Failed to acquire advisory lock'),
        expect.any(Object)
      );
    });
  });

  describe('Configuration', () => {
    it('should use provided configuration', () => {
      const customConfig = {
        lookbackHours: 48,
        maxRequests: 25,
        concurrency: 5
      };

      const customWorker = new TranscriptWorker(customConfig, mockLogger);
      expect(customWorker).toBeDefined();
    });

    it('should use default configuration when none provided', () => {
      const defaultWorker = new TranscriptWorker(undefined, mockLogger);
      expect(defaultWorker).toBeDefined();
    });
  });

  describe('Logging', () => {
    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'TranscriptWorker initialized',
        expect.objectContaining({
          metadata: expect.objectContaining({
            lookbackHours: defaultConfig.lookbackHours,
            maxRequests: defaultConfig.maxRequests,
            concurrency: defaultConfig.concurrency
          })
        })
      );
    });

    it('should log run start', async () => {
      await worker.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'system',
        'Starting transcript worker run',
        expect.objectContaining({
          metadata: expect.objectContaining({
            job_id: expect.stringMatching(/transcript-worker-/)
          })
        })
      );
    });
  });
}); 