/**
 * Configuration for the Transcript Worker
 * Reads and validates environment variables with sensible defaults
 */

export interface TranscriptWorkerConfig {
  /** Whether the transcript worker is enabled */
  enabled: boolean;
  /** Cron schedule string (e.g., '0 1 * * *' for 1 AM daily) */
  cronSchedule: string;
  /** Taddy API tier to use ('free' or 'business') */
  tier: 'free' | 'business';
  /** Hours to look back for new episodes */
  lookbackHours: number;
  /** Maximum Taddy API requests per run */
  maxRequests: number;
  /** Maximum concurrent requests */
  concurrency: number;
  /** Whether to use PostgreSQL advisory lock */
  useAdvisoryLock: boolean;
  /** When true, re-process last 10; when false, skip all; undefined = normal */
  last10Mode?: boolean;
}

/**
 * Parse and validate transcript worker configuration from environment variables
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export function getTranscriptWorkerConfig(): TranscriptWorkerConfig {
  // Parse enabled flag (default: true, disabled only if explicitly set to 'false')
  const enabled = process.env.TRANSCRIPT_WORKER_ENABLED !== 'false';

  // Parse cron schedule with validation
  const cronSchedule = process.env.TRANSCRIPT_WORKER_CRON || '0 1 * * *';
  if (!isValidCronExpression(cronSchedule)) {
    throw new Error(`Invalid TRANSCRIPT_WORKER_CRON: "${cronSchedule}". Must be a valid cron expression.`);
  }

  // Parse and validate tier
  const tierString = process.env.TRANSCRIPT_TIER || 'business';
  if (tierString !== 'free' && tierString !== 'business') {
    throw new Error(`Invalid TRANSCRIPT_TIER: "${tierString}". Must be either 'free' or 'business'.`);
  }
  const tier = tierString as 'free' | 'business';

  // Parse lookback hours with validation
  const lookbackHours = parseInt(process.env.TRANSCRIPT_LOOKBACK || '24', 10);
  if (isNaN(lookbackHours) || lookbackHours < 1 || lookbackHours > 168) { // 1 hour to 1 week
    throw new Error(`Invalid TRANSCRIPT_LOOKBACK: "${process.env.TRANSCRIPT_LOOKBACK}". Must be a number between 1 and 168 (hours).`);
  }

  // Parse max requests with validation
  const maxRequests = parseInt(process.env.TRANSCRIPT_MAX_REQUESTS || '15', 10);
  if (isNaN(maxRequests) || maxRequests < 1 || maxRequests > 100) {
    throw new Error(`Invalid TRANSCRIPT_MAX_REQUESTS: "${process.env.TRANSCRIPT_MAX_REQUESTS}". Must be a number between 1 and 100.`);
  }

  // Parse concurrency with validation
  const concurrency = parseInt(process.env.TRANSCRIPT_CONCURRENCY || '10', 10);
  if (isNaN(concurrency) || concurrency < 1 || concurrency > 50) {
    throw new Error(`Invalid TRANSCRIPT_CONCURRENCY: "${process.env.TRANSCRIPT_CONCURRENCY}". Must be a number between 1 and 50.`);
  }

  // Validate concurrency doesn't exceed maxRequests
  if (concurrency > maxRequests) {
    throw new Error(`TRANSCRIPT_CONCURRENCY (${concurrency}) cannot exceed TRANSCRIPT_MAX_REQUESTS (${maxRequests}).`);
  }

  // Parse advisory lock flag
  const useAdvisoryLock = process.env.TRANSCRIPT_ADVISORY_LOCK !== 'false';

  // Parse last10Mode flag
  let last10Mode: boolean | undefined;
  if (process.env.TRANSCRIPT_WORKER_L10 === 'true') last10Mode = true;
  else if (process.env.TRANSCRIPT_WORKER_L10 === 'false') last10Mode = false;

  return {
    enabled,
    cronSchedule,
    tier,
    lookbackHours,
    maxRequests,
    concurrency,
    useAdvisoryLock,
    last10Mode,
  };
}

/**
 * Basic cron expression validation
 * Checks for 5-part cron format: minute hour day-of-month month day-of-week
 * @param cronExpression - The cron expression to validate
 * @returns true if valid, false otherwise
 */
function isValidCronExpression(cronExpression: string): boolean {
  // Basic validation: must have exactly 5 parts separated by spaces
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  // Each part should be either a number, *, or contain valid cron characters
  return parts.every((part, index) => {
    // Allow more complex patterns for each field
    if (part === '*') return true;
    
    // Validate ranges for each field
    switch (index) {
      case 0: // minute (0-59)
        return /^(\*|([0-5]?\d)(-[0-5]?\d)?(,[0-5]?\d(-[0-5]?\d)?)*|(\*\/\d+))$/.test(part);
      case 1: // hour (0-23)
        return /^(\*|(1?\d|2[0-3])(-?(1?\d|2[0-3]))?(,(1?\d|2[0-3])(-?(1?\d|2[0-3]))?)*|(\*\/\d+))$/.test(part);
      case 2: // day of month (1-31)
        return /^(\*|([1-9]|[12]\d|3[01])(-?([1-9]|[12]\d|3[01]))?(,([1-9]|[12]\d|3[01])(-?([1-9]|[12]\d|3[01]))?)*|(\*\/\d+))$/.test(part);
      case 3: // month (1-12)
        return /^(\*|([1-9]|1[0-2])(-?([1-9]|1[0-2]))?(,([1-9]|1[0-2])(-?([1-9]|1[0-2]))?)*|(\*\/\d+))$/.test(part);
      case 4: // day of week (0-7, where both 0 and 7 represent Sunday)
        return /^(\*|[0-7](-?[0-7])?(,[0-7](-?[0-7])?)*|(\*\/\d+))$/.test(part);
      default:
        return false;
    }
  });
}

/**
 * Get a human-readable summary of the current configuration
 * Useful for logging and debugging
 */
export function getConfigSummary(config: TranscriptWorkerConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    schedule: config.cronSchedule,
    tier: config.tier,
    lookback_hours: config.lookbackHours,
    max_requests_per_run: config.maxRequests,
    max_concurrent: config.concurrency,
    advisory_lock: config.useAdvisoryLock,
    last10_mode: config.last10Mode,
  };
} 