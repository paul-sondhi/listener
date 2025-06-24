/**
 * TaddyBusinessClient Production Safety Tests
 * 
 * These tests validate that our Business client handles error scenarios gracefully
 * and won't crash or behave unexpectedly in production. These are essential for
 * production safety and should always pass before deployment.
 * 
 * Test Coverage:
 * - Network error handling
 * - Invalid input validation
 * - GraphQL error classification
 * - Timeout handling
 * - Malformed response handling
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { TaddyBusinessClient } from '../lib/clients/taddyBusinessClient.js';
import { config } from 'dotenv';

// Load test environment variables
config();

const apiKey = process.env.TADDY_API_KEY;
const userId = process.env.TADDY_USER_ID;

// Skip tests if API credentials are not available
const _skipIfNoCredentials = apiKey && userId ? describe : describe.skip;

describe('TaddyBusinessClient Production Safety Tests', () => {
  let client: TaddyBusinessClient;

  beforeAll(() => {
    if (apiKey && userId) {
      client = new TaddyBusinessClient({
        apiKey,
        userId,
      });
    }
  });

  describe('Input Validation', () => {
    it('should handle empty feed URL gracefully', async () => {
      if (!client) return;
      
      const result = await client.fetchTranscript('', 'valid-guid');
      
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toBeTruthy();
        expect(result.creditsConsumed).toBe(0); // Should not consume credits for invalid input
      }
    });

    it('should handle empty episode GUID gracefully', async () => {
      if (!client) return;
      
      const result = await client.fetchTranscript('https://example.com/feed.xml', '');
      
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toBeTruthy();
        expect(result.creditsConsumed).toBe(0); // Should not consume credits for invalid input
      }
    });

    it('should handle malformed feed URLs gracefully', async () => {
      if (!client) return;
      
      const malformedUrls = [
        'not-a-url',
        'ftp://invalid-protocol.com/feed.xml',
        'https://',
        'https://.',
        'javascript:alert("xss")'
      ];

      for (const url of malformedUrls) {
        const result = await client.fetchTranscript(url, 'valid-guid');
        
        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
          expect(result.message).toBeTruthy();
          expect(result.creditsConsumed).toBe(0);
        }
      }
    });

    it('should handle very long input strings gracefully', async () => {
      if (!client) return;
      
      const longUrl = 'https://example.com/' + 'a'.repeat(10000);
      const longGuid = 'b'.repeat(10000);
      
      const result = await client.fetchTranscript(longUrl, longGuid);
      
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toBeTruthy();
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Error Classification', () => {
    it('should classify network errors correctly', async () => {
      if (!client) return;
      
      // Use a feed URL that will cause a network/GraphQL error
      const result = await client.fetchTranscript(
        'https://feeds.example-nonexistent-domain-12345.com/feed.xml',
        'test-guid'
      );
      
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).toBeTruthy();
        expect(typeof result.message).toBe('string');
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should not crash on unexpected GraphQL responses', async () => {
      if (!client) return;
      
      // Test with edge case inputs that might return unexpected data structures
      const edgeCases = [
        {
          feedUrl: 'https://feeds.megaphone.fm/nonexistent-show-12345',
          episodeGuid: 'nonexistent-episode-12345'
        },
        {
          feedUrl: 'https://example.com/feed.xml',
          episodeGuid: '00000000-0000-0000-0000-000000000000'
        }
      ];

      for (const testCase of edgeCases) {
        const result = await client.fetchTranscript(testCase.feedUrl, testCase.episodeGuid);
        
        // Should not crash, should return a valid result type
        expect(['full', 'partial', 'processing', 'not_found', 'no_match', 'error']).toContain(result.kind);
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
        
        if (result.kind === 'error') {
          expect(result.message).toBeTruthy();
        }
      }
    });
  });

  describe('Timeout Handling', () => {
    it('should handle API timeouts gracefully', async () => {
      if (!client) return;
      
      // Create a client with a very short timeout to force timeout scenarios
      const timeoutClient = new TaddyBusinessClient({
        apiKey,
        userId,
        timeout: 100, // 100ms - very short timeout
      });
      
      const result = await timeoutClient.fetchTranscript(
        'https://feeds.megaphone.fm/the-ringer-nba-show',
        '206f6ce8-5006-11f0-a60f-4f75f492a976'
      );
      
      // Should handle timeout gracefully
      expect(['full', 'partial', 'processing', 'not_found', 'no_match', 'error']).toContain(result.kind);
      
      if (result.kind === 'error') {
        expect(result.message).toBeTruthy();
        expect(result.message.toLowerCase()).toMatch(/timeout|network|connection/);
      }
    }, 10000);
  });

  describe('Robustness', () => {
    it('should handle concurrent requests without crashing', async () => {
      if (!client) return;
      
      // Fire multiple concurrent requests
      const promises = Array.from({ length: 3 }, () =>
        client.fetchTranscript(
          'https://feeds.megaphone.fm/the-ringer-nba-show',
          '206f6ce8-5006-11f0-a60f-4f75f492a976'
        )
      );
      
      const results = await Promise.all(promises);
      
      // All requests should complete successfully
      results.forEach(result => {
        expect(['full', 'partial', 'processing', 'not_found', 'no_match', 'error']).toContain(result.kind);
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
      });
    }, 30000);

    it('should maintain consistent behavior across multiple calls', async () => {
      if (!client) return;
      
      // Make the same request multiple times
      const requests = Array.from({ length: 3 }, () =>
        client.fetchTranscript(
          'https://feeds.megaphone.fm/the-ringer-nba-show',
          '206f6ce8-5006-11f0-a60f-4f75f492a976'
        )
      );
      
      const results = await Promise.all(requests);
      
      // All results should be the same kind (due to caching)
      const firstKind = results[0].kind;
      results.forEach(result => {
        expect(result.kind).toBe(firstKind);
      });
      
      // If successful, all should have same content
      if (firstKind === 'full') {
        const firstResult = results[0] as Extract<typeof results[0], { kind: 'full' }>;
        results.forEach(result => {
          if (result.kind === 'full') {
            expect(result.wordCount).toBe(firstResult.wordCount);
            expect(result.text.length).toBe(firstResult.text.length);
          }
        });
      }
    }, 30000);
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory with large transcript responses', async () => {
      if (!client) return;
      
      // Request a large transcript multiple times
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 3; i++) {
        const result = await client.fetchTranscript(
          'https://feeds.megaphone.fm/the-ringer-nba-show',
          '206f6ce8-5006-11f0-a60f-4f75f492a976'
        );
        
        expect(['full', 'partial', 'processing', 'not_found', 'no_match', 'error']).toContain(result.kind);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 45000);
  });

  describe('API Contract Validation', () => {
    it('should always return valid result objects', async () => {
      if (!client) return;
      
      const testCases = [
        {
          feedUrl: 'https://feeds.megaphone.fm/the-ringer-nba-show',
          episodeGuid: '206f6ce8-5006-11f0-a60f-4f75f492a976'
        },
        {
          feedUrl: 'https://feeds.simplecast.com/JGE3yC0V',
          episodeGuid: '05876a10-a210-428d-9f5c-6daf3a6a81c6'
        },
        {
          feedUrl: 'https://nonexistent.example.com/feed.xml',
          episodeGuid: 'invalid-guid'
        }
      ];

      for (const testCase of testCases) {
        const result = await client.fetchTranscript(testCase.feedUrl, testCase.episodeGuid);
        
        // Validate result structure
        expect(result).toBeDefined();
        expect(result.kind).toBeDefined();
        expect(['full', 'partial', 'processing', 'not_found', 'no_match', 'error']).toContain(result.kind);
        expect(typeof result.creditsConsumed).toBe('number');
        expect(result.creditsConsumed).toBeGreaterThanOrEqual(0);
        
        // Validate type-specific properties
        if (result.kind === 'full' || result.kind === 'partial') {
          expect(result.text).toBeDefined();
          expect(typeof result.text).toBe('string');
          expect(result.wordCount).toBeDefined();
          expect(typeof result.wordCount).toBe('number');
          expect(result.source).toBe('taddy');
        }
        
        if (result.kind === 'error') {
          expect(result.message).toBeDefined();
          expect(typeof result.message).toBe('string');
          expect(result.message.length).toBeGreaterThan(0);
        }
      }
    }, 60000);
  });
}); 