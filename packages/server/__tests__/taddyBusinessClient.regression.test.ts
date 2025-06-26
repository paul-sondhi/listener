/**
 * TaddyBusinessClient Regression Tests (Mocked)
 * 
 * These tests validate that our Business client fixes continue to work correctly
 * using mocked responses that simulate real episodes that previously failed in production.
 * This ensures coverage without requiring live API credentials.
 * 
 * Test Coverage:
 * - Full transcript retrieval (success case)
 * - Not found scenario (episode exists, no transcript)
 * - No match scenario (podcast/episode not in Taddy)
 * - Schema validation and error handling
 * - Performance expectations
 * - Credit consumption tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { TaddyBusinessClient } from '../lib/clients/taddyBusinessClient.js';
import * as retryModule from '../lib/utils/retry.js';

// Mock the GraphQL client
vi.mock('graphql-request', () => ({
  GraphQLClient: vi.fn(() => ({
    request: vi.fn(),
  })),
}));

// Mock the logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the retry utility
vi.mock('../lib/utils/retry.js', () => ({
  withHttpRetry: vi.fn(),
}));

describe('TaddyBusinessClient Regression Tests (Mocked)', () => {
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
      apiKey: 'test-regression-api-key',
      userId: 'test-regression-user-id',
    });
  });

  describe('Full Transcript Success (Mocked)', () => {
    it('should retrieve full transcript for The Ringer NBA Show episode pattern', async () => {
      // Mock responses simulating successful transcript retrieval
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          // First: getPodcastSeries query succeeds
          getPodcastSeries: {
            uuid: 'podcast-ringer-nba-uuid',
            name: 'The Ringer NBA Show',
            rssUrl: 'https://feeds.megaphone.fm/the-ringer-nba-show',
          },
        })
        .mockResolvedValueOnce({
          // Second: Direct episode query succeeds
          getPodcastEpisode: {
            uuid: 'episode-ringer-nba-uuid',
            name: 'NBA Trade Deadline Madness',
            guid: '206f6ce8-5006-11f0-a60f-4f75f492a976',
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          // Third: Transcript query returns substantial content
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'Welcome to The Ringer NBA Show. Today we\'re talking about the trade deadline.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 5000,
            },
            {
              id: 'transcript-2', 
              text: 'The Lakers made some interesting moves, and the Celtics are looking strong.',
              speaker: 'Host',
              startTimecode: 5000,
              endTimecode: 10000,
            },
            // Simulate a long transcript with many segments
            ...Array.from({ length: 100 }, (_, i) => ({
              id: `transcript-${i + 3}`,
              text: `This is segment ${i + 3} of the NBA discussion with detailed analysis.`,
              speaker: i % 2 === 0 ? 'Host' : 'Guest',
              startTimecode: (i + 2) * 5000,
              endTimecode: (i + 3) * 5000,
            })),
          ],
        });

      const result = await client.fetchTranscript(
        'https://feeds.megaphone.fm/the-ringer-nba-show',
        '206f6ce8-5006-11f0-a60f-4f75f492a976'
      );

      expect(result.kind).toBe('full');
      expect(result.creditsConsumed).toBe(1);
      
      if (result.kind === 'full') {
        expect(result.source).toBe('taddy');
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(1000); // Substantial content
        expect(result.wordCount).toBeGreaterThan(100); // Should be a long episode
        expect(typeof result.wordCount).toBe('number');
      }
    });
  });

  describe('Not Found Scenario (Mocked)', () => {
    it('should handle episode with no transcript available pattern', async () => {
      // Mock responses simulating episode found but no transcript
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          // First: getPodcastSeries query succeeds
          getPodcastSeries: {
            uuid: 'podcast-no-transcript-uuid',
            name: 'Podcast Without Transcript',
            rssUrl: 'https://feeds.simplecast.com/JGE3yC0V',
          },
        })
        .mockResolvedValueOnce({
          // Second: Direct episode query succeeds
          getPodcastEpisode: {
            uuid: 'episode-no-transcript-uuid',
            name: 'Episode Without Transcript',
            guid: '05876a10-a210-428d-9f5c-6daf3a6a81c6',
            taddyTranscribeStatus: 'FAILED',
          },
        })
        .mockResolvedValueOnce({
          // Third: Transcript query returns null
          getEpisodeTranscript: null,
        });

      const result = await client.fetchTranscript(
        'https://feeds.simplecast.com/JGE3yC0V',
        '05876a10-a210-428d-9f5c-6daf3a6a81c6'
      );

      expect(result.kind).toBe('error');
      expect(result.message).toBe('taddyTranscribeStatus=FAILED');
      expect(result.creditsConsumed).toBe(1);
      expect('text' in result).toBe(false); // Should not have transcript text
    });
  });

  describe('No Match Scenario (Mocked)', () => {
    it('should handle podcast/episode not found in Taddy database pattern', async () => {
      // Mock responses simulating podcast series not found
      mockGraphQLClient.request.mockResolvedValueOnce({
        // getPodcastSeries query returns null
        getPodcastSeries: null,
      });

      const result = await client.fetchTranscript(
        'https://anchor.fm/s/1035b1568/podcast/rss',
        '6d550c99-3c20-4329-b238-d384f9a3eeb9'
      );

      expect(result.kind).toBe('no_match');
      expect(result.creditsConsumed).toBe(1);
      expect('text' in result).toBe(false); // Should not have transcript text
    });
  });

  describe('Schema Validation (Mocked)', () => {
    it('should handle GraphQL schema validation errors gracefully', async () => {
      // Mock a schema validation error on episode query, then successful fallback
      const schemaError = new Error('Cannot query field "getPodcastEpisode" on type "Query"');
      
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          // First: getPodcastSeries query succeeds
          getPodcastSeries: {
            uuid: 'podcast-series-uuid',
            name: 'Test Podcast',
            rssUrl: 'https://feeds.example.com/test',
          },
        })
        .mockRejectedValueOnce(schemaError) // Second: Direct episode query fails
        .mockResolvedValueOnce({
          // Third: Fallback series-with-episodes query succeeds
          getPodcastSeries: {
            uuid: 'podcast-series-uuid',
            name: 'Test Podcast',
            rssUrl: 'https://feeds.example.com/test',
            episodes: [
              {
                uuid: 'episode-fallback-uuid',
                name: 'Test Episode',
                guid: 'test-guid-123',
                taddyTranscribeStatus: 'COMPLETED',
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          // Fourth: Transcript query succeeds
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'This transcript was retrieved via fallback method.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 3000,
            },
          ],
        });

      const result = await client.fetchTranscript(
        'https://feeds.example.com/test',
        'test-guid-123'
      );
      
      // Should succeed via fallback, not return schema error
      expect(result.kind).toBe('full');
      expect(result.kind).not.toBe('error');
      
      if (result.kind === 'full') {
        expect(result.text).toContain('fallback method');
        // Explicit check for source metadata preservation
        expect(result.source).toBe('taddy');
      }
    });

    it('should detect and handle quota exhaustion errors', async () => {
      const quotaError = new Error('Credits exceeded for this billing period');
      quotaError.response = { status: 429 };
      
      // Mock quota error on the first call (getPodcastSeries)
      mockGraphQLClient.request.mockRejectedValueOnce(quotaError);

      const result = await client.fetchTranscript(
        'https://feeds.example.com/test',
        'test-guid-123'
      );
      
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toBe('CREDITS_EXCEEDED');
        expect(result.creditsConsumed).toBe(0);
      }
    });
  });

  describe('Performance Expectations (Mocked)', () => {
    it('should complete requests within reasonable time limits', async () => {
      // Mock fast successful response
      mockGraphQLClient.request
        .mockResolvedValueOnce({
          // First: getPodcastSeries query
          getPodcastSeries: {
            uuid: 'podcast-performance-uuid',
            name: 'Performance Test Podcast',
            rssUrl: 'https://feeds.example.com/performance-test',
          },
        })
        .mockResolvedValueOnce({
          // Second: getPodcastEpisode query
          getPodcastEpisode: {
            uuid: 'episode-performance-uuid',
            name: 'Performance Test Episode',
            guid: 'performance-test-guid',
            taddyTranscribeStatus: 'COMPLETED',
          },
        })
        .mockResolvedValueOnce({
          // Third: getEpisodeTranscript query
          getEpisodeTranscript: [
            {
              id: 'transcript-1',
              text: 'Quick response transcript.',
              speaker: 'Host',
              startTimecode: 0,
              endTimecode: 2000,
            },
          ],
        });

      const startTime = Date.now();
      
      const result = await client.fetchTranscript(
        'https://feeds.example.com/performance-test',
        'performance-test-guid'
      );
      
      const duration = Date.now() - startTime;
      
      expect(result.kind).toBeDefined();
      expect(duration).toBeLessThan(1000); // Mocked responses should be very fast
    });
  });

  describe('Credit Consumption Tracking (Mocked)', () => {
    it('should report credit consumption for all result types', async () => {
      const testCases = [
        {
          name: 'full transcript',
          expectedKind: 'full' as const,
          mocks: [
            {
              getPodcastSeries: {
                uuid: 'podcast-full-uuid',
                name: 'Full Podcast',
                rssUrl: 'https://feeds.example.com/full transcript',
              },
            },
            {
              getPodcastEpisode: {
                uuid: 'episode-full-uuid',
                name: 'Full Episode',
                guid: 'full-guid',
                taddyTranscribeStatus: 'COMPLETED',
              },
            },
            {
              getEpisodeTranscript: [
                {
                  id: 'transcript-1',
                  text: 'Full transcript content.',
                  speaker: 'Host',
                  startTimecode: 0,
                  endTimecode: 3000,
                },
              ],
            },
          ],
        },
        {
          name: 'failed transcript',
          expectedKind: 'error' as const,
          mocks: [
            {
              getPodcastSeries: {
                uuid: 'podcast-failed-uuid',
                name: 'Failed Podcast',
                rssUrl: 'https://feeds.example.com/failed transcript',
              },
            },
            {
              getPodcastEpisode: {
                uuid: 'episode-failed-uuid',
                name: 'Failed Episode',
                guid: 'failed-guid',
                taddyTranscribeStatus: 'FAILED',
              },
            },
            {
              getEpisodeTranscript: null,
            },
          ],
        },
        {
          name: 'no match',
          expectedKind: 'no_match' as const,
          mocks: [
            {
              getPodcastSeries: null,
            },
          ],
        },
      ];

      for (const testCase of testCases) {
        // Reset mocks for each test case
        mockGraphQLClient.request.mockClear();
        
        // Setup mocks for this test case
        for (const mock of testCase.mocks) {
          mockGraphQLClient.request.mockResolvedValueOnce(mock);
        }
        
        const result = await client.fetchTranscript(
          `https://feeds.example.com/${testCase.name}`,
          `${testCase.name}-guid`
        );
        
        expect(result.kind).toBe(testCase.expectedKind);
        expect(result.creditsConsumed).toBeDefined();
        expect(typeof result.creditsConsumed).toBe('number');
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
        
        // Check error message for failed transcript case
        if (testCase.expectedKind === 'error') {
          expect(result.message).toBe('taddyTranscribeStatus=FAILED');
        }
        
        // Check source metadata for results that should have it
        if (testCase.expectedKind === 'full' || testCase.expectedKind === 'partial' || testCase.expectedKind === 'processing') {
          expect(result.source).toBe('taddy');
        }
        
        // All mocked scenarios should report 1 credit consumed
        expect(result.creditsConsumed).toBe(1);
      }
    });
  });
}); 