/**
 * Configuration for the Send Newsletter Worker
 * Reads and validates environment variables with sensible defaults
 */

export interface SendNewsletterWorkerConfig {
  /** Whether the send newsletter worker is enabled */
  enabled: boolean;
  /** Cron schedule string (e.g., '0 5 * * 1-5' for 5 AM PT Monday-Friday) */
  cronSchedule: string;
  /** Hours to look back for newsletter editions to send */
  lookbackHours: number;
  /** When true, send the 10 most recent newsletter editions to test email (testing mode); when false, run in normal mode */
  last10Mode: boolean;
  /** Resend API key (required) */
  resendApiKey: string;
  /** Email address to send from (required) */
  sendFromEmail: string;
  /** Sender name to display in email clients (optional, defaults to email domain) */
  sendFromName: string;
  /** Email address to send test emails to when in L10 mode (required) */
  testReceiverEmail: string;
  /** Email address for replies (optional, defaults to sendFromEmail) */
  replyToEmail?: string;
}

/**
 * Parse and validate send newsletter worker configuration from environment variables
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export function getSendNewsletterWorkerConfig(): SendNewsletterWorkerConfig {
  // Parse enabled flag (default: true, disabled only if explicitly set to 'false')
  const enabled = process.env.SEND_WORKER_ENABLED !== 'false';

  // Parse cron schedule with validation
  const cronSchedule = process.env.SEND_WORKER_CRON || '0 5 * * 1-5';
  if (!isValidCronExpression(cronSchedule)) {
    throw new Error(`Invalid SEND_WORKER_CRON: "${cronSchedule}". Must be a valid cron expression.`);
  }

  // Parse lookback hours with validation
  const lookbackHours = parseInt(process.env.SEND_LOOKBACK || '24', 10);
  if (isNaN(lookbackHours) || lookbackHours < 1 || lookbackHours > 168) { // 1 hour to 1 week
    throw new Error(`Invalid SEND_LOOKBACK: "${process.env.SEND_LOOKBACK}". Must be a number between 1 and 168 (hours).`);
  }

  // Parse last10Mode flag (strict boolean semantics) – any value other than the string "true" yields false
  const last10Mode: boolean = process.env.SEND_WORKER_L10 === 'true';

  // Validate Resend API key first (required)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || resendApiKey.trim().length === 0) {
    throw new Error('RESEND_API_KEY environment variable is required but not set.');
  }

  // Validate API key format (basic check)
  if (!resendApiKey.startsWith('re_')) {
    console.warn('Warning: RESEND_API_KEY does not start with "re_" - this may not be a valid Resend API key.');
  }

  // Validate send from email (required)
  const sendFromEmail = process.env.SEND_FROM_EMAIL;
  if (!sendFromEmail || sendFromEmail.trim().length === 0) {
    throw new Error('SEND_FROM_EMAIL environment variable is required but not set.');
  }

  // Trim and validate email format
  const trimmedSendFromEmail = sendFromEmail.trim();
  if (!isValidEmail(trimmedSendFromEmail)) {
    throw new Error(`Invalid SEND_FROM_EMAIL: "${sendFromEmail}". Must be a valid email address.`);
  }

  // Parse sender name (optional, defaults to empty string which will use email domain)
  const sendFromName = process.env.SEND_FROM_NAME || '';

  // Validate test receiver email (required for L10 mode, but we'll validate it's set)
  const testReceiverEmail = process.env.TEST_RECEIVER_EMAIL;
  if (!testReceiverEmail || testReceiverEmail.trim().length === 0) {
    throw new Error('TEST_RECEIVER_EMAIL environment variable is required but not set.');
  }

  // Trim and validate email format for test receiver
  const trimmedTestReceiverEmail = testReceiverEmail.trim();
  if (!isValidEmail(trimmedTestReceiverEmail)) {
    throw new Error(`Invalid TEST_RECEIVER_EMAIL: "${testReceiverEmail}". Must be a valid email address.`);
  }

  // Parse reply-to email (optional, defaults to sendFromEmail if not set)
  let replyToEmail: string | undefined;
  const rawReplyToEmail = process.env.REPLY_TO_EMAIL;
  if (rawReplyToEmail && rawReplyToEmail.trim().length > 0) {
    const trimmedReplyToEmail = rawReplyToEmail.trim();
    if (!isValidEmail(trimmedReplyToEmail)) {
      throw new Error(`Invalid REPLY_TO_EMAIL: "${rawReplyToEmail}". Must be a valid email address.`);
    }
    replyToEmail = trimmedReplyToEmail;
  }

  return {
    enabled,
    cronSchedule,
    lookbackHours,
    last10Mode,
    resendApiKey: resendApiKey.trim(),
    sendFromEmail: trimmedSendFromEmail,
    sendFromName,
    testReceiverEmail: trimmedTestReceiverEmail,
    replyToEmail,
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
 * Basic email validation
 * @param email - The email address to validate
 * @returns true if valid, false otherwise
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get a human-readable summary of the current configuration
 * Useful for logging and debugging (excludes sensitive data like API keys)
 */
export function getConfigSummary(config: SendNewsletterWorkerConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    cron_schedule: config.cronSchedule,
    lookback_hours: config.lookbackHours,
    last10_mode: config.last10Mode,
    send_from_email: config.sendFromEmail,
    send_from_name: config.sendFromName,
    test_receiver_email: config.testReceiverEmail,
    reply_to_email: config.replyToEmail || 'not set (defaults to send_from_email)',
    resend_api_key_configured: config.resendApiKey.length > 0,
    resend_api_key_prefix: config.resendApiKey.substring(0, 6) + '...',
  };
}

/**
 * Validate that all required dependencies are available
 * @param config - The configuration to validate
 * @throws Error if any dependencies are missing or invalid
 */
export function validateDependencies(config: SendNewsletterWorkerConfig): void {
  // Check that required environment variables are set
  if (!config.resendApiKey) {
    throw new Error('RESEND_API_KEY is required but not configured.');
  }

  if (!config.sendFromEmail) {
    throw new Error('SEND_FROM_EMAIL is required but not configured.');
  }

  if (!config.testReceiverEmail) {
    throw new Error('TEST_RECEIVER_EMAIL is required but not configured.');
  }

  // Validate email addresses
  if (!isValidEmail(config.sendFromEmail)) {
    throw new Error(`SEND_FROM_EMAIL is not a valid email address: ${config.sendFromEmail}`);
  }

  if (!isValidEmail(config.testReceiverEmail)) {
    throw new Error(`TEST_RECEIVER_EMAIL is not a valid email address: ${config.testReceiverEmail}`);
  }

  // Validate reply-to email if provided
  if (config.replyToEmail && !isValidEmail(config.replyToEmail)) {
    throw new Error(`REPLY_TO_EMAIL is not a valid email address: ${config.replyToEmail}`);
  }

  // Validate cron schedule
  if (!isValidCronExpression(config.cronSchedule)) {
    throw new Error(`Invalid cron schedule: ${config.cronSchedule}`);
  }
} 