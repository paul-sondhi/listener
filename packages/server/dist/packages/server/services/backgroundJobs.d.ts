/**
 * Nightly vault cleanup job
 * Deletes token versions > 30 days old
 * Step 6.1: Background vault cleanup
 */
export declare function vaultCleanupJob(): Promise<void>;
/**
 * Quarterly key rotation job
 * Re-encrypts all user secrets with new vault keys
 * Step 6.2: Quarterly key rotation
 */
export declare function keyRotationJob(): Promise<void>;
/**
 * Daily subscription refresh job
 * Syncs all user Spotify subscriptions and updates active/inactive status
 * Runs at midnight PT (Pacific Time) daily
 */
export declare function dailySubscriptionRefreshJob(): Promise<void>;
/**
 * Initialize background job scheduling
 * Sets up cron jobs for vault cleanup and key rotation
 */
export declare function initializeBackgroundJobs(): void;
/**
 * Run a job manually (for testing or administrative purposes)
 * @param {string} jobName - Name of the job to run
 */
export declare function runJob(jobName: string): Promise<void>;
//# sourceMappingURL=backgroundJobs.d.ts.map