/**
 * Retry Utility with Exponential Backoff and Jitter
 * 
 * Provides robust retry logic for API calls with intelligent backoff strategies
 * to handle temporary failures while respecting rate limits.
 */

import { debugSubscriptionRefresh } from '../debugLogger.js';

export interface RetryOptions {
  /** Maximum number of retry attempts (total attempts = maxRetries + 1) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds to cap exponential growth */
  maxDelayMs: number;
  /** Function to determine if an error should trigger a retry */
  shouldRetry: (error: Error) => boolean;
  /** Optional context for logging */
  context?: string;
}

export interface RetryResult<T> {
  /** The successful result */
  result: T;
  /** Number of attempts made (1 = success on first try) */
  attemptsUsed: number;
  /** Total time spent including delays */
  totalElapsedMs: number;
}

/**
 * Determines if an error is retryable based on common patterns
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Retryable error patterns
  const retryablePatterns = [
    'no html content found',
    'the model is overloaded',
    'rate limit',
    'timeout',
    'network error',
    'connection reset',
    'econnreset',
    'enotfound',
    'etimedout',
    'socket hang up',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout'
  ];
  
  // Non-retryable error patterns (fail fast)
  const nonRetryablePatterns = [
    'api key',
    'unauthorized',
    'forbidden',
    'not found for api version',
    'invalid request',
    'quota exceeded',
    'request too large',
    'invalid model'
  ];
  
  // Check for non-retryable errors first
  if (nonRetryablePatterns.some(pattern => message.includes(pattern))) {
    return false;
  }
  
  // Check for retryable errors
  return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  
  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter (±25% randomization) to prevent thundering herd
  const jitterRange = cappedDelay * 0.25;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff and jitter
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to the successful result with retry metadata
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const { maxRetries, baseDelayMs, maxDelayMs, shouldRetry, context = 'operation' } = options;
  const startTime = Date.now();
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const attemptStart = Date.now();
    
    try {
      debugSubscriptionRefresh(`Starting ${context} attempt`, {
        attempt,
        maxAttempts: maxRetries + 1,
        totalElapsedMs: Date.now() - startTime
      });
      
      const result = await fn();
      const totalElapsedMs = Date.now() - startTime;
      
      debugSubscriptionRefresh(`${context} succeeded`, {
        attempt,
        attemptsUsed: attempt,
        attemptElapsedMs: Date.now() - attemptStart,
        totalElapsedMs
      });
      
      return {
        result,
        attemptsUsed: attempt,
        totalElapsedMs
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const attemptElapsedMs = Date.now() - attemptStart;
      
      debugSubscriptionRefresh(`${context} attempt failed`, {
        attempt,
        maxAttempts: maxRetries + 1,
        error: lastError.message,
        attemptElapsedMs,
        totalElapsedMs: Date.now() - startTime,
        isRetryable: shouldRetry(lastError)
      });
      
      // If this is the last attempt or error is not retryable, throw
      if (attempt > maxRetries || !shouldRetry(lastError)) {
        debugSubscriptionRefresh(`${context} failed permanently`, {
          finalAttempt: attempt,
          totalAttempts: maxRetries + 1,
          finalError: lastError.message,
          totalElapsedMs: Date.now() - startTime,
          reason: attempt > maxRetries ? 'max_retries_exceeded' : 'non_retryable_error'
        });
        throw lastError;
      }
      
      // Calculate delay for next attempt
      const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      
      debugSubscriptionRefresh(`${context} retrying after delay`, {
        attempt,
        nextAttempt: attempt + 1,
        delayMs: Math.round(delayMs),
        totalElapsedMs: Date.now() - startTime
      });
      
      // Wait before next attempt
      await sleep(delayMs);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError!;
}

/**
 * Default retry options for newsletter generation
 */
export const DEFAULT_NEWSLETTER_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 5000,   // 5 seconds
  maxDelayMs: 30000,   // 30 seconds
  shouldRetry: isRetryableError,
  context: 'newsletter generation'
}; 