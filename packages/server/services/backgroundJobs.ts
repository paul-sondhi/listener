import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';

// Import node-cron for ES modules
import cron from 'node-cron';

// Import daily refresh scheduler services
import { 
  refreshAllUserSubscriptionsEnhanced, 
  BatchRefreshResult 
} from './subscriptionRefreshService.js';

// Import episode sync service
import { EpisodeSyncService } from './episodeSyncService.js';

// Import enhanced logging
import { log } from '../lib/logger.js';

// Job execution tracking
interface JobExecution {
  job_name: string;
  started_at: number;
  completed_at?: number;
  success: boolean;
  error?: string;
  records_processed: number;
  elapsed_ms: number;
}

// Lazy Supabase client initialization
let supabaseAdmin: SupabaseClient<Database> | null = null;

function _getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabaseAdmin;
}

/**
 * Log job execution details for monitoring
 * @param {JobExecution} execution - Job execution details
 */
function logJobExecution(execution: JobExecution): void {
  console.log(`BACKGROUND_JOB: ${JSON.stringify(execution)}`);
}

/**
 * Emit job metrics for monitoring
 * @param {string} jobName - Name of the job
 * @param {boolean} success - Whether the job succeeded
 * @param {number} recordsProcessed - Number of records processed
 * @param {number} elapsedMs - Job execution time in milliseconds
 */
function emitJobMetric(
  jobName: string, 
  success: boolean, 
  recordsProcessed: number, 
  elapsedMs: number
): void {
  const metricData = {
    metric: `background_job_execution`,
    job_name: jobName,
    success,
    records_processed: recordsProcessed,
    elapsed_ms: elapsedMs,
    timestamp: Date.now()
  };
  console.log(`METRIC: ${JSON.stringify(metricData)}`);
}

/**
 * Daily subscription refresh job
 * Syncs all user Spotify subscriptions and updates active/inactive status
 * Runs at midnight PT (Pacific Time) daily
 */
export async function dailySubscriptionRefreshJob(): Promise<void> {
  const startTime = Date.now();
  const jobName = 'daily_subscription_refresh';
  const jobId = `daily-${new Date().toISOString()}`;
  let recordsProcessed = 0;
  
  log.info('scheduler', `Starting ${jobName} job`, {
    job_id: jobId,
    component: 'background_jobs'
  });
  
  try {
    // Execute the batch refresh for all users
    log.info('subscription_refresh', 'Executing daily subscription refresh for all users', {
      job_id: jobId,
      component: 'batch_processor'
    });
    
    const result: BatchRefreshResult = await refreshAllUserSubscriptionsEnhanced();
    
    const elapsedMs = Date.now() - startTime;
    recordsProcessed = result.total_users;
    
    // Enhanced logging with structured data
    log.info('subscription_refresh', `Daily refresh processed ${result.total_users} users`, {
      job_id: jobId,
      total_users: result.total_users,
      successful_users: result.successful_users,
      failed_users: result.failed_users,
      success_rate: result.total_users > 0 ? (result.successful_users / result.total_users * 100).toFixed(1) : '0',
      duration_ms: elapsedMs,
      subscriptions: {
        total_active: result.summary.total_active_subscriptions,
        total_inactive: result.summary.total_inactive_subscriptions,
        auth_errors: result.summary.auth_errors,
        api_errors: result.summary.spotify_api_errors,
        database_errors: result.summary.database_errors
      }
    });
    
    if (result.failed_users > 0) {
      log.warn('subscription_refresh', 'Daily refresh completed with categorized errors', {
        job_id: jobId,
        error_categories: {
          auth_errors: result.summary.auth_errors,
          api_errors: result.summary.spotify_api_errors,
          database_errors: result.summary.database_errors,
          failed_users: result.failed_users,
          percentage: result.total_users > 0 ? (result.failed_users / result.total_users * 100).toFixed(1) : '0'
        }
      });
    }
    
    // Log successful execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: result.success,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs,
      ...((!result.success || result.failed_users > 0) && { 
        error: result.error || `${result.failed_users} users failed to sync` 
      })
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, result.success, recordsProcessed, elapsedMs);
    
    if (result.success) {
      log.info('scheduler', `Daily subscription refresh completed successfully`, {
        job_id: jobId,
        component: 'background_jobs',
        duration_ms: elapsedMs,
        users_processed: recordsProcessed,
        success_rate: result.total_users > 0 ? (result.successful_users / result.total_users * 100).toFixed(1) : '100'
      });
    } else {
      log.error('scheduler', `Daily subscription refresh completed with issues`, {
        job_id: jobId,
        component: 'background_jobs', 
        duration_ms: elapsedMs,
        error: result.error,
        users_processed: recordsProcessed,
        failed_users: result.failed_users
      });
    }
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const err = error as Error;
    
    log.error('scheduler', `Daily subscription refresh job failed with exception`, {
      job_id: jobId,
      component: 'background_jobs',
      duration_ms: elapsedMs,
      users_processed: recordsProcessed,
      error: err.message,
      stack_trace: err?.stack,
      job_name: jobName
    });
    
    // Log failed execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
  }
}

/**
 * Nightly episode sync job
 * Syncs new podcast episodes for all shows with active subscriptions
 * Runs at midnight PT (Pacific Time) daily
 */
export async function episodeSyncJob(): Promise<void> {
  const startTime = Date.now();
  const jobName = 'episode_sync';
  const jobId = `episode-sync-${new Date().toISOString()}`;
  let recordsProcessed = 0;
  
  log.info('scheduler', `Starting ${jobName} job`, {
    job_id: jobId,
    component: 'background_jobs'
  });
  
  try {
    // Initialize episode sync service with default logger
    const episodeSyncService = new EpisodeSyncService(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        info: (message: string, meta?: Record<string, unknown>) => {
          log.info('scheduler', message, { job_id: jobId, ...meta });
        },
        warn: (message: string, meta?: Record<string, unknown>) => {
          log.warn('scheduler', message, { job_id: jobId, ...meta });
        },
        error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
          log.error('scheduler', message, error, { job_id: jobId, ...meta });
        }
      }
    );
    
    // Execute the episode sync for all shows with active subscriptions
    log.info('scheduler', 'Executing nightly episode sync for all shows with active subscriptions', {
      job_id: jobId,
      component: 'episode_sync_service'
    });
    
    const result = await episodeSyncService.syncAllShows();
    
    const elapsedMs = Date.now() - startTime;
    recordsProcessed = result.totalShows;
    
    // Enhanced logging with structured data
    log.info('scheduler', `Episode sync processed ${result.totalShows} shows`, {
      job_id: jobId,
      total_shows: result.totalShows,
      successful_shows: result.successfulShows,
      failed_shows: result.failedShows,
      success_rate: result.totalShows > 0 ? (result.successfulShows / result.totalShows * 100).toFixed(1) : '0',
      duration_ms: elapsedMs,
      episodes: {
        total_upserted: result.totalEpisodesUpserted,
        avg_per_show: result.successfulShows > 0 ? (result.totalEpisodesUpserted / result.successfulShows).toFixed(1) : '0'
      }
    });
    
    if (result.failedShows > 0) {
      log.warn('scheduler', 'Episode sync completed with some failures', {
        job_id: jobId,
        failed_shows: result.failedShows,
        error_details: result.errors,
        percentage: result.totalShows > 0 ? (result.failedShows / result.totalShows * 100).toFixed(1) : '0'
      });
    }
    
    // Log successful execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: result.success,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs,
      ...((!result.success || result.failedShows > 0) && { 
        error: result.failedShows > 0 ? `${result.failedShows} shows failed to sync` : 'Episode sync failed'
      })
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, result.success, recordsProcessed, elapsedMs);
    
    if (result.success) {
      log.info('scheduler', `Episode sync completed successfully`, {
        job_id: jobId,
        component: 'background_jobs',
        duration_ms: elapsedMs,
        shows_processed: recordsProcessed,
        episodes_upserted: result.totalEpisodesUpserted,
        success_rate: result.totalShows > 0 ? (result.successfulShows / result.totalShows * 100).toFixed(1) : '100'
      });
    } else {
      log.error('scheduler', `Episode sync completed with issues`, {
        job_id: jobId,
        component: 'background_jobs', 
        duration_ms: elapsedMs,
        shows_processed: recordsProcessed,
        failed_shows: result.failedShows,
        errors: result.errors
      });
    }
    
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const err = error as Error;
    
    log.error('scheduler', `Episode sync job failed with exception`, {
      job_id: jobId,
      component: 'background_jobs',
      duration_ms: elapsedMs,
      shows_processed: recordsProcessed,
      error: err.message,
      stack_trace: err?.stack,
      job_name: jobName
    });
    
    // Log failed execution
    const execution: JobExecution = {
      job_name: jobName,
      started_at: startTime,
      completed_at: Date.now(),
      success: false,
      error: errorMessage,
      records_processed: recordsProcessed,
      elapsed_ms: elapsedMs
    };
    
    logJobExecution(execution);
    emitJobMetric(jobName, false, recordsProcessed, elapsedMs);
  }
}

/**
 * Initialize background job scheduling
 * Sets up cron jobs for daily subscription refresh and episode sync
 */
export function initializeBackgroundJobs(): void {
  console.log('BACKGROUND_JOBS: Initializing scheduled jobs');
  
  // Skip job scheduling in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('BACKGROUND_JOBS: Skipping job scheduling in test environment');
    return;
  }
  
  // Shared timezone configuration for all cron jobs
  const cronTimezone = process.env.CRON_TIMEZONE || 'America/Los_Angeles';
  
  // Daily subscription refresh job configuration
  const dailyRefreshEnabled = process.env.DAILY_REFRESH_ENABLED !== 'false';
  const dailyRefreshCron = process.env.DAILY_REFRESH_CRON || '30 0 * * *'; // Default: 12:30 AM PT
  
  if (dailyRefreshEnabled) {
    // Daily subscription refresh at configured time and timezone
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule(dailyRefreshCron, async () => {
      console.log('BACKGROUND_JOBS: Starting scheduled daily subscription refresh job');
      await dailySubscriptionRefreshJob();
    }, {
      scheduled: true,
      timezone: cronTimezone
    });
    console.log(`  - Daily subscription refresh: ${dailyRefreshCron} ${cronTimezone}`);
  } else {
    console.log('  - Daily subscription refresh: DISABLED');
  }
  
  // Episode sync job configuration
  const episodeSyncEnabled = process.env.EPISODE_SYNC_ENABLED !== 'false';
  const episodeSyncCron = process.env.EPISODE_SYNC_CRON || '0 1 * * *'; // Default: 1:00 AM PT
  
  if (episodeSyncEnabled) {
    // Nightly episode sync at configured time and timezone
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule(episodeSyncCron, async () => {
      console.log('BACKGROUND_JOBS: Starting scheduled episode sync job');
      await episodeSyncJob();
    }, {
      scheduled: true,
      timezone: cronTimezone
    });
    console.log(`  - Episode sync: ${episodeSyncCron} ${cronTimezone}`);
  } else {
    console.log('  - Episode sync: DISABLED');
  }
  
  console.log('BACKGROUND_JOBS: Background jobs scheduled successfully');
}

/**
 * Run a job manually (for testing or administrative purposes)
 * @param {string} jobName - Name of the job to run
 */
export async function runJob(jobName: string): Promise<void> {
  console.log(`BACKGROUND_JOBS: Manually running job: ${jobName}`);
  
  switch (jobName.toLowerCase()) {
    case 'daily_subscription_refresh':
    case 'subscription_refresh':
      await dailySubscriptionRefreshJob();
      break;
    case 'episode_sync':
      await episodeSyncJob();
      break;
    default:
      console.error(`BACKGROUND_JOBS: Unknown job name: ${jobName}`);
      throw new Error(`Unknown job: ${jobName}`);
  }
} 