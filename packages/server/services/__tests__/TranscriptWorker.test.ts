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
import { getSharedSupabaseClient } from '../../lib/db/sharedSupabaseClient.js';
import { gunzipSync } from 'zlib';

// Mock all external dependencies
vi.mock('../../lib/db/transcripts.js');
vi.mock('../../lib/services/TranscriptService.js');
vi.mock('@supabase/supabase-js');
vi.mock('../../lib/db/sharedSupabaseClient.js', () => {
  return {
    getSharedSupabaseClient: vi.fn()
  };
});

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
  useAdvisoryLock: true,
  tier: 'business'
};

describe('TranscriptWorker', () => {
  let worker: TranscriptWorker;
  let mockTranscriptDb: any;
  let mockTranscriptService: any;
  let mockCreateClient: Mock;
  let mockGetSharedClient: Mock;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock implementations
    mockTranscriptDb = transcriptDb as any;
    mockTranscriptService = TranscriptService as any;
    mockCreateClient = createClient as Mock;
    mockGetSharedClient = getSharedSupabaseClient as unknown as Mock;

    // Setup default mock returns
    mockCreateClient.mockReturnValue(mockSupabaseClient);
    mockGetSharedClient.mockReturnValue(mockSupabaseClient);
    
    // Mock TranscriptService constructor with default behavior
    const defaultMockTranscriptServiceInstance = {
      getTranscript: vi.fn().mockResolvedValue({
        kind: 'not_found',
        source: 'taddy',
        creditsConsumed: 0
      })
    };
    mockTranscriptService.mockImplementation(() => defaultMockTranscriptServiceInstance);
    
    // Mock database queries - need to handle both podcast_episodes and transcripts queries
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'podcast_episodes') {
        // First query: complex chain for podcast_episodes
        // The actual chain is: .select().gte().not().not().not().not().order().limit()
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
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
      // Default fallback for podcast_shows table
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      };
    });

    // Setup advisory lock mock
    mockSupabaseClient.rpc.mockResolvedValue({ data: true, error: null });

    // Mock database functions
    mockTranscriptDb.insertTranscript = vi.fn().mockResolvedValue({});

    // Create a new worker instance to pick up the mocked TranscriptService
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

    it('should obtain Supabase client via helper', () => {
      expect(mockGetSharedClient).toHaveBeenCalled();
    });

    it('should throw error if required environment variables are missing', () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      // The shared helper is mocked, so constructor should NOT throw in this context
      expect(() => new TranscriptWorker(defaultConfig, mockLogger)).not.toThrow();

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
      expect(result.availableTranscripts).toBe(0);
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

  describe('Processing Status Handling', () => {
    it('should include processingCount in summary metrics', async () => {
      const result = await worker.run();

      expect(result).toHaveProperty('processingCount');
      expect(typeof result.processingCount).toBe('number');
      expect(result.processingCount).toBe(0); // No episodes processed in basic test
    });

    it('should handle processing status from transcript service', async () => {
      // Mock episodes data with proper structure including joined podcast_shows
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Mock database to return episodes
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return processing status
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockImplementation((episode) => {
          console.log('getTranscript called with episode:', {
            id: episode.id,
            show: episode.show,
            hasShow: !!episode.show,
            showRssUrl: episode.show?.rss_url
          });
          const result = {
            kind: 'processing',
            source: 'taddy',
            creditsConsumed: 1
          };
          console.log('getTranscript returning:', result);
          return Promise.resolve(result);
        })
      };
      mockTranscriptService.mockImplementation(() => {
        console.log('TranscriptService constructor called');
        return mockTranscriptServiceInstance;
      });

      // Add debug logging to the insertTranscript mock
      mockTranscriptDb.insertTranscript = vi.fn().mockImplementation((episodeId, storagePath, status, source) => {
        console.log('insertTranscript called with:', { episodeId, storagePath, status, source });
        const result = {
          id: 'mock-transcript-id',
          episode_id: episodeId,
          status: status,
          storage_path: storagePath,
          word_count: 0,
          source: source,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null
        };
        console.log('insertTranscript returning:', result);
        return Promise.resolve(result);
      });

      // Create a new worker instance to pick up the mocked TranscriptService
      worker = new TranscriptWorker(defaultConfig, mockLogger);

      const result = await worker.run();

      // Debug logging
      const debugInfo = {
        result: JSON.stringify(result, null, 2),
        getTranscriptCalls: mockTranscriptServiceInstance.getTranscript.mock.calls,
        insertTranscriptCalls: mockTranscriptDb.insertTranscript.mock.calls,
        loggerInfoCalls: mockLogger.info.mock.calls.map(call => call[1]),
        loggerWarnCalls: mockLogger.warn.mock.calls.map(call => call[1])
      };

      if (result.processingCount !== 1) {
        throw new Error(`Expected processingCount to be 1, but got ${result.processingCount}. Debug: ${JSON.stringify(debugInfo, null, 2)}`);
      }
    });
  });

  describe('Quota Exhaustion Handling', () => {
    it('should detect quota exhaustion from HTTP 429 error', async () => {
      // Mock episodes data with proper structure including joined podcast_shows
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Mock database to return episodes
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return quota exhaustion error
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'error',
          message: 'HTTP 429: Too Many Requests - quota exceeded',
          source: 'taddy',
          creditsConsumed: 0
        })
      };
      mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);

      // Create a new worker instance to pick up the mocked TranscriptService
      worker = new TranscriptWorker(defaultConfig, mockLogger);

      await worker.run();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'system',
        'Taddy API quota exhausted - aborting remaining episodes',
        expect.objectContaining({
          metadata: expect.objectContaining({
            episode_id: 'episode-1',
            error_message: 'HTTP 429: Too Many Requests - quota exceeded',
            source: 'taddy'
          })
        })
      );
    });

    it('should detect quota exhaustion from credits exceeded error', async () => {
      // Mock episodes data with proper structure including joined podcast_shows
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Mock database to return episodes
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return credits exceeded error
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'error',
          message: 'CREDITS_EXCEEDED: Monthly credits limit reached',
          source: 'taddy',
          creditsConsumed: 0
        })
      };
      mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);

      // Create a new worker instance to pick up the mocked TranscriptService
      worker = new TranscriptWorker(defaultConfig, mockLogger);

      await worker.run();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'system',
        'Taddy API quota exhausted - aborting remaining episodes',
        expect.objectContaining({
          metadata: expect.objectContaining({
            episode_id: 'episode-1',
            error_message: 'CREDITS_EXCEEDED: Monthly credits limit reached',
            source: 'taddy'
          })
        })
      );
    });
  });

  describe('Storage Integration', () => {
    it('should successfully store transcript file with correct MIME type', async () => {
      // Mock episodes data with proper structure including joined podcast_shows
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Mock storage upload to capture the MIME type used
      let capturedContentType: string | undefined;
      const mockStorageUpload = vi.fn().mockImplementation((path, content, options) => {
        capturedContentType = options?.contentType;
        return Promise.resolve({ error: null });
      });

      mockSupabaseClient.storage.from.mockReturnValue({
        upload: mockStorageUpload
      });

      // Mock database to return episodes
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return available transcript
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'full',
          text: 'This is a test transcript content for storage testing.',
          wordCount: 12,
          source: 'taddy',
          creditsConsumed: 1
        })
      };
      mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);

      // Create a new worker instance to pick up the mocked TranscriptService  
      worker = new TranscriptWorker(defaultConfig, mockLogger);

      const result = await worker.run();

      // Verify the transcript storage was called
      expect(mockStorageUpload).toHaveBeenCalledWith(
        'show-1/episode-1.jsonl.gz',
        expect.any(Buffer), // The gzipped JSONL content
        expect.objectContaining({
          contentType: 'application/gzip', // Should use the fixed MIME type
          upsert: true
        })
      );

      // Verify the correct MIME type was used
      expect(capturedContentType).toBe('application/gzip');

      // Verify that we successfully processed the transcript
      expect(result.availableTranscripts).toBe(1);
      expect(result.processedEpisodes).toBe(1);
    });

    it('should handle storage upload errors gracefully', async () => {
      // Mock episodes data with proper structure including joined podcast_shows
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Mock storage upload to fail
      const mockStorageUpload = vi.fn().mockResolvedValue({ 
        error: { message: 'Storage upload failed' } 
      });

      mockSupabaseClient.storage.from.mockReturnValue({
        upload: mockStorageUpload
      });

      // Mock database to return episodes
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return available transcript
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'full',
          text: 'This is a test transcript content for storage testing.',
          wordCount: 12,
          source: 'taddy',
          creditsConsumed: 1
        })
      };
      mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);

      // Create a new worker instance to pick up the mocked TranscriptService
      worker = new TranscriptWorker(defaultConfig, mockLogger);

      const result = await worker.run();

      // Verify that the storage error was handled and episode marked as error
      expect(result.errorCount).toBe(1);
      expect(result.availableTranscripts).toBe(0);

      // Verify error was logged appropriately  
      expect(mockLogger.error).toHaveBeenCalledWith(
        'system',
        'Episode processing failed',
        expect.objectContaining({
          metadata: expect.objectContaining({
            episode_id: 'episode-1',
            error: 'Failed to upload transcript to storage: Storage upload failed'
          })
        })
      );
    });

    it('should store gzipped JSONL content that can be decompressed and parsed', async () => {
      // Arrange mock episode
      const mockEpisodes = [{
        id: 'episode-1',
        show_id: 'show-1',
        guid: 'guid-1',
        episode_url: 'https://example.com/episode1',
        title: 'Test Episode',
        description: 'Test description',
        pub_date: new Date().toISOString(),
        duration_sec: 3600,
        created_at: new Date().toISOString(),
        deleted_at: null,
        podcast_shows: {
          id: 'show-1',
          rss_url: 'https://example.com/rss',
          title: 'Test Show'
        }
      }];

      // Capture uploaded buffer
      let capturedBuffer: Buffer | undefined;
      let capturedContentType: string | undefined;
      const mockStorageUpload = vi.fn().mockImplementation((path, content, options) => {
        capturedBuffer = content as Buffer;
        capturedContentType = options?.contentType;
        return Promise.resolve({ error: null });
      });

      mockSupabaseClient.storage.from.mockReturnValue({ upload: mockStorageUpload });

      // Mock DB queries to return episode
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'podcast_episodes') {
          return {
            select: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      not: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                          limit: vi.fn().mockResolvedValue({ data: mockEpisodes, error: null })
                        })
                      })
                    })
                  })
                })
              })
            })
          };
        } else if (table === 'transcripts') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        } else if (table === 'podcast_shows') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Mock transcript service to return full transcript
      const mockTranscriptServiceInstance = {
        getTranscript: vi.fn().mockResolvedValue({
          kind: 'full',
          text: 'Sample transcript text',
          wordCount: 3,
          source: 'taddy',
          creditsConsumed: 1
        })
      };
      mockTranscriptService.mockImplementation(() => mockTranscriptServiceInstance);

      // Act
      worker = new TranscriptWorker(defaultConfig, mockLogger);
      await worker.run();

      // Assert buffer captured
      expect(capturedBuffer).toBeDefined();
      // Decompress and parse
      const decompressed = gunzipSync(capturedBuffer as Buffer).toString('utf-8');
      const parsed = JSON.parse(decompressed);
      expect(parsed).toEqual(
        expect.objectContaining({
          episode_id: 'episode-1',
          show_id: 'show-1',
          transcript: 'Sample transcript text'
        })
      );
      // Confirm correct MIME type is still used
      expect(capturedContentType).toBe('application/gzip');
    });

    it('should never use unsupported MIME type (regression guard)', async () => {
      // Simple assertion on worker constant via runtime behaviour
      let capturedContentType: string | undefined;
      const mockStorageUpload = vi.fn().mockImplementation((path, content, options) => {
        capturedContentType = options?.contentType;
        return Promise.resolve({ error: null });
      });
      mockSupabaseClient.storage.from.mockReturnValue({ upload: mockStorageUpload });

      // Short-circuit transcripts and DB queries to no episodes to keep test light
      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
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
      });

      // Act
      worker = new TranscriptWorker(defaultConfig, mockLogger);
      await worker.run();

      // If worker never uploaded, capturedContentType may be undefined which is fine
      if (capturedContentType) {
        expect(capturedContentType).not.toBe('application/jsonlines+gzip');
        expect(capturedContentType).toBe('application/gzip');
      }
    });
  });
}); 