import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { retryWithBackoff, isRetryableError, DEFAULT_NEWSLETTER_RETRY_OPTIONS } from '../retryWithBackoff.js';

// Mock the debug logger
vi.mock('../../debugLogger', () => ({
  debugSubscriptionRefresh: vi.fn()
}));

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        new Error('No HTML content found in Gemini API response'),
        new Error('The model is overloaded. Please try again later.'),
        new Error('Rate limit exceeded'),
        new Error('Network timeout occurred'),
        new Error('Connection reset by peer'),
        new Error('Internal server error'),
        new Error('Bad gateway'),
        new Error('Service unavailable'),
        new Error('Gateway timeout')
      ];

      retryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('Invalid API key provided'),
        new Error('Unauthorized access'),
        new Error('Forbidden request'),
        new Error('models/gemini-2.5-flash-latest is not found for API version v1beta'),
        new Error('Invalid request format'),
        new Error('Quota exceeded for this month'),
        new Error('Request too large'),
        new Error('Invalid model specified')
      ];

      nonRetryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      expect(isRetryableError(new Error('THE MODEL IS OVERLOADED'))).toBe(true);
      expect(isRetryableError(new Error('INVALID API KEY'))).toBe(false);
    });
  });

  describe('retryWithBackoff function', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: isRetryableError,
        context: 'test'
      });

      expect(result.result).toBe('success');
      expect(result.attemptsUsed).toBe(1);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('The model is overloaded'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');

      // Use real timers but with very short delays for testing
      const result = await retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 10, // Very short delay for testing
        maxDelayMs: 100,
        shouldRetry: isRetryableError,
        context: 'test'
      });

      expect(result.result).toBe('success');
      expect(result.attemptsUsed).toBe(3);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Invalid API key'));

      await expect(retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: isRetryableError,
        context: 'test'
      })).rejects.toThrow('Invalid API key');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should exhaust all retries and throw last error', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('The model is overloaded'));

      await expect(retryWithBackoff(mockFn, {
        maxRetries: 2,
        baseDelayMs: 10, // Very short delay for testing
        maxDelayMs: 100,
        shouldRetry: isRetryableError,
        context: 'test'
      })).rejects.toThrow('The model is overloaded');
      
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should calculate exponential backoff correctly', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      
      // Mock setTimeout to capture delay values without complex timer manipulation
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        if (typeof delay === 'number' && delay > 0) {
          delays.push(delay);
        }
        // Execute immediately for test
        setImmediate(() => (callback as any)());
        return 1 as any;
      });

      await retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: () => true,
        context: 'test'
      });

      // Should have captured 2 delays (for 2 retries)
      expect(delays).toHaveLength(2);
      
      // First delay should be around 1000ms (base delay)
      expect(delays[0]).toBeGreaterThan(750); // 1000 - 25% jitter
      expect(delays[0]).toBeLessThan(1250); // 1000 + 25% jitter
      
      // Second delay should be around 2000ms (base delay * 2)
      expect(delays[1]).toBeGreaterThan(1500); // 2000 - 25% jitter
      expect(delays[1]).toBeLessThan(2500); // 2000 + 25% jitter
    });

    it('should respect maximum delay', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      vi.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        if (typeof delay === 'number' && delay > 0) {
          delays.push(delay);
        }
        setImmediate(() => (callback as any)());
        return 1 as any;
      });

      await retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 1500, // Low max delay
        shouldRetry: () => true,
        context: 'test'
      });

      // All delays should be capped at maxDelayMs + jitter
      delays.forEach(delay => {
        expect(delay).toBeLessThan(1875); // 1500 + 25% jitter
      });
    });

    it('should include timing information', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(mockFn, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: isRetryableError,
        context: 'test'
      });

      expect(result.totalElapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.totalElapsedMs).toBe('number');
    });
  });

  describe('DEFAULT_NEWSLETTER_RETRY_OPTIONS', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_NEWSLETTER_RETRY_OPTIONS.maxRetries).toBe(3);
      expect(DEFAULT_NEWSLETTER_RETRY_OPTIONS.baseDelayMs).toBe(5000);
      expect(DEFAULT_NEWSLETTER_RETRY_OPTIONS.maxDelayMs).toBe(30000);
      expect(DEFAULT_NEWSLETTER_RETRY_OPTIONS.shouldRetry).toBe(isRetryableError);
      expect(DEFAULT_NEWSLETTER_RETRY_OPTIONS.context).toBe('newsletter generation');
    });
  });

  describe('edge cases', () => {
    it('should handle functions that throw non-Error objects', async () => {
      const mockFn = vi.fn().mockRejectedValue('string error');

      await expect(retryWithBackoff(mockFn, {
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        shouldRetry: () => true,
        context: 'test'
      })).rejects.toThrow('string error');
    });

    it('should handle zero retries', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Immediate failure'));

      await expect(retryWithBackoff(mockFn, {
        maxRetries: 0,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        shouldRetry: () => true,
        context: 'test'
      })).rejects.toThrow('Immediate failure');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle very small delays', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Retryable'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, {
        maxRetries: 1,
        baseDelayMs: 1, // Very small delay
        maxDelayMs: 10,
        shouldRetry: () => true,
        context: 'test'
      });

      expect(result.result).toBe('success');
      expect(result.attemptsUsed).toBe(2);
    });
  });
}); 