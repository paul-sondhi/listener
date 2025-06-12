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
/**
 * Default logger configuration with environment-aware settings
 */
const DEFAULT_LOGGER_CONFIG = {
    minLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    enableConsoleLogging: true,
    enableStructuredLogging: process.env.NODE_ENV !== 'development', // JSON logs in production
    enableTimestamps: true,
    enableStackTraces: process.env.NODE_ENV === 'development',
    redactSensitiveData: process.env.NODE_ENV !== 'development'
};
/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY = {
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
function redactSensitiveData(data) {
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
        }
        else if (typeof value === 'object' && value !== null) {
            redacted[key] = redactSensitiveData(value);
        }
        else if (typeof value === 'string' && value.length > 50) {
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
class Logger {
    constructor(config = {}) {
        this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    }
    /**
     * Check if a log level should be logged based on minimum level
     * @param {LogLevel} level - Log level to check
     * @returns {boolean} Whether the level should be logged
     */
    shouldLog(level) {
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
    createLogEntry(level, context, message, additional = {}) {
        const entry = {
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
    outputLog(entry) {
        if (!this.shouldLog(entry.level) || !this.config.enableConsoleLogging) {
            return;
        }
        const logFunction = this.getConsoleFunction(entry.level);
        if (this.config.enableStructuredLogging) {
            // JSON structured logging for production
            logFunction(JSON.stringify(entry));
        }
        else {
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
            }
            else {
                logFunction(`${prefix} ${entry.message}${suffix}`);
            }
        }
    }
    /**
     * Get appropriate console function for log level
     * @param {LogLevel} level - Log level
     * @returns {(...args: any[]) => void} Console function
     */
    getConsoleFunction(level) {
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
    debug(context, message, additional = {}) {
        const entry = this.createLogEntry('debug', context, message, additional);
        this.outputLog(entry);
    }
    /**
     * Log an info message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    info(context, message, additional = {}) {
        const entry = this.createLogEntry('info', context, message, additional);
        this.outputLog(entry);
    }
    /**
     * Log a warning message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    warn(context, message, additional = {}) {
        const entry = this.createLogEntry('warn', context, message, additional);
        this.outputLog(entry);
    }
    /**
     * Log an error message
     * @param {LogContext} context - Log context
     * @param {string} message - Log message
     * @param {Partial<LogEntry>} additional - Additional log data
     */
    error(context, message, additional = {}) {
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
    constructor(jobId, config = {}) {
        this.logger = new Logger(config);
        this.jobId = jobId;
    }
    /**
     * Log subscription refresh start
     * @param {string} userId - User ID
     * @param {Partial<SubscriptionRefreshLogData>} data - Additional data
     */
    refreshStart(userId, data = {}) {
        const logEntry = {
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
    refreshComplete(userId, success, data) {
        const logEntry = {
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
        this.logger.info('subscription_refresh', success ? 'Subscription refresh completed successfully' : 'Subscription refresh failed', logEntry);
    }
    /**
     * Log Spotify API interaction
     * @param {string} userId - User ID
     * @param {string} endpoint - API endpoint
     * @param {boolean} success - Whether API call succeeded
     * @param {number} duration - API call duration
     * @param {string} error - Error message if failed
     */
    spotifyApiCall(userId, endpoint, success, duration, error) {
        const logEntry = {
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
        this.logger.info('spotify_api', success ? `Spotify API call successful: ${endpoint}` : `Spotify API call failed: ${endpoint}`, logEntry);
    }
    /**
     * Log database operation
     * @param {string} userId - User ID
     * @param {string} operation - Database operation
     * @param {boolean} success - Whether operation succeeded
     * @param {number} recordsAffected - Number of records affected
     * @param {string} error - Error message if failed
     */
    databaseOperation(userId, operation, success, recordsAffected, error) {
        const logEntry = {
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
        this.logger.info('database', success ? `Database operation successful: ${operation}` : `Database operation failed: ${operation}`, logEntry);
    }
    /**
     * Log batch processing progress
     * @param {number} batchNumber - Current batch number
     * @param {number} totalBatches - Total number of batches
     * @param {number} usersInBatch - Users in current batch
     * @param {SubscriptionRefreshLogData} data - Progress data
     */
    batchProgress(batchNumber, totalBatches, usersInBatch, data) {
        const logEntry = {
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
    logError(userId, message, category, error) {
        const logEntry = {
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
export function createSubscriptionRefreshLogger(jobId) {
    return new SubscriptionRefreshLogger(jobId);
}
/**
 * Quick logging functions for common use cases
 */
export const log = {
    debug: (context, message, metadata) => globalLogger.debug(context, message, { metadata }),
    info: (context, message, metadata) => globalLogger.info(context, message, { metadata }),
    warn: (context, message, metadata) => globalLogger.warn(context, message, { metadata }),
    error: (context, message, error, metadata) => {
        const logEntry = {
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
    subscriptionRefresh: (level, message, metadata) => globalLogger[level]('subscription_refresh', message, { metadata }),
    scheduler: (level, message, metadata) => globalLogger[level]('scheduler', message, { metadata }),
    spotifyApi: (level, message, metadata) => globalLogger[level]('spotify_api', message, { metadata }),
    database: (level, message, metadata) => globalLogger[level]('database', message, { metadata }),
    auth: (level, message, metadata) => globalLogger[level]('auth', message, { metadata }),
    admin: (level, message, metadata) => globalLogger[level]('admin', message, { metadata })
};
// Export the global logger instance for direct use
export { globalLogger as logger };
/**
 * Configure global logger settings
 * @param {Partial<LoggerConfig>} config - Logger configuration
 */
export function configureLogger(config) {
    Object.assign(globalLogger['config'], config);
}
/**
 * Get current logger configuration
 * @returns {LoggerConfig} Current logger configuration
 */
export function getLoggerConfig() {
    return { ...globalLogger['config'] };
}
