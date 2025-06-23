import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { TaddyBusinessClient } from '../taddyBusinessClient.js';
import * as retryModule from '../../utils/retry.js';

// Mock the GraphQL client
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn(() => ({
    request: vi.fn(),
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

describe('TaddyBusinessClient', () => {
  let client: TaddyBusinessClient;
  let mockGraphQLClient: any;
  let mockWithHttpRetry: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock GraphQL client
    mockGraphQLClient = {
      request: vi.fn(),
    };
    
    // Mock the GraphQLClient constructor
    vi.mocked(GraphQLClient).mockImplementation(() => mockGraphQLClient);
    
    // Setup mock retry function to just call the function directly by default
    mockWithHttpRetry = vi.mocked(retryModule.withHttpRetry);
    mockWithHttpRetry.mockImplementation(async (fn) => fn());
    
    // Create client instance
    client = new TaddyBusinessClient({
      apiKey: 'test-business-api-key',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const customClient = new TaddyBusinessClient({
        apiKey: 'custom-key',
        endpoint: 'https://custom.endpoint.com/graphql',
        timeout: 15000,
        userAgent: 'custom-business-agent/1.0',
      });
      
      expect(customClient).toBeInstanceOf(TaddyBusinessClient);
      expect(GraphQLClient).toHaveBeenCalledWith(
        'https://custom.endpoint.com/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-KEY': 'custom-key',
            'User-Agent': 'custom-business-agent/1.0',
          }),
          timeout: 15000,
        })
      );
    });

    it('should use default config values when not provided', () => {
      expect(client).toBeInstanceOf(TaddyBusinessClient);
      expect(GraphQLClient).toHaveBeenCalledWith(
        'https://api.taddy.org/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-KEY': 'test-business-api-key',
            'User-Agent': 'listener-app/1.0.0 (GraphQL Business Client)',
          }),
          timeout: 30000,
        })
      );
    });
  });

  describe('fetchTranscript', () => {
    const testFeedUrl = 'https://feeds.example.com/podcast.rss';
    const testEpisodeGuid = 'episode-guid-123';

    it('should return full transcript when complete transcript is found', async () => {
      // Setup mocks for this specific test
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'This is a complete Business tier transcript.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 5000,
            },
            {
              id: 'transcript-2',
              text: 'It has multiple segments with speaker information.',
              speaker: 'Guest',
              startTimecode: 5000,
              endTimecode: 10000,
            },
          ],
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'full',
        text: 'Host: This is a complete Business tier transcript.\nGuest: It has multiple segments with speaker information.',
        wordCount: 16,
        source: 'taddy',
        creditsConsumed: 1,
      });

      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(3);
    });

    it('should return processing status when transcript is still being generated', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'PROCESSING',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: null,
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'processing',
        source: 'taddy',
        creditsConsumed: 1,
      });
    });

    it('should return not_found when transcript generation failed', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'FAILED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: null,
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'not_found',
        creditsConsumed: 1,
      });
    });

    it('should return not_found when no transcript items are returned', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: [],
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'not_found',
        creditsConsumed: 1,
      });
    });

    it('should return no_match when podcast series is not found', async () => {
      mockGraphQLClient.request.mockResolvedValueOnce({
        getPodcastSeries: null,
      });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'no_match',
        creditsConsumed: 1,
      });

      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(1);
    });

    it('should return no_match when episode is not found', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: null,
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'no_match',
        creditsConsumed: 1,
      });

      expect(mockGraphQLClient.request).toHaveBeenCalledTimes(2);
    });

    it('should handle quota exhaustion errors correctly', async () => {
      const quotaError = new Error('Credits exceeded for this billing period');
      quotaError.response = { status: 429 };
      
      mockGraphQLClient.request.mockRejectedValueOnce(quotaError);

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'error',
        message: 'CREDITS_EXCEEDED',
        creditsConsumed: 0,
      });
    });

    it('should handle general API errors correctly', async () => {
      const apiError = new Error('GraphQL error: Invalid query');
      mockGraphQLClient.request.mockRejectedValueOnce(apiError);

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'error',
        message: 'Taddy Business API error: GraphQL error: Invalid query',
        creditsConsumed: 0,
      });
    });

    it('should use retry logic for all API calls', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'Test transcript.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 1000,
            },
          ],
        });

      await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(mockWithHttpRetry).toHaveBeenCalledTimes(3);
      
      mockWithHttpRetry.mock.calls.forEach(call => {
        expect(call[1]).toEqual({ maxAttempts: 2 });
      });
    });

    it('should handle transcripts without speaker information', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'This transcript has no speaker info.',
              speaker: null,
              startTimecode: 0,
              endTimecode: 5000,
            },
            {
              id: 'transcript-2',
              text: 'Neither does this one.',
              speaker: '',
              startTimecode: 5000,
              endTimecode: 8000,
            },
          ],
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'full',
        text: 'This transcript has no speaker info.\nNeither does this one.',
        wordCount: 10, // "This transcript has no speaker info" (6) + "Neither does this one" (4) = 10
        source: 'taddy',
        creditsConsumed: 1,
      });
    });

    it('should filter out empty transcript items', async () => {
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          getPodcastSeries: {
            uuid: 'podcast-uuid-456',
            name: 'Test Podcast',
            rssUrl: testFeedUrl,
          },
        })
        .mockResolvedValueOnce({
          getPodcastEpisode: {
            uuid: 'episode-uuid-789',
            name: 'Test Episode',
            guid: testEpisodeGuid,
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'Valid transcript text.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 3000,
            },
            {
              id: 'transcript-2',
              text: '',
              speaker: 'Guest',
              startTimecode: 3000,
              endTimecode: 4000,
            },
            {
              id: 'transcript-3',
              text: '   ',
              speaker: 'Host',
              startTimecode: 4000,
              endTimecode: 5000,
            },
            {
              id: 'transcript-4',
              text: 'Another valid segment.',
              speaker: 'Guest',
              startTimecode: 5000,
              endTimecode: 8000,
            },
          ],
        });

      const result = await client.fetchTranscript(testFeedUrl, testEpisodeGuid);

      expect(result).toEqual({
        kind: 'full',
        text: 'Host: Valid transcript text.\nGuest: Another valid segment.',
        wordCount: 8, // "Host: Valid transcript text." (4) + "Guest: Another valid segment." (4) = 8
        source: 'taddy',
        creditsConsumed: 1,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return successful health check for Business plan', async () => {
      mockGraphQLClient.request.mockResolvedValueOnce({
        me: {
          id: 'user-123',
          myDeveloperDetails: {
            isBusinessPlan: true,
            allowedOnDemandTranscriptsLimit: 1000,
            currentOnDemandTranscriptsUsage: 150,
          },
        },
      });

      const result = await client.healthCheck();

      expect(result).toEqual({
        connected: true,
        isBusinessPlan: true,
      });

      expect(mockGraphQLClient.request).toHaveBeenCalledWith(
        expect.stringContaining('me {')
      );
    });

    it('should return successful health check for Free plan', async () => {
      mockGraphQLClient.request.mockResolvedValueOnce({
        me: {
          id: 'user-123',
          myDeveloperDetails: {
            isBusinessPlan: false,
            allowedOnDemandTranscriptsLimit: 10,
            currentOnDemandTranscriptsUsage: 5,
          },
        },
      });

      const result = await client.healthCheck();

      expect(result).toEqual({
        connected: true,
        isBusinessPlan: false,
      });
    });

    it('should handle missing user details gracefully', async () => {
      mockGraphQLClient.request.mockResolvedValueOnce({
        me: {
          id: 'user-123',
          myDeveloperDetails: null,
        },
      });

      const result = await client.healthCheck();

      expect(result).toEqual({
        connected: true,
        isBusinessPlan: false,
      });
    });

    it('should handle health check errors', async () => {
      const error = new Error('Authentication failed');
      mockGraphQLClient.request.mockRejectedValueOnce(error);

      const result = await client.healthCheck();

      expect(result).toEqual({
        connected: false,
        isBusinessPlan: false,
        error: 'Authentication failed',
      });
    });

    it('should use retry logic with single attempt for health checks', async () => {
      mockGraphQLClient.request.mockResolvedValueOnce({
        me: {
          id: 'user-123',
          myDeveloperDetails: {
            isBusinessPlan: true,
          },
        },
      });

      await client.healthCheck();

      expect(mockWithHttpRetry).toHaveBeenCalledWith(
        expect.any(Function),
        { maxAttempts: 1 }
      );
    });
  });

  describe('quota exhaustion detection', () => {
    const testCases = [
      {
        name: 'HTTP 429 status',
        error: { response: { status: 429 }, message: 'Too many requests' },
        expected: true,
      },
      {
        name: 'credits exceeded message',
        error: { message: 'Credits exceeded for this billing period' },
        expected: true,
      },
      {
        name: 'quota exceeded message',
        error: { message: 'API quota exceeded' },
        expected: true,
      },
      {
        name: 'rate limit message',
        error: { message: 'Rate limit exceeded' },
        expected: true,
      },
      {
        name: 'CREDITS_EXCEEDED constant',
        error: { message: 'CREDITS_EXCEEDED' },
        expected: true,
      },
      {
        name: 'case insensitive matching',
        error: { message: 'QUOTA EXCEEDED - please upgrade your plan' },
        expected: true,
      },
      {
        name: 'unrelated error',
        error: { message: 'Invalid GraphQL query syntax' },
        expected: false,
      },
      {
        name: 'null error',
        error: null,
        expected: false,
      },
    ];

    testCases.forEach(({ name, error, expected }) => {
      it(`should ${expected ? 'detect' : 'not detect'} quota exhaustion for ${name}`, async () => {
        if (error) {
          mockGraphQLClient.request.mockRejectedValueOnce(error);
        } else {
          mockGraphQLClient.request.mockRejectedValueOnce(null);
        }

        const result = await client.fetchTranscript('https://test.com/feed', 'test-guid');

        if (expected) {
          expect(result).toEqual({
            kind: 'error',
            message: 'CREDITS_EXCEEDED',
            creditsConsumed: 0,
          });
        } else {
          expect(result.kind).toBe('error');
          expect(result.message).not.toBe('CREDITS_EXCEEDED');
        }
      });
    });
  });
}); 