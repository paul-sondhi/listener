import cron from 'node-cron';
import { refreshAllUserSubscriptionsEnhanced, BatchRefreshResult } from './subscriptionRefreshService.js';

// Scheduler configuration
interface SchedulerConfig {
    enabled: boolean;
    timezone: string;
    cronExpression: string;
    maxConcurrentJobs: number;
    jobTimeout: number; // milliseconds
}

// Job execution result tracking
interface ScheduledJobResult {
    jobId: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    success: boolean;
    result?: BatchRefreshResult;
    error?: string;
}

// Default configuration for daily refresh at midnight PT
const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    enabled: process.env.DAILY_REFRESH_ENABLED !== 'false', // Enabled by default, can be disabled via env var
    timezone: 'America/Los_Angeles', // Pacific Time (handles PST/PDT automatically)
    cronExpression: '15 13 * * *', // Every day at midnight (00:00)
    maxConcurrentJobs: 1, // Only allow one refresh job at a time
    jobTimeout: 1800000, // 30 minutes maximum execution time
};

// Global scheduler state
let schedulerTask: cron.ScheduledTask | null = null;
let currentJob: ScheduledJobResult | null = null;
let jobHistory: ScheduledJobResult[] = [];
const MAX_HISTORY_ENTRIES = 30; // Keep last 30 job executions

/**
 * Generate a unique job ID for tracking
 * @returns {string} Unique job ID with timestamp
 */
function generateJobId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `refresh-${timestamp}`;
}

/**
 * Get current Pacific Time information for logging
 * @returns {object} Pacific time details
 */
function getPacificTimeInfo(): { 
    currentTime: string; 
    timezone: string; 
    isDST: boolean; 
    offset: string; 
} {
    const now = new Date();
    const ptFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
    
    const ptTime = ptFormatter.format(now);
    const isDST = ptTime.includes('PDT'); // Pacific Daylight Time vs PST
    const offset = isDST ? 'UTC-7' : 'UTC-8';
    
    return {
        currentTime: ptTime,
        timezone: isDST ? 'PDT' : 'PST',
        isDST,
        offset
    };
}

/**
 * Log scheduler events with Pacific Time context
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
function logSchedulerEvent(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const ptInfo = getPacificTimeInfo();
    const logData = {
        timestamp: new Date().toISOString(),
        pacificTime: ptInfo.currentTime,
        timezone: ptInfo.timezone,
        message,
        ...data
    };
    
    const logPrefix = '[DailyRefreshScheduler]';
    
    switch (level) {
        case 'info':
            console.log(`${logPrefix} ${message}`, data ? logData : '');
            break;
        case 'warn':
            console.warn(`${logPrefix} ${message}`, data ? logData : '');
            break;
        case 'error':
            console.error(`${logPrefix} ${message}`, data ? logData : '');
            break;
    }
}

/**
 * Execute the daily subscription refresh job
 * Main function that runs at midnight PT daily
 */
async function executeScheduledRefresh(): Promise<void> {
    const jobId = generateJobId();
    const startTime = new Date();
    
    logSchedulerEvent('info', `Starting daily subscription refresh job: ${jobId}`);
    
    // Check if another job is already running
    if (currentJob && !currentJob.endTime) {
        logSchedulerEvent('warn', `Skipping scheduled refresh - job ${currentJob.jobId} is still running`, {
            currentJobId: currentJob.jobId,
            currentJobStartTime: currentJob.startTime
        });
        return;
    }
    
    // Initialize job tracking
    currentJob = {
        jobId,
        startTime,
        success: false
    };
    
    try {
        logSchedulerEvent('info', 'Executing daily subscription refresh for all users');
        
        // Execute the batch refresh with default configuration
        const result = await refreshAllUserSubscriptionsEnhanced();
        
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();
        
        // Update job result
        currentJob.endTime = endTime;
        currentJob.duration = duration;
        currentJob.success = result.success;
        currentJob.result = result;
        
        if (result.success) {
            logSchedulerEvent('info', `Daily subscription refresh completed successfully`, {
                jobId,
                duration: `${Math.round(duration / 1000)}s`,
                totalUsers: result.total_users,
                successfulUsers: result.successful_users,
                failedUsers: result.failed_users,
                activeSubscriptions: result.summary.total_active_subscriptions,
                inactiveSubscriptions: result.summary.total_inactive_subscriptions
            });
        } else {
            logSchedulerEvent('error', `Daily subscription refresh failed`, {
                jobId,
                duration: `${Math.round(duration / 1000)}s`,
                error: result.error
            });
        }
        
    } catch (error: unknown) {
        const err = error as Error;
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();
        
        // Update job result with error
        currentJob.endTime = endTime;
        currentJob.duration = duration;
        currentJob.success = false;
        currentJob.error = err.message;
        
        logSchedulerEvent('error', `Daily subscription refresh job failed with exception`, {
            jobId,
            duration: `${Math.round(duration / 1000)}s`,
            error: err.message,
            stack: err.stack
        });
    } finally {
        // Add job to history
        if (currentJob) {
            jobHistory.unshift({ ...currentJob });
            
            // Trim history to max entries
            if (jobHistory.length > MAX_HISTORY_ENTRIES) {
                jobHistory = jobHistory.slice(0, MAX_HISTORY_ENTRIES);
            }
        }
        
        // Clear current job
        currentJob = null;
    }
}

/**
 * Start the daily refresh scheduler
 * Sets up the cron job to run at midnight PT daily
 * @param {Partial<SchedulerConfig>} customConfig - Optional custom configuration
 */
export function startDailyRefreshScheduler(customConfig: Partial<SchedulerConfig> = {}): void {
    const config = { ...DEFAULT_SCHEDULER_CONFIG, ...customConfig };
    
    if (!config.enabled) {
        logSchedulerEvent('info', 'Daily refresh scheduler is disabled via configuration');
        return;
    }
    
    // Stop existing scheduler if running
    if (schedulerTask) {
        stopDailyRefreshScheduler();
    }
    
    logSchedulerEvent('info', 'Starting daily refresh scheduler', {
        cronExpression: config.cronExpression,
        timezone: config.timezone,
        maxConcurrentJobs: config.maxConcurrentJobs,
        jobTimeout: `${config.jobTimeout / 1000}s`
    });
    
    // Create the scheduled task
    schedulerTask = cron.schedule(
        config.cronExpression,
        async () => {
            const ptInfo = getPacificTimeInfo();
            logSchedulerEvent('info', `Cron job triggered at ${ptInfo.currentTime} (${ptInfo.timezone})`);
            
            // Execute with timeout protection
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Job timeout exceeded')), config.jobTimeout);
            });
            
            try {
                await Promise.race([
                    executeScheduledRefresh(),
                    timeoutPromise
                ]);
            } catch (error) {
                const err = error as Error;
                logSchedulerEvent('error', 'Scheduled refresh job timed out or failed', {
                    error: err.message,
                    timeout: `${config.jobTimeout / 1000}s`
                });
            }
        },
        {
            scheduled: false, // Don't start immediately
            timezone: config.timezone
        }
    );
    
    // Start the scheduler
    schedulerTask.start();
    
    const ptInfo = getPacificTimeInfo();
    logSchedulerEvent('info', `Daily refresh scheduler started successfully`, {
        nextRun: 'Next midnight PT',
        currentTime: ptInfo.currentTime,
        timezone: ptInfo.timezone,
        cronExpression: config.cronExpression
    });
}

/**
 * Stop the daily refresh scheduler
 * Stops the cron job and cleans up resources
 */
export function stopDailyRefreshScheduler(): void {
    if (schedulerTask) {
        schedulerTask.stop();
        // Use type assertion since destroy() method may not be in types but exists at runtime
        (schedulerTask as any).destroy?.();
        schedulerTask = null;
        
        logSchedulerEvent('info', 'Daily refresh scheduler stopped');
    } else {
        logSchedulerEvent('warn', 'Attempted to stop scheduler but no scheduler was running');
    }
}

/**
 * Get current scheduler status and job information
 * @returns {object} Scheduler status and job details
 */
export function getSchedulerStatus(): {
    isRunning: boolean;
    currentJob: ScheduledJobResult | null;
    recentJobs: ScheduledJobResult[];
    nextRun: string | null;
    pacificTime: ReturnType<typeof getPacificTimeInfo>;
} {
    const ptInfo = getPacificTimeInfo();
    
    return {
        isRunning: schedulerTask ? (schedulerTask as any).getStatus?.() === 'scheduled' : false,
        currentJob,
        recentJobs: jobHistory.slice(0, 10), // Last 10 jobs
        nextRun: schedulerTask ? 'Next midnight PT' : null,
        pacificTime: ptInfo
    };
}

/**
 * Manually trigger a subscription refresh (for testing/admin use)
 * @returns {Promise<BatchRefreshResult>} Result of the manual refresh
 */
export async function manualRefresh(): Promise<BatchRefreshResult> {
    logSchedulerEvent('info', 'Manual subscription refresh triggered');
    
    try {
        const result = await refreshAllUserSubscriptionsEnhanced();
        
        logSchedulerEvent('info', 'Manual subscription refresh completed', {
            success: result.success,
            totalUsers: result.total_users,
            successfulUsers: result.successful_users,
            failedUsers: result.failed_users
        });
        
        return result;
    } catch (error) {
        const err = error as Error;
        logSchedulerEvent('error', 'Manual subscription refresh failed', {
            error: err.message
        });
        throw error;
    }
}

/**
 * Get detailed job history for monitoring and debugging
 * @param {number} limit - Maximum number of jobs to return
 * @returns {ScheduledJobResult[]} Array of job results
 */
export function getJobHistory(limit: number = 10): ScheduledJobResult[] {
    return jobHistory.slice(0, Math.min(limit, jobHistory.length));
}

/**
 * Health check for the scheduler service
 * @returns {Promise<boolean>} True if scheduler is healthy
 */
export async function schedulerHealthCheck(): Promise<boolean> {
    try {
        const status = getSchedulerStatus();
        const isHealthy = status.isRunning;
        
        logSchedulerEvent('info', 'Scheduler health check', {
            healthy: isHealthy,
            isRunning: status.isRunning,
            currentJob: status.currentJob?.jobId || 'none',
            recentJobsCount: status.recentJobs.length
        });
        
        return isHealthy;
    } catch (error) {
        const err = error as Error;
        logSchedulerEvent('error', 'Scheduler health check failed', {
            error: err.message
        });
        return false;
    }
} 