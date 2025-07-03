/**
 * Simple Client-Side Logger
 * 
 * Provides consistent logging interface for the client application
 * with proper log levels and environment-aware behavior.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration for client-side logging
 */
interface ClientLoggerConfig {
  minLevel: LogLevel;
  enableLogging: boolean;
  prefix?: string;
}

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
 * Default configuration based on environment
 */
const DEFAULT_CONFIG: ClientLoggerConfig = {
  minLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
  enableLogging: true,
  prefix: '[Client]'
};

/**
 * Simple client-side logger class
 */
class ClientLogger {
  private config: ClientLoggerConfig;

  constructor(config: Partial<ClientLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a log level should be logged based on minimum level
   */
  private shouldLog(level: LogLevel): boolean {
    return this.config.enableLogging && 
           LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format log message with prefix and timestamp
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = this.config.prefix ? `${this.config.prefix} ` : '';
    return `${prefix}[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Debug level logging
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  /**
   * Info level logging
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      // eslint-disable-next-line no-console
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  /**
   * Error level logging
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('error', message), ...args);
    }
  }
}

/**
 * Default logger instance for the client application
 */
export const logger = new ClientLogger();

/**
 * Create a logger with custom configuration
 */
export const createLogger = (config: Partial<ClientLoggerConfig> = {}): ClientLogger => {
  return new ClientLogger(config);
}; 