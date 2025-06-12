import { BatchRefreshResult } from './subscriptionRefreshService.js';
interface SchedulerConfig {
    enabled: boolean;
    timezone: string;
    cronExpression: string;
    maxConcurrentJobs: number;
    jobTimeout: number;
}
interface ScheduledJobResult {
    jobId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    success: boolean;
    result?: BatchRefreshResult;
    error?: string;
}
/**
 * Get current Pacific Time information for logging
 * @returns {object} Pacific time details
 */
declare function getPacificTimeInfo(): {
    currentTime: string;
    timezone: string;
    isDST: boolean;
    offset: string;
};
/**
 * Start the daily refresh scheduler
 * Sets up the cron job to run at midnight PT daily
 * @param {Partial<SchedulerConfig>} customConfig - Optional custom configuration
 */
export declare function startDailyRefreshScheduler(customConfig?: Partial<SchedulerConfig>): void;
/**
 * Stop the daily refresh scheduler
 * Stops the cron job and cleans up resources
 */
export declare function stopDailyRefreshScheduler(): void;
/**
 * Get current scheduler status and job information
 * @returns {object} Scheduler status and job details
 */
export declare function getSchedulerStatus(): {
    isRunning: boolean;
    currentJob: ScheduledJobResult | null;
    recentJobs: ScheduledJobResult[];
    nextRun: string | null;
    pacificTime: ReturnType<typeof getPacificTimeInfo>;
};
/**
 * Manually trigger a subscription refresh (for testing/admin use)
 * @returns {Promise<BatchRefreshResult>} Result of the manual refresh
 */
export declare function manualRefresh(): Promise<BatchRefreshResult>;
/**
 * Get detailed job history for monitoring and debugging
 * @param {number} limit - Maximum number of jobs to return
 * @returns {ScheduledJobResult[]} Array of job results
 */
export declare function getJobHistory(limit?: number): ScheduledJobResult[];
/**
 * Health check for the scheduler service
 * @returns {Promise<boolean>} True if scheduler is healthy
 */
export declare function schedulerHealthCheck(): Promise<boolean>;
export {};
//# sourceMappingURL=refreshScheduler.d.ts.map