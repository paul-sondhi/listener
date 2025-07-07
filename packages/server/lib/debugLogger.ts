/**
 * Debug Logger Utility
 * 
 * Provides a simple interface for debug logging that can be easily controlled
 * in test environments. In test mode, debug logs are suppressed by default
 * unless explicitly enabled via environment variables.
 */

import { Logger, LogContext } from './logger';

// Create a logger instance that respects test environment settings
const debugLogger = new Logger({
  minLevel: process.env.NODE_ENV === 'test' ? 'warn' : 'debug'
});

/**
 * Debug logging function that respects environment settings
 * 
 * In test mode (NODE_ENV === 'test'), debug logs are suppressed unless:
 * - LOG_LEVEL is explicitly set to 'debug'
 * - DEBUG_LOGGING is set to 'true'
 * 
 * @param context - Log context
 * @param message - Debug message
 * @param metadata - Optional metadata object
 */
export function debugLog(context: LogContext, message: string, metadata?: Record<string, any>): void {
  // In test mode, only log if explicitly enabled
  if (process.env.NODE_ENV === 'test') {
    const debugEnabled = process.env.LOG_LEVEL === 'debug' || process.env.DEBUG_LOGGING === 'true';
    if (!debugEnabled) {
      return;
    }
  }
  
  debugLogger.debug(context, message, { metadata });
}

/**
 * Debug logging function for system-level operations
 */
export function debugSystem(message: string, metadata?: Record<string, any>): void {
  debugLog('system', message, metadata);
}

/**
 * Debug logging function for database operations
 */
export function debugDatabase(message: string, metadata?: Record<string, any>): void {
  debugLog('database', message, metadata);
}

/**
 * Debug logging function for subscription refresh operations
 */
export function debugSubscriptionRefresh(message: string, metadata?: Record<string, any>): void {
  debugLog('subscription_refresh', message, metadata);
}

/**
 * Debug logging function for scheduler operations
 */
export function debugScheduler(message: string, metadata?: Record<string, any>): void {
  debugLog('scheduler', message, metadata);
}

/**
 * Debug logging function for Spotify API operations
 */
export function debugSpotifyAPI(message: string, metadata?: Record<string, any>): void {
  debugLog('spotify_api', message, metadata);
}

/**
 * Debug logging function for authentication operations
 */
export function debugAuth(message: string, metadata?: Record<string, any>): void {
  debugLog('auth', message, metadata);
}

/**
 * Debug logging function for admin operations
 */
export function debugAdmin(message: string, metadata?: Record<string, any>): void {
  debugLog('admin', message, metadata);
} 