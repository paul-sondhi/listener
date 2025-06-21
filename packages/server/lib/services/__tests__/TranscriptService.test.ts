import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscriptService } from '../TranscriptService.js';
import { TaddyFreeClient, TranscriptResult } from '../../clients/taddyFreeClient.js';
import { EpisodeWithShow } from '../../../../shared/src/types/supabase.js';

// Mock the TaddyFreeClient
vi.mock('../../clients/taddyFreeClient.js', () => ({
  TaddyFreeClient: vi.fn(),
}));

// Mock logger
vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('TranscriptService', () => {
  let service: TranscriptService;
  let mockTaddyClient: any;
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

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.TADDY_API_KEY;
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock Taddy client
    mockTaddyClient = {
      fetchTranscript: vi.fn(),
    };
    
    // Mock the TaddyFreeClient constructor
    (TaddyFreeClient as any).mockImplementation(() => mockTaddyClient);
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.TADDY_API_KEY = originalEnv;
    } else {
      delete process.env.TADDY_API_KEY;
    }
  });

  describe('constructor', () => {
    it('should initialize with Taddy client when API key is available', () => {
      process.env.TADDY_API_KEY = 'test-api-key';
      
      service = new TranscriptService();
      
      expect(TaddyFreeClient).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    });

    it('should initialize without Taddy client when API key is missing', () => {
      delete process.env.TADDY_API_KEY;
      
      service = new TranscriptService();
      
      expect(TaddyFreeClient).not.toHaveBeenCalled();
    });
  });

  describe('getTranscript with episode object', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      service = new TranscriptService();
    });

    it('should return error for deleted episodes', async () => {
      const deletedEpisode = createMockEpisode({
        deleted_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.getTranscript(deletedEpisode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
      });
      expect(mockTaddyClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return error for episodes without RSS URL', async () => {
      const episodeWithoutRss = createMockEpisode({
        show: { rss_url: undefined },
      });

      const result = await service.getTranscript(episodeWithoutRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
      });
      expect(mockTaddyClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return error for episodes with empty RSS URL', async () => {
      const episodeWithEmptyRss = createMockEpisode({
        show: { rss_url: '   ' },
      });

      const result = await service.getTranscript(episodeWithEmptyRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
      });
      expect(mockTaddyClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return full transcript from Taddy when available', async () => {
      const episode = createMockEpisode();
      const taddyResult: TranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
      };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return partial transcript from Taddy when available', async () => {
      const episode = createMockEpisode();
      const taddyResult: TranscriptResult = {
        kind: 'partial',
        text: 'This is partial transcript text.',
        wordCount: 5,
        reason: 'Transcript incomplete',
      };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return not_found when Taddy returns not_found', async () => {
      const episode = createMockEpisode();
      const taddyResult: TranscriptResult = { kind: 'not_found' };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return no_match when Taddy returns no_match', async () => {
      const episode = createMockEpisode();
      const taddyResult: TranscriptResult = { 
        kind: 'no_match',
        reason: 'Episode not found in podcast',
      };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episode);

      expect(result).toEqual(taddyResult);
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return error when Taddy client throws exception', async () => {
      const episode = createMockEpisode();
      const error = new Error('Network timeout');
      
      mockTaddyClient.fetchTranscript.mockRejectedValue(error);

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy lookup failed: Network timeout',
      });
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        'episode-guid-789'
      );
    });

    it('should return error when Taddy client throws non-Error exception', async () => {
      const episode = createMockEpisode();
      
      mockTaddyClient.fetchTranscript.mockRejectedValue('String error');

      const result = await service.getTranscript(episode);

      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy lookup failed: String error',
      });
    });

    it('should return not_found when no Taddy client is available', async () => {
      // Initialize service without API key
      delete process.env.TADDY_API_KEY;
      service = new TranscriptService();
      
      const episode = createMockEpisode();

      const result = await service.getTranscript(episode);

      expect(result).toEqual({ kind: 'not_found' });
      expect(mockTaddyClient.fetchTranscript).not.toHaveBeenCalled();
    });

    it('should return not_found when episode is missing GUID', async () => {
      const episodeWithoutGuid = createMockEpisode({
        guid: '',
      });

      const result = await service.getTranscript(episodeWithoutGuid);

      expect(result).toEqual({ kind: 'not_found' });
      expect(mockTaddyClient.fetchTranscript).not.toHaveBeenCalled();
    });
  });

  describe('getTranscript with episode ID', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      service = new TranscriptService();
    });

    it('should fetch episode by ID and delegate to episode object overload', async () => {
      const episodeId = 'test-episode-id';
      const taddyResult: TranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
      };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      const result = await service.getTranscript(episodeId);

      expect(result).toEqual(taddyResult);
      // Should use the stubbed episode data
      expect(mockTaddyClient.fetchTranscript).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        `stub-guid-${episodeId}`
      );
    });

    it('should handle errors in episode ID lookup', async () => {
      const episodeId = 'test-episode-id';
      const taddyResult: TranscriptResult = {
        kind: 'full',
        text: 'This is the full transcript text.',
        wordCount: 6,
      };
      
      mockTaddyClient.fetchTranscript.mockResolvedValue(taddyResult);

      // The stubbed implementation should still work
      const result = await service.getTranscript(episodeId);

      expect(result).toEqual(taddyResult);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      process.env.TADDY_API_KEY = 'test-api-key';
      service = new TranscriptService();
    });

    it('should handle episode with null show object', async () => {
      const episodeWithNullShow = createMockEpisode({
        show: undefined,
      });

      const result = await service.getTranscript(episodeWithNullShow);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
      });
    });

    it('should handle episode with null RSS URL in show', async () => {
      const episodeWithNullRss = createMockEpisode({
        show: { rss_url: null },
      });

      const result = await service.getTranscript(episodeWithNullRss);

      expect(result).toEqual({
        kind: 'error',
        message: 'Episode is not eligible for transcript processing',
      });
    });
  });
}); 