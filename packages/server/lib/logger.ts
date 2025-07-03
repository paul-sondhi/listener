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
export type LogContext = 'subscription_refresh' | 'scheduler' | 'spotify_api' | 'database' | 'auth' | 'admin' | 'system';

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
 * Default logger configuration with environment-aware settings
 *
 * In test mode (NODE_ENV === 'test'), default to 'warn' to suppress debug/info logs unless LOG_LEVEL is explicitly set.
 */
const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
    minLevel: (process.env.LOG_LEVEL as LogLevel)
        // If LOG_LEVEL is not set, use 'warn' in test mode, otherwise 'debug' in dev, 'info' in prod
        || (process.env.NODE_ENV === 'test' ? 'warn' : (process.env.NODE_ENV === 'development' ? 'debug' : 'info')),
    enableConsoleLogging: true,
    enableStructuredLogging: process.env.NODE_ENV !== 'development', // JSON logs in production
    enableTimestamps: true,
    enableStackTraces: process.env.NODE_ENV === 'development',
    redactSensitiveData: process.env.NODE_ENV !== 'development'
};

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

/**
 * Sensitive data patterns to redact from logs
 */
const SENSITIVE_PATTERNS = [
    /access_token/i,
    /refresh_token/i,
    /client_secret/i,
    /password/i,
    /api_key/i,
    /bearer/i,
    /authorization/i
];

/**
 * Redact sensitive data from log objects
 * @param {any} data - Data to redact
 * @returns {any} Data with sensitive information redacted
 */
function redactSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
        return data;
    }
    
    if (Array.isArray(data)) {
        return data.map(redactSensitiveData);
    }
    
    const redacted = { ...data };
    
    for (const [key, value] of Object.entries(redacted)) {
        // Check if key matches sensitive patterns
        const isSensitiveKey = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
        
        if (isSensitiveKey) {
            redacted[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            redacted[key] = redactSensitiveData(value);
        } else if (typeof value === 'string' && value.length > 50) {
            // Check if string value looks like a token (long alphanumeric string)
            const tokenPattern = /^[a-zA-Z0-9_-]{20,}$/;
            if (tokenPattern.test(value)) {
                redacted[key] = '[REDACTED_TOKEN]';
            }
        }
    }
    
    return redacted;
}

/**
 * Core logger class with comprehensive logging functionality
 */
export class Logger {
    private config: LoggerConfig;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    }

    /**
     * Check if a log level should be logged based on minimum level
     * @param {LogLevel} level - Log level to check
     * @returns {boolean} Whether the level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
    }

    /**
     * Create a structured log entry
     * @param {LogLevel} level - Log level
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     * @returns {LogEntry} Structured log entry
     */
    private createLogEntry(
        level: LogLevel,
        context: LogContext,
        message: string,
        additional: Partial<LogEntry> = {}
    ): LogEntry {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            context,
            message,
            ...additional
        };

        // Redact sensitive data if enabled
        if (this.config.redactSensitiveData && entry.metadata) {
            entry.metadata = redactSensitiveData(entry.metadata);
        }

        return entry;
    }

    /**
     * Output a log entry to console with proper formatting
     * @param {LogEntry} entry - Log entry to output
     */
    private outputLog(entry: LogEntry): void {
        if (!this.shouldLog(entry.level) || !this.config.enableConsoleLogging) {
            return;
        }

        const logFunction = this.getConsoleFunction(entry.level);
        
        if (this.config.enableStructuredLogging) {
            // JSON structured logging for production
            logFunction(JSON.stringify(entry));
        } else {
            // Human-readable logging for development
            const timestamp = this.config.enableTimestamps ? `[${entry.timestamp}] ` : '';
            const contextPrefix = `[${entry.context.toUpperCase()}]`;
            const componentSuffix = entry.component ? ` (${entry.component})` : '';
            const userSuffix = entry.user_id ? ` [User: ${entry.user_id}]` : '';
            const durationSuffix = entry.duration_ms ? ` (${entry.duration_ms}ms)` : '';
            
            const prefix = `${timestamp}${contextPrefix}${componentSuffix}${userSuffix}`;
            const suffix = durationSuffix;
            
            if (entry.metadata) {
                logFunction(`${prefix} ${entry.message}${suffix}`, entry.metadata);
            } else {
                logFunction(`${prefix} ${entry.message}${suffix}`);
            }
        }
    }

    /**
     * Get appropriate console function for log level
     * @param {LogLevel} level - Log level
     * @returns {(...args: any[]) => void} Console function
     */
    private getConsoleFunction(level: LogLevel): (...args: any[]) => void {
        switch (level) {
            case 'debug':
                return console.debug;
            case 'info':
                return console.log;
            case 'warn':
                return console.warn;
            case 'error':
                return console.error;
            default:
                return console.log;
        }
    }

    /**
     * Log a debug message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    debug(context: LogContext, message: string, additional: Partial<LogEntry> = {}): void {
        const entry = this.createLogEntry('debug', context, message, additional);
        this.outputLog(entry);
    }

    /**
     * Log an info message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    info(context: LogContext, message: string, additional: Partial<LogEntry> = {}): void {
        const entry = this.createLogEntry('info', context, message, additional);
        this.outputLog(entry);
    }

    /**
     * Log a warning message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    warn(context: LogContext, message: string, additional: Partial<LogEntry> = {}): void {
        const entry = this.createLogEntry('warn', context, message, additional);
        this.outputLog(entry);
    }

    /**
     * Log an error message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    error(context: LogContext, message: string, additional: Partial<LogEntry> = {}): void {
        const entry = this.createLogEntry('error', context, message, additional);
        this.outputLog(entry);
    }
}

// Global logger instance
const globalLogger = new Logger();

/**
 * Specialized logger for subscription refresh operations
 */
export class SubscriptionRefreshLogger {
    private logger: Logger;
    private jobId?: string;

    constructor(jobId?: string, config: Partial<LoggerConfig> = {}) {
        this.logger = new Logger(config);
        this.jobId = jobId;
    }

    /**
     * Log subscription refresh start
     * @param {string} userId - User ID
     * @param {Partial<SubscriptionRefreshLogData>} data - Additional data
     */
    refreshStart(userId: string, data: Partial<SubscriptionRefreshLogData> = {}): void {
        const logEntry: Partial<LogEntry> = {
            component: 'refresh_service',
            user_id: userId,
            metadata: {
                subscription_data: data
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        this.logger.info('subscription_refresh', 'Starting subscription refresh', logEntry);
    }

    /**
     * Log subscription refresh completion
     * @param {string} userId - User ID
     * @param {boolean} success - Whether refresh succeeded
     * @param {SubscriptionRefreshLogData} data - Refresh data
     */
    refreshComplete(userId: string, success: boolean, data: SubscriptionRefreshLogData): void {
        const logEntry: Partial<LogEntry> = {
            component: 'refresh_service',
            user_id: userId,
            success,
            metadata: {
                subscription_data: data
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        if (data.processing_time_ms !== undefined) {
            logEntry.duration_ms = data.processing_time_ms;
        }
        this.logger.info('subscription_refresh', 
            success ? 'Subscription refresh completed successfully' : 'Subscription refresh failed',
            logEntry
        );
    }

    /**
     * Log Spotify API interaction
     * @param {string} userId - User ID
     * @param {string} endpoint - API endpoint
     * @param {boolean} success - Whether API call succeeded
     * @param {number} duration - API call duration
     * @param {string} error - Error message if failed
     */
    spotifyApiCall(userId: string, endpoint: string, success: boolean, duration: number, error?: string): void {
        const logEntry: Partial<LogEntry> = {
            component: 'spotify_client',
            user_id: userId,
            success,
            duration_ms: duration,
            metadata: {
                endpoint,
                api_call: true
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        if (error) {
            logEntry.error = error;
        }
        this.logger.info('spotify_api', 
            success ? `Spotify API call successful: ${endpoint}` : `Spotify API call failed: ${endpoint}`,
            logEntry
        );
    }

    /**
     * Log database operation
     * @param {string} userId - User ID
     * @param {string} operation - Database operation
     * @param {boolean} success - Whether operation succeeded
     * @param {number} recordsAffected - Number of records affected
     * @param {string} error - Error message if failed
     */
    databaseOperation(userId: string, operation: string, success: boolean, recordsAffected: number, error?: string): void {
        const logEntry: Partial<LogEntry> = {
            component: 'database_client',
            user_id: userId,
            success,
            metadata: {
                operation,
                records_affected: recordsAffected,
                database_operation: true
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        if (error) {
            logEntry.error = error;
        }
        this.logger.info('database', 
            success ? `Database operation successful: ${operation}` : `Database operation failed: ${operation}`,
            logEntry
        );
    }

    /**
     * Log batch processing progress
     * @param {number} batchNumber - Current batch number
     * @param {number} totalBatches - Total number of batches
     * @param {number} usersInBatch - Users in current batch
     * @param {SubscriptionRefreshLogData} data - Progress data
     */
    batchProgress(batchNumber: number, totalBatches: number, usersInBatch: number, data: SubscriptionRefreshLogData): void {
        const logEntry: Partial<LogEntry> = {
            component: 'batch_processor',
            metadata: {
                batch_number: batchNumber,
                total_batches: totalBatches,
                users_in_batch: usersInBatch,
                subscription_data: data
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        this.logger.info('subscription_refresh', `Processing batch ${batchNumber}/${totalBatches} (${usersInBatch} users)`, logEntry);
    }

    /**
     * Log error with categorization
     * @param {string} userId - User ID
     * @param {string} message - Error message
     * @param {SubscriptionRefreshLogData['error_category']} category - Error category
     * @param {Error} error - Error object
     */
    logError(userId: string, message: string, category: SubscriptionRefreshLogData['error_category'], error?: Error): void {
        const logEntry: Partial<LogEntry> = {
            component: 'refresh_service',
            user_id: userId,
            metadata: {
                error_category: category,
                stack_trace: this.logger['config'].enableStackTraces ? error?.stack : undefined,
                subscription_data: {
                    error_category: category
                }
            }
        };
        if (this.jobId) {
            logEntry.job_id = this.jobId;
        }
        if (error?.message) {
            logEntry.error = error.message;
        }
        this.logger.error('subscription_refresh', message, logEntry);
    }
}

/**
 * Create a specialized logger for subscription refresh operations
 * @param {string} jobId - Optional job ID for tracking
 * @returns {SubscriptionRefreshLogger} Specialized logger instance
 */
export function createSubscriptionRefreshLogger(jobId?: string): SubscriptionRefreshLogger {
    return new SubscriptionRefreshLogger(jobId);
}

/**
 * Quick logging functions for common use cases
 */
export const log = {
    debug: (context: LogContext, message: string, metadata?: any) => 
        globalLogger.debug(context, message, { metadata }),
    
    info: (context: LogContext, message: string, metadata?: any) => 
        globalLogger.info(context, message, { metadata }),
    
    warn: (context: LogContext, message: string, metadata?: any) => 
        globalLogger.warn(context, message, { metadata }),
    
    error: (context: LogContext, message: string, error?: Error, metadata?: any) => {
        const logEntry: Partial<LogEntry> = {
            metadata: {
                ...metadata,
                stack_trace: error?.stack
            }
        };
        if (error?.message) {
            logEntry.error = error.message;
        }
        globalLogger.error(context, message, logEntry);
    },

    // Convenience methods for specific contexts
    subscriptionRefresh: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('subscription_refresh', message, { metadata }),
    
    scheduler: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('scheduler', message, { metadata }),
    
    spotifyApi: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('spotify_api', message, { metadata }),
    
    database: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('database', message, { metadata }),
    
    auth: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('auth', message, { metadata }),
    
    admin: (level: LogLevel, message: string, metadata?: any) =>
        globalLogger[level]('admin', message, { metadata })
};

// Export the global logger instance for direct use
export { globalLogger as logger };

/**
 * Configure global logger settings
 * @param {Partial<LoggerConfig>} config - Logger configuration
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
    Object.assign(globalLogger['config'], config);
}

/**
 * Get current logger configuration
 * @returns {LoggerConfig} Current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
    return { ...DEFAULT_LOGGER_CONFIG };
}

/**
 * Create a new generic logger instance
 * @param {Partial<LoggerConfig>} config - Optional logger configuration
 * @returns {Logger} New logger instance
 */
export function createLogger(config: Partial<LoggerConfig> = {}): Logger {
    return new Logger(config);
} 