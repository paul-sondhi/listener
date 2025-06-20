import { logger } from '../logger.js';

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Amount of jitter to add (0-1, default: 0.1) */
  jitterFactor?: number;
  /** Function to determine if an error should trigger a retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Default retry configuration optimized for API requests
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 2,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  shouldRetry: (error: unknown, attempt: number) => {
    // Retry on network errors and 5xx HTTP status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Network-related errors
      if (message.includes('timeout') || 
          message.includes('network') || 
          message.includes('connection') ||
          message.includes('econnreset') ||
          message.includes('enotfound')) {
        return true;
      }
      
      // HTTP 5xx errors (server errors)
      if (message.includes('500') || 
          message.includes('502') || 
          message.includes('503') || 
          message.includes('504') ||
          message.includes('internal server error') ||
          message.includes('bad gateway') ||
          message.includes('service unavailable') ||
          message.includes('gateway timeout')) {
        return true;
      }
      
      // Rate limiting (429) - should retry with backoff
      if (message.includes('429') || message.includes('too many requests')) {
        return true;
      }
    }
    
    // Don't retry on 4xx client errors (except 429)
    return false;
  },
};

/**
 * Executes a function with exponential backoff retry logic
 * 
 * This utility implements a robust retry mechanism with:
 * - Exponential backoff: delays increase exponentially between attempts
 * - Jitter: random variation to prevent thundering herd
 * - Configurable retry conditions: only retry on transient errors
 * - Comprehensive logging: tracks all attempts and outcomes
 * 
 * @param fn Function to execute (must return a Promise)
 * @param options Retry configuration options
 * @returns Promise resolving to the function result
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, baseDelay: 500 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.debug('Executing function with retry', {
        attempt,
        maxAttempts: config.maxAttempts,
      });
      
      const result = await fn();
      
      if (attempt > 1) {
        logger.info('Function succeeded after retry', {
          attempt,
          maxAttempts: config.maxAttempts,
        });
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      const isLastAttempt = attempt === config.maxAttempts;
      const shouldRetry = config.shouldRetry(error, attempt);
      
      logger.warn('Function execution failed', {
        attempt,
        maxAttempts: config.maxAttempts,
        error: error instanceof Error ? error.message : String(error),
        shouldRetry: shouldRetry && !isLastAttempt,
        isLastAttempt,
      });
      
      // If this is the last attempt or we shouldn't retry, throw the error
      if (isLastAttempt || !shouldRetry) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(attempt, config);
      
      logger.debug('Waiting before retry', {
        attempt,
        delay,
        nextAttempt: attempt + 1,
      });
      
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError;
}

/**
 * Calculates the delay for the next retry attempt
 * Uses exponential backoff with jitter to avoid thundering herd
 */
function calculateDelay(attempt: number, config: Required<RetryOptions>): number {
  // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  // Add jitter: random variation of ±jitterFactor
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  
  const finalDelay = Math.max(0, cappedDelay + jitter);
  
  return Math.round(finalDelay);
}

/**
 * Simple sleep utility that returns a Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convenience function for retrying HTTP requests specifically
 * Pre-configured with sensible defaults for API calls
 */
export async function withHttpRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(fn, {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    ...options,
  });
}

/**
 * Type guard to check if an error indicates a network/server issue
 * Useful for custom shouldRetry functions
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('timeout') || 
      message.includes('network') || 
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('enotfound')) {
    return true;
  }
  
  // Server errors (5xx)
  if (message.includes('500') || 
      message.includes('502') || 
      message.includes('503') || 
      message.includes('504')) {
    return true;
  }
  
  // Rate limiting
  if (message.includes('429')) {
    return true;
  }
  
  return false;
} 