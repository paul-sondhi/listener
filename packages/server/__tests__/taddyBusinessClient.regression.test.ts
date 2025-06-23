/**
 * TaddyBusinessClient Regression Tests
 * 
 * These tests validate that our Business client fixes continue to work correctly
 * against real episodes that previously failed in production. Uses 3 carefully
 * selected episodes to minimize API credit consumption while maximizing coverage.
 * 
 * Test Coverage:
 * - Full transcript retrieval (success case)
 * - Not found scenario (episode exists, no transcript)
 * - No match scenario (podcast/episode not in Taddy)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TaddyBusinessClient } from '../lib/clients/taddyBusinessClient.js';
import { config } from 'dotenv';

// Load test environment variables
config();

const apiKey = process.env.TADDY_API_KEY;
const userId = process.env.TADDY_USER_ID;

// Skip tests if API credentials are not available
const skipIfNoCredentials = apiKey && userId ? describe : describe.skip;

skipIfNoCredentials('TaddyBusinessClient Regression Tests', () => {
  let client: TaddyBusinessClient;

  beforeAll(() => {
    client = new TaddyBusinessClient({
      apiKey: apiKey!,
      userId: userId!,
    });
  });

  describe('Full Transcript Success', () => {
    it('should retrieve full transcript for The Ringer NBA Show episode', async () => {
      const result = await client.fetchTranscript(
        'https://feeds.megaphone.fm/the-ringer-nba-show',
        '206f6ce8-5006-11f0-a60f-4f75f492a976'
      );

      expect(result.kind).toBe('full');
      expect(result.creditsConsumed).toBeGreaterThan(0);
      
      if (result.kind === 'full') {
        expect(result.source).toBe('taddy');
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(1000); // Substantial content
        expect(result.wordCount).toBeGreaterThan(1000); // Should be a long episode
        expect(typeof result.wordCount).toBe('number');
      }
    }, 30000); // 30 second timeout for API calls
  });

  describe('Not Found Scenario', () => {
    it('should handle episode with no transcript available', async () => {
      const result = await client.fetchTranscript(
        'https://feeds.simplecast.com/JGE3yC0V',
        '05876a10-a210-428d-9f5c-6daf3a6a81c6'
      );

      expect(result.kind).toBe('not_found');
      expect(result.creditsConsumed).toBeGreaterThan(0);
      expect('text' in result).toBe(false); // Should not have transcript text
    }, 30000);
  });

  describe('No Match Scenario', () => {
    it('should handle podcast/episode not found in Taddy database', async () => {
      const result = await client.fetchTranscript(
        'https://anchor.fm/s/1035b1568/podcast/rss',
        '6d550c99-3c20-4329-b238-d384f9a3eeb9'
      );

      expect(result.kind).toBe('no_match');
      expect(result.creditsConsumed).toBeGreaterThan(0);
      expect('text' in result).toBe(false); // Should not have transcript text
    }, 30000);
  });

  describe('Schema Validation', () => {
    it('should not produce GraphQL schema validation errors', async () => {
      // Test all three scenarios to ensure our parameter name fixes work
      const tests = [
        {
          name: 'Full transcript case',
          feedUrl: 'https://feeds.megaphone.fm/the-ringer-nba-show',
          episodeGuid: '206f6ce8-5006-11f0-a60f-4f75f492a976'
        },
        {
          name: 'Not found case',
          feedUrl: 'https://feeds.simplecast.com/JGE3yC0V',
          episodeGuid: '05876a10-a210-428d-9f5c-6daf3a6a81c6'
        },
        {
          name: 'No match case',
          feedUrl: 'https://anchor.fm/s/1035b1568/podcast/rss',
          episodeGuid: '6d550c99-3c20-4329-b238-d384f9a3eeb9'
        }
      ];

      for (const test of tests) {
        const result = await client.fetchTranscript(test.feedUrl, test.episodeGuid);
        
        // Ensure no schema validation errors
        expect(result.kind).not.toBe('error');
        
        if (result.kind === 'error') {
          expect(result.message).not.toContain('SCHEMA_MISMATCH');
          expect(result.message).not.toContain('Cannot query field');
          expect(result.message).not.toContain('Unknown argument');
        }
      }
    }, 60000); // Longer timeout for multiple API calls
  });

  describe('Performance Expectations', () => {
    it('should complete requests within reasonable time limits', async () => {
      const startTime = Date.now();
      
      const result = await client.fetchTranscript(
        'https://feeds.megaphone.fm/the-ringer-nba-show',
        '206f6ce8-5006-11f0-a60f-4f75f492a976'
      );
      
      const duration = Date.now() - startTime;
      
      expect(result.kind).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 15000);
  });

  describe('Credit Consumption Tracking', () => {
    it('should report credit consumption for all result types', async () => {
      const tests = [
        {
          feedUrl: 'https://feeds.megaphone.fm/the-ringer-nba-show',
          episodeGuid: '206f6ce8-5006-11f0-a60f-4f75f492a976',
          expectedKind: 'full' as const
        },
        {
          feedUrl: 'https://feeds.simplecast.com/JGE3yC0V',
          episodeGuid: '05876a10-a210-428d-9f5c-6daf3a6a81c6',
          expectedKind: 'not_found' as const
        },
        {
          feedUrl: 'https://anchor.fm/s/1035b1568/podcast/rss',
          episodeGuid: '6d550c99-3c20-4329-b238-d384f9a3eeb9',
          expectedKind: 'no_match' as const
        }
      ];

      for (const test of tests) {
        const result = await client.fetchTranscript(test.feedUrl, test.episodeGuid);
        
        expect(result.kind).toBe(test.expectedKind);
        expect(result.creditsConsumed).toBeDefined();
        expect(typeof result.creditsConsumed).toBe('number');
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
        
        // Note: Due to Taddy's caching, actual credit consumption may be 0
        // but our client estimates conservatively, so we expect >= 0
      }
    }, 60000);
  });
}); 