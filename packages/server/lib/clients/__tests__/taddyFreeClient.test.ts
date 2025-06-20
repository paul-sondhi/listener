import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { TaddyFreeClient, TranscriptResult } from '../taddyFreeClient.js';
import * as retryModule from '../../utils/retry.js';

// Mock the generated SDK
vi.mock('../../../generated/taddy.js', () => ({
  getSdk: vi.fn(() => ({
    getPodcastSeries: vi.fn(),
    getPodcastEpisode: vi.fn(),
  })),
}));

// Mock the logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the retry utility
vi.mock('../../utils/retry.js', () => ({
  withHttpRetry: vi.fn(),
}));

describe('TaddyFreeClient', () => {
  let client: TaddyFreeClient;
  let mockSdk: any;
  let mockWithHttpRetry: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock SDK
    mockSdk = {
      getPodcastSeries: vi.fn(),
      getPodcastEpisode: vi.fn(),
    };
    
    // Setup mock retry function to just call the function directly by default
    mockWithHttpRetry = vi.mocked(retryModule.withHttpRetry);
    mockWithHttpRetry.mockImplementation(async (fn) => fn());
    
    // Mock getSdk to return our mock
    const { getSdk } = await import('../../../generated/taddy.js');
    vi.mocked(getSdk).mockReturnValue(mockSdk);
    
    // Create client instance
    client = new TaddyFreeClient({
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const customClient = new TaddyFreeClient({
        apiKey: 'custom-key',
        endpoint: 'https://custom.endpoint.com/graphql',
        timeout: 5000,
        userAgent: 'custom-agent/1.0',
      });
      
      expect(customClient).toBeInstanceOf(TaddyFreeClient);
    });

    it('should use default config values when not provided', () => {
      expect(client).toBeInstanceOf(TaddyFreeClient);
    });
  });

  describe('fetchTranscript', () => {
    const testFeedUrl = 'https://feeds.example.com/podcast.rss';
    const testEpisodeGuid = 'episode-guid-123';

    it('should return full transcript when complete transcript is found', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: testEpisodeGuid,
        transcripts: [{
          uuid: 'transcript-uuid-abc',
          text: 'This is a complete transcript with multiple words.',
          isPartial: false,
          wordCount: 8,
          language: 'en',
          createdAt: '2023-01-01T00:00:00Z',
        }],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'full',
        text: 'This is a complete transcript with multiple words.',
        wordCount: 8,
      });
      
      expect(mockSdk.getPodcastSeries).toHaveBeenCalledWith({
        rssUrl: testFeedUrl,
      });
      
      expect(mockSdk.getPodcastEpisode).toHaveBeenCalledWith({
        podcastGuid: 'podcast-guid-456',
        episodeGuid: testEpisodeGuid,
      });
    });

    it('should return partial transcript when isPartial is true', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: testEpisodeGuid,
        transcripts: [{
          uuid: 'transcript-uuid-abc',
          text: 'This is a partial transcript...',
          isPartial: true,
          percentComplete: 75.5,
          wordCount: 5,
          language: 'en',
          createdAt: '2023-01-01T00:00:00Z',
        }],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'partial',
        text: 'This is a partial transcript...',
        wordCount: 5,
      });
    });

    it('should return not_found when episode exists but has no transcripts', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: testEpisodeGuid,
        transcripts: [], // No transcripts
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'not_found',
      });
    });

    it('should return no_match when podcast series is not found', async () => {
      // Arrange
      mockSdk.getPodcastSeries.mockResolvedValue(null);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'no_match',
      });
      
      expect(mockSdk.getPodcastSeries).toHaveBeenCalledWith({
        rssUrl: testFeedUrl,
      });
      
      // Should not call episode lookup if podcast not found
      expect(mockSdk.getPodcastEpisode).not.toHaveBeenCalled();
    });

    it('should return no_match when episode is not found', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(null);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'no_match',
      });
    });

    it('should return error when API call throws an exception', async () => {
      // Arrange
      const apiError = new Error('Network timeout');
      mockSdk.getPodcastSeries.mockRejectedValue(apiError);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy API error: Network timeout',
      });
    });

    it('should estimate word count when not provided by API', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: testEpisodeGuid,
        transcripts: [{
          uuid: 'transcript-uuid-abc',
          text: 'One two three four five',
          isPartial: false,
          wordCount: null, // No word count provided
          language: 'en',
          createdAt: '2023-01-01T00:00:00Z',
        }],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'full',
        text: 'One two three four five',
        wordCount: 5, // Estimated from text
      });
    });

    it('should select the best transcript when multiple are available', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: testEpisodeGuid,
        transcripts: [
          {
            uuid: 'transcript-partial',
            text: 'Partial transcript',
            isPartial: true,
            wordCount: 2,
            language: 'en',
            createdAt: '2023-01-01T00:00:00Z',
          },
          {
            uuid: 'transcript-full',
            text: 'This is the complete transcript with more words',
            isPartial: false,
            wordCount: 9,
            language: 'en',
            createdAt: '2023-01-01T00:00:00Z',
          },
        ],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(result).toEqual({
        kind: 'full',
        text: 'This is the complete transcript with more words',
        wordCount: 9,
      });
    });

    it('should use retry logic for API calls', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(null);

      // Act
      await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      // Assert
      expect(mockWithHttpRetry).toHaveBeenCalledTimes(2); // Once for podcast, once for episode
      expect(mockWithHttpRetry).toHaveBeenCalledWith(
        expect.any(Function),
        { maxAttempts: 2 }
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is accessible', async () => {
      // Arrange
      const mockRequest = vi.fn().mockResolvedValue({ __typename: 'Query' });
      vi.spyOn(GraphQLClient.prototype, 'request').mockImplementation(mockRequest);

      // Act
      const result = await client.healthCheck();

      // Assert
      expect(result).toBe(true);
      expect(mockWithHttpRetry).toHaveBeenCalledWith(
        expect.any(Function),
        { maxAttempts: 1 }
      );
    });

    it('should return false when API is not accessible', async () => {
      // Arrange
      const mockRequest = vi.fn().mockRejectedValue(new Error('Connection failed'));
      vi.spyOn(GraphQLClient.prototype, 'request').mockImplementation(mockRequest);

      // Act
      const result = await client.healthCheck();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty transcript text', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: 'test-guid',
        transcripts: [{
          uuid: 'transcript-uuid-abc',
          text: '',
          isPartial: false,
          wordCount: 0,
          language: 'en',
          createdAt: '2023-01-01T00:00:00Z',
        }],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript('https://test.com/rss', 'test-guid');

      // Assert
      expect(result).toEqual({
        kind: 'full',
        text: '',
        wordCount: 0,
      });
    });

    it('should handle whitespace-only transcript text', async () => {
      // Arrange
      const mockPodcast = {
        podcastGuid: 'podcast-guid-456',
        name: 'Test Podcast',
      };
      
      const mockEpisode = {
        uuid: 'episode-uuid-789',
        name: 'Test Episode',
        guid: 'test-guid',
        transcripts: [{
          uuid: 'transcript-uuid-abc',
          text: '   \n\t   ',
          isPartial: false,
          wordCount: null,
          language: 'en',
          createdAt: '2023-01-01T00:00:00Z',
        }],
      };

      mockSdk.getPodcastSeries.mockResolvedValue(mockPodcast);
      mockSdk.getPodcastEpisode.mockResolvedValue(mockEpisode);

      // Act
      const result = await client.fetchTranscript('https://test.com/rss', 'test-guid');

      // Assert
      expect(result).toEqual({
        kind: 'full',
        text: '   \n\t   ',
        wordCount: 0, // Estimated as 0 words
      });
    });
  });
}); 