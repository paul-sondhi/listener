/**
 * Comprehensive Logging System for Podcast Subscription Refresh
 *
 * Provides structured logging with consistent formatting, log levels,
 * and specialized loggers for different system components.
 *
 * Features:
 * - Structured JSON logging for monitoring systems
 * - Multiple log levels (debug, info, warn, error)
 * - Context-aware logging with timestamps and component identification
 * - Specialized loggers for different system components
 * - Security-conscious logging (never logs sensitive data)
 * - Environment-aware logging (more verbose in development)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = 'subscription_refresh' | 'scheduler' | 'spotify_api' | 'database' | 'auth' | 'admin' | 'vault' | 'system';
/**
 * Base log entry structure for consistent formatting
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    context: LogContext;
    message: string;
    component?: string;
    user_id?: string;
    job_id?: string;
    duration_ms?: number;
    success?: boolean;
    error?: string;
    metadata?: Record<string, any>;
}
/**
 * Subscription refresh specific log data
 */
export interface SubscriptionRefreshLogData {
    user_id?: string;
    job_id?: string;
    batch_number?: number;
    total_batches?: number;
    active_subscriptions?: number;
    inactive_subscriptions?: number;
    spotify_api_calls?: number;
    database_operations?: number;
    processing_time_ms?: number;
    retry_count?: number;
    error_category?: 'auth_error' | 'api_error' | 'database_error' | 'rate_limit' | 'timeout' | 'unknown';
}
/**
 * Enhanced log entry for subscription refresh operations
 */
export interface SubscriptionRefreshLogEntry extends LogEntry {
    context: 'subscription_refresh';
    subscription_data?: SubscriptionRefreshLogData;
}
/**
 * Configuration for the logging system
 */
interface LoggerConfig {
    minLevel: LogLevel;
    enableConsoleLogging: boolean;
    enableStructuredLogging: boolean;
    enableTimestamps: boolean;
    enableStackTraces: boolean;
    redactSensitiveData: boolean;
}
/**
 * Core logger class with comprehensive logging functionality
 */
declare class Logger {
    private config;
    constructor(config?: Partial<LoggerConfig>);
    /**
     * Check if a log level should be logged based on minimum level
     * @param {LogLevel} level - Log level to check
     * @returns {boolean} Whether the level should be logged
     */
    private shouldLog;
    /**
     * Create a structured log entry
     * @param {LogLevel} level - Log level
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     * @returns {LogEntry} Structured log entry
     */
    private createLogEntry;
    /**
     * Output a log entry to console with proper formatting
     * @param {LogEntry} entry - Log entry to output
     */
    private outputLog;
    /**
     * Get appropriate console function for log level
     * @param {LogLevel} level - Log level
     * @returns {(...args: any[]) => void} Console function
     */
    private getConsoleFunction;
    /**
     * Log a debug message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    debug(context: LogContext, message: string, additional?: Partial<LogEntry>): void;
    /**
     * Log an info message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    info(context: LogContext, message: string, additional?: Partial<LogEntry>): void;
    /**
     * Log a warning message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    warn(context: LogContext, message: string, additional?: Partial<LogEntry>): void;
    /**
     * Log an error message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    error(context: LogContext, message: string, additional?: Partial<LogEntry>): void;
}
declare const globalLogger: Logger;
/**
 * Specialized logger for subscription refresh operations
 */
export declare class SubscriptionRefreshLogger {
    private logger;
    private jobId?;
    constructor(jobId?: string, config?: Partial<LoggerConfig>);
    /**
     * Log subscription refresh start
     * @param {string} userId - User ID
     * @param {Partial<SubscriptionRefreshLogData>} data - Additional data
     */
    refreshStart(userId: string, data?: Partial<SubscriptionRefreshLogData>): void;
    /**
     * Log subscription refresh completion
     * @param {string} userId - User ID
     * @param {boolean} success - Whether refresh succeeded
     * @param {SubscriptionRefreshLogData} data - Refresh data
     */
    refreshComplete(userId: string, success: boolean, data: SubscriptionRefreshLogData): void;
    /**
     * Log Spotify API interaction
     * @param {string} userId - User ID
     * @param {string} endpoint - API endpoint
     * @param {boolean} success - Whether API call succeeded
     * @param {number} duration - API call duration
     * @param {string} error - Error message if failed
     */
    spotifyApiCall(userId: string, endpoint: string, success: boolean, duration: number, error?: string): void;
    /**
     * Log database operation
     * @param {string} userId - User ID
     * @param {string} operation - Database operation
     * @param {boolean} success - Whether operation succeeded
     * @param {number} recordsAffected - Number of records affected
     * @param {string} error - Error message if failed
     */
    databaseOperation(userId: string, operation: string, success: boolean, recordsAffected: number, error?: string): void;
    /**
     * Log batch processing progress
     * @param {number} batchNumber - Current batch number
     * @param {number} totalBatches - Total number of batches
     * @param {number} usersInBatch - Users in current batch
     * @param {SubscriptionRefreshLogData} data - Progress data
     */
    batchProgress(batchNumber: number, totalBatches: number, usersInBatch: number, data: SubscriptionRefreshLogData): void;
    /**
     * Log error with categorization
     * @param {string} userId - User ID
     * @param {string} message - Error message
     * @param {SubscriptionRefreshLogData['error_category']} category - Error category
     * @param {Error} error - Error object
     */
    logError(userId: string, message: string, category: SubscriptionRefreshLogData['error_category'], error?: Error): void;
}
/**
 * Create a specialized logger for subscription refresh operations
 * @param {string} jobId - Optional job ID for tracking
 * @returns {SubscriptionRefreshLogger} Specialized logger instance
 */
export declare function createSubscriptionRefreshLogger(jobId?: string): SubscriptionRefreshLogger;
/**
 * Quick logging functions for common use cases
 */
export declare const log: {
    debug: (context: LogContext, message: string, metadata?: any) => void;
    info: (context: LogContext, message: string, metadata?: any) => void;
    warn: (context: LogContext, message: string, metadata?: any) => void;
    error: (context: LogContext, message: string, error?: Error, metadata?: any) => void;
    subscriptionRefresh: (level: LogLevel, message: string, metadata?: any) => void;
    scheduler: (level: LogLevel, message: string, metadata?: any) => void;
    spotifyApi: (level: LogLevel, message: string, metadata?: any) => void;
    database: (level: LogLevel, message: string, metadata?: any) => void;
    auth: (level: LogLevel, message: string, metadata?: any) => void;
    admin: (level: LogLevel, message: string, metadata?: any) => void;
};
export { globalLogger as logger };
/**
 * Configure global logger settings
 * @param {Partial<LoggerConfig>} config - Logger configuration
 */
export declare function configureLogger(config: Partial<LoggerConfig>): void;
/**
 * Get current logger configuration
 * @returns {LoggerConfig} Current logger configuration
 */
export declare function getLoggerConfig(): LoggerConfig;
//# sourceMappingURL=logger.d.ts.map