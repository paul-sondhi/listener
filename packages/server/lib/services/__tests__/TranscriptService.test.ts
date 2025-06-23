import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscriptService } from '../TranscriptService.js';
import { TaddyFreeClient } from '../../clients/taddyFreeClient.js';
import { TaddyBusinessClient, BusinessTranscriptResult } from '../../clients/taddyBusinessClient.js';
import { EpisodeWithShow, ExtendedTranscriptResult } from '../../../../shared/src/types/index.js';

// Mock the TaddyFreeClient
vi.mock('../../clients/taddyFreeClient.js', () => ({
  TaddyFreeClient: vi.fn(),
}));

// Mock the TaddyBusinessClient
vi.mock('../../clients/taddyBusinessClient.js', () => ({
  TaddyBusinessClient: vi.fn(),
}));

// Mock transcript worker config
vi.mock('../../../config/transcriptWorkerConfig.js', () => ({
  getTranscriptWorkerConfig: vi.fn(() => ({
    tier: 'free', // Default to free tier for tests
    enabled: true,
    cronSchedule: '0 1 * * *',
    lookbackHours: 24,
    maxRequests: 15,
    concurrency: 10,
    useAdvisoryLock: true,
  })),
}));

// Mock logger
vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TranscriptService', () => {
  let service: TranscriptService;
  let mockTaddyFreeClient: any;
  let mockTaddyBusinessClient: any;
  let mockGetConfig: any;
  let originalEnv: string | undefined;

  const createMockEpisode = (overrides: Partial<EpisodeWithShow> = {}): EpisodeWithShow => ({
    id: 'episode-123',
    show_id: 'show-456',
    guid: 'episode-guid-789',
    episode_url: 'https://example.com/audio.mp3',
    title: 'Test Episode',
    description: 'Test episode description',
    pub_date: '2024-01-01T00:00:00Z',
    duration_sec: 3600,
    created_at: '2024-01-01T00:00:00Z',
    deleted_at: undefined,
    show: {
      rss_url: 'https://example.com/feed.xml',
    },
    ...overrides,
  });

  beforeEach(async () => {
    // Save original environment
    originalEnv = process.env.TADDY_API_KEY;
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock Taddy Free client that returns ExtendedTranscriptResult
    mockTaddyFreeClient = {
      fetchTranscript: vi.fn(),
    };
    
    // Create mock Taddy Business client
    mockTaddyBusinessClient = {
      fetchTranscript: vi.fn(),
    };
    
    // Mock the TaddyFreeClient constructor
    (TaddyFreeClient as any).mockImplementation(() => mockTaddyFreeClient);
    
    // Mock the TaddyBusinessClient constructor
    (TaddyBusinessClient as any).mockImplementation(() => mockTaddyBusinessClient);
    
    // Get the config mock
    const { getTranscriptWorkerConfig } = await import('../../../config/transcriptWorkerConfig.js');
    mockGetConfig = getTranscriptWorkerConfig as any;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.TADDY_API_KEY = originalEnv;
    } else {
      delete process.env.TADDY_API_KEY;
    }
    // Clean up TADDY_USER_ID
    delete process.env.TADDY_USER_ID;
  });

  describe('constructor', () => {
    it('should initialize with Free client when tier is free and API key is available', () => {
      process.env.TADDY_API_KEY = 'test-api-key';
      mockGetConfig.mockReturnValue({ tier: 'free' });
      
      service = new TranscriptService();
      
      expect(TaddyFreeClient).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
      expect(TaddyBusinessClient).not.toHaveBeenCalled();
    });

    it('should initialize with Business client when tier is business and API key is available', () => {
      process.env.TADDY_API_KEY = 'test-api-key';
      process.env.TADDY_USER_ID = 'test-user-id';
      mockGetConfig.mockReturnValue({ tier: 'business' });
      
      service = new TranscriptService();
      
      expect(TaddyBusinessClient).toHaveBeenCalledWith({ 
        apiKey: 'test-api-key',
        userId: 'test-user-id'
      });
      expect(TaddyFreeClient).not.toHaveBeenCalled();
    });

    it('should initialize without Taddy client when API key is missing', () => {
      delete process.env.TADDY_API_KEY;
      mockGetConfig.mockReturnValue({ tier: 'free' });
      
      service = new TranscriptService();
      
      expect(TaddyFreeClient).not.toHaveBeenCalled();
      expect(TaddyBusinessClient).not.toHaveBeenCalled();
    });
  });

  describe('getTranscript with Business tier', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      process.env.TADDY_USER_ID = 'test-user-id';
      mockGetConfig.mockReturnValue({ tier: 'business' }); // Use business tier
      service = new TranscriptService();
    });

    it('should return processing when Business client returns processing', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'processing',
        source: 'taddy',
        creditsConsumed: 1
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({ 
        kind: 'processing',
        source: 'taddy',
        creditsConsumed: 1
      });
      expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return full transcript from Business client', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'full',
        text: 'This is a business tier transcript.',
        wordCount: 6,
        source: 'taddy',
        creditsConsumed: 1
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'full',
        text: 'This is a business tier transcript.',
        wordCount: 6,
        source: 'taddy',
        creditsConsumed: 1
      });
      expect(mockTaddyBusinessClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return partial transcript from Business client', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'partial',
        text: 'This is a business tier partial transcript.',
        wordCount: 7,
        source: 'taddy',
        creditsConsumed: 1
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'partial',
        text: 'This is a business tier partial transcript.',
        wordCount: 7,
        source: 'taddy',
        creditsConsumed: 1
      });
    });

    it('should return not_found from Business client', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'not_found',
        creditsConsumed: 1
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'not_found',
        source: 'taddy',
        creditsConsumed: 1
      });
    });

    it('should return no_match from Business client', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'no_match',
        creditsConsumed: 1
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'no_match',
        source: 'taddy',
        creditsConsumed: 1
      });
    });

    it('should return error from Business client', async () => {
      const episode = createMockEpisode();
      const businessResult: BusinessTranscriptResult = {
        kind: 'error',
        message: 'API quota exceeded',
        creditsConsumed: 0
      };
      
      mockTaddyBusinessClient.fetchTranscript.mockResolvedValue(businessResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'error',
        message: 'API quota exceeded',
        source: 'taddy',
        creditsConsumed: 0
      });
    });
  });

  describe('getTranscript with episode object', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      mockGetConfig.mockReturnValue({ tier: 'free' }); // Default to free tier for existing tests
      service = new TranscriptService();
    });

    it('should return error for deleted episodes', async () => {
      const deletedEpisode = createMockEpisode({
        deleted_at: '2024-01-02T00:00:00Z',
      });

      const result = await service.getTranscript(deletedEpisode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return error for episodes without RSS URL', async () => {
      const episodeWithoutRss = createMockEpisode({
        show: { rss_url: undefined },
      });

      const result = await service.getTranscript(episodeWithoutRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return error for episodes with empty RSS URL', async () => {
      const episodeWithEmptyRss = createMockEpisode({
        show: { rss_url: '   ' },
      });

      const result = await service.getTranscript(episodeWithEmptyRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return full transcript from Taddy when available', async () => {
      const episode = createMockEpisode();
      const taddyResult: ExtendedTranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return partial transcript from Taddy when available', async () => {
      const episode = createMockEpisode();
      const taddyResult: ExtendedTranscriptResult = {
        kind: 'partial',
        text: 'This is partial transcript text.',
        wordCount: 5,
        reason: 'Transcript incomplete',
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return not_found when Taddy returns not_found', async () => {
      const episode = createMockEpisode();
      const taddyResult: ExtendedTranscriptResult = { 
        kind: 'not_found',
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return no_match when Taddy returns no_match', async () => {
      const episode = createMockEpisode();
      const taddyResult: ExtendedTranscriptResult = { 
        kind: 'no_match',
        reason: 'Episode not found in podcast',
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return error when Taddy client throws exception', async () => {
      const episode = createMockEpisode();
      const error = new Error('Network timeout');
      
      mockTaddyFreeClient.fetchTranscript.mockRejectedValue(error);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy Free lookup failed: Network timeout',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return error when Taddy client throws non-Error exception', async () => {
      const episode = createMockEpisode();
      
      mockTaddyFreeClient.fetchTranscript.mockRejectedValue('String error');

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy Free lookup failed: String error',
        source: 'taddy',
        creditsConsumed: 0,
      });
    });

    it('should return not_found when no Taddy client is available', async () => {
      // Initialize service without API key
      delete process.env.TADDY_API_KEY;
      service = new TranscriptService();
      
      const episode = createMockEpisode();

      const result = await service.getTranscript(episode);

      expect(result).toEqual({ 
        kind: 'not_found',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return not_found when episode is missing GUID', async () => {
      const episodeWithoutGuid = createMockEpisode({
        guid: '',
      });

      const result = await service.getTranscript(episodeWithoutGuid);

      expect(result).toEqual({ 
        kind: 'not_found',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });
  });

  describe('getTranscript with episode ID', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      mockGetConfig.mockReturnValue({ tier: 'free' }); // Default to free tier for existing tests
      service = new TranscriptService();
    });

    it('should fetch episode by ID and delegate to episode object overload', async () => {
      const episodeId = 'test-episode-id';
      const taddyResult: ExtendedTranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episodeId);

      expect(result).toEqual(taddyResult);
      // Should use the stubbed episode data
      expect(mockTaddyFreeClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        `stub-guid-${episodeId}`
      );
    });

    it('should handle errors in episode ID lookup', async () => {
      const episodeId = 'test-episode-id';
      const taddyResult: ExtendedTranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
        source: 'taddy',
        creditsConsumed: 0,
      };
      
      mockTaddyFreeClient.fetchTranscript.mockResolvedValue(taddyResult);

      // The stubbed implementation should still work
      const result = await service.getTranscript(episodeId);

      expect(result).toEqual(taddyResult);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      mockGetConfig.mockReturnValue({ tier: 'free' });
      service = new TranscriptService();
    });

    it('should handle episode with null show object', async () => {
      const episodeWithNullShow = createMockEpisode({
        show: null as any,
      });

      const result = await service.getTranscript(episodeWithNullShow);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should handle episode with null RSS URL in show', async () => {
      const episodeWithNullRss = createMockEpisode({
        show: { rss_url: null as any },
      });

      const result = await service.getTranscript(episodeWithNullRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy',
        creditsConsumed: 0,
      });
      expect(mockTaddyFreeClient.fetchTranscript).not.toHaveBeenCalled();
    });
  });
}); 