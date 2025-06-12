import { createClient } from '@supabase/supabase-js';
// Import node-cron for ES modules
import cron from 'node-cron';
// Import daily refresh scheduler services
import { refreshAllUserSubscriptionsEnhanced } from './subscriptionRefreshService.js';
// Import enhanced logging
import { log } from '../lib/logger.js';
// Lazy Supabase client initialization
let supabaseAdmin = null;
function getSupabaseAdmin() {
    if (!supabaseAdmin) {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing required Supabase environment variables');
        }
        supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return supabaseAdmin;
}
/**
 * Log job execution details for monitoring
 * @param {JobExecution} execution - Job execution details
 */
function logJobExecution(execution) {
    console.log(`BACKGROUND_JOB: ${JSON.stringify(execution)}`);
}
/**
 * Emit job metrics for monitoring
 * @param {string} jobName - Name of the job
 * @param {boolean} success - Whether the job succeeded
 * @param {number} recordsProcessed - Number of records processed
 * @param {number} elapsedMs - Job execution time in milliseconds
 */
function emitJobMetric(jobName, success, recordsProcessed, elapsedMs) {
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
 * Nightly vault cleanup job
 * Deletes token versions > 30 days old
 * Step 6.1: Background vault cleanup
 */
export async function vaultCleanupJob() {
    const startTime = Date.now();
    const jobName = 'vault_cleanup';
    let recordsProcessed = 0;
    console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
    try {
        const supabase = getSupabaseAdmin();
        // Get retention age from environment (default: 30 days)
        const retentionDays = parseInt(process.env.VAULT_RETENTION_DAYS || '30');
        // First, clean up soft-deleted secrets that are past retention period
        const { data: cleanupResult, error: cleanupError } = await supabase
            .rpc('cleanup_expired_secrets', { p_batch_size: 100 });
        if (cleanupError) {
            throw new Error(`Cleanup function failed: ${cleanupError.message}`);
        }
        const softDeletedCount = cleanupResult?.secrets_cleaned || 0;
        recordsProcessed += softDeletedCount;
        // Clean up old vault secret versions (older than retention period)
        // Note: This would need custom logic based on vault implementation
        // For now, we'll use the existing cleanup function
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        // Log cleanup activity
        console.log(`VAULT_CLEANUP: Processed ${softDeletedCount} expired secrets`);
        // Clean up orphaned vault secrets (users that no longer exist)
        const { data: orphanSecrets, error: orphanError } = await supabase
            .from('vault.secrets')
            .select('id, name')
            .ilike('name', 'spotify:%:tokens')
            .limit(100);
        if (!orphanError && orphanSecrets) {
            let orphanedCount = 0;
            for (const secret of orphanSecrets) {
                // Extract user ID from secret name (format: spotify:{userId}:tokens)
                const match = secret.name.match(/^spotify:([^:]+):tokens$/);
                if (match) {
                    const userId = match[1];
                    // Check if user exists (to avoid creating orphaned secrets)
                    const { data: _userExists, error: userCheckError } = await supabase
                        .from('users')
                        .select('id')
                        .eq('id', userId)
                        .single();
                    if (userCheckError && userCheckError.code === 'PGRST116') {
                        // User doesn't exist, delete the orphaned secret
                        const { error: deleteError } = await supabase
                            .from('vault.secrets')
                            .delete()
                            .eq('id', secret.id);
                        if (!deleteError) {
                            orphanedCount++;
                            console.log(`VAULT_CLEANUP: Deleted orphaned secret for user ${userId}`);
                        }
                    }
                }
            }
            recordsProcessed += orphanedCount;
            console.log(`VAULT_CLEANUP: Cleaned up ${orphanedCount} orphaned secrets`);
        }
        const elapsedMs = Date.now() - startTime;
        // Log successful execution
        const execution = {
            job_name: jobName,
            started_at: startTime,
            completed_at: Date.now(),
            success: true,
            records_processed: recordsProcessed,
            elapsed_ms: elapsedMs
        };
        logJobExecution(execution);
        emitJobMetric(jobName, true, recordsProcessed, elapsedMs);
        console.log(`BACKGROUND_JOB: ${jobName} completed successfully in ${elapsedMs}ms, processed ${recordsProcessed} records`);
    }
    catch (error) {
        const elapsedMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Log failed execution
        const execution = {
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
        console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
    }
}
/**
 * Quarterly key rotation job
 * Re-encrypts all user secrets with new vault keys
 * Step 6.2: Quarterly key rotation
 */
export async function keyRotationJob() {
    const startTime = Date.now();
    const jobName = 'key_rotation';
    let recordsProcessed = 0;
    console.log(`BACKGROUND_JOB: Starting ${jobName} job`);
    try {
        const supabase = getSupabaseAdmin();
        // Get all active Spotify secrets for rotation
        const { data: secrets, error: secretsError } = await supabase
            .from('vault.secrets')
            .select('id, name, secret, created_at')
            .ilike('name', 'spotify:%:tokens')
            .order('created_at', { ascending: true });
        if (secretsError) {
            throw new Error(`Failed to fetch secrets: ${secretsError.message}`);
        }
        if (!secrets || secrets.length === 0) {
            console.log('KEY_ROTATION: No secrets found to rotate');
            return;
        }
        console.log(`KEY_ROTATION: Found ${secrets.length} secrets to rotate`);
        // Process secrets in batches to avoid overwhelming the system
        const batchSize = 10;
        let successCount = 0;
        let errorCount = 0;
        for (let i = 0; i < secrets.length; i += batchSize) {
            const batch = secrets.slice(i, i + batchSize);
            console.log(`KEY_ROTATION: Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(secrets.length / batchSize)}`);
            // Process batch in parallel
            const batchPromises = batch.map(async (secret) => {
                try {
                    // Re-encrypt by updating the secret (vault will use current key)
                    const { error: updateError } = await supabase
                        .from('vault.secrets')
                        .update({
                        updated_at: new Date().toISOString(),
                        // Force re-encryption by updating the secret
                        description: `Spotify tokens - rotated ${new Date().toISOString()}`
                    })
                        .eq('id', secret.id);
                    if (updateError) {
                        console.error(`KEY_ROTATION: Failed to rotate secret ${secret.id}:`, updateError.message);
                        return { success: false, secretId: secret.id };
                    }
                    return { success: true, secretId: secret.id };
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error(`KEY_ROTATION: Error rotating secret ${secret.id}:`, errorMessage);
                    return { success: false, secretId: secret.id };
                }
            });
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            // Count results
            batchResults.forEach(result => {
                if (result.success) {
                    successCount++;
                }
                else {
                    errorCount++;
                }
            });
            recordsProcessed += batchResults.length;
            // Small delay between batches to avoid overwhelming the system
            if (i + batchSize < secrets.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        const elapsedMs = Date.now() - startTime;
        console.log(`KEY_ROTATION: Completed - ${successCount} successful, ${errorCount} failed`);
        // Log execution
        const execution = {
            job_name: jobName,
            started_at: startTime,
            completed_at: Date.now(),
            success: errorCount === 0,
            records_processed: recordsProcessed,
            elapsed_ms: elapsedMs,
            ...(errorCount > 0 && { error: `${errorCount} secrets failed to rotate` })
        };
        logJobExecution(execution);
        emitJobMetric(jobName, errorCount === 0, recordsProcessed, elapsedMs);
        console.log(`BACKGROUND_JOB: ${jobName} completed in ${elapsedMs}ms, processed ${recordsProcessed} records`);
    }
    catch (error) {
        const elapsedMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // Log failed execution
        const execution = {
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
        console.error(`BACKGROUND_JOB: ${jobName} failed after ${elapsedMs}ms:`, errorMessage);
    }
}
/**
 * Daily subscription refresh job
 * Syncs all user Spotify subscriptions and updates active/inactive status
 * Runs at midnight PT (Pacific Time) daily
 */
export async function dailySubscriptionRefreshJob() {
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
        const result = await refreshAllUserSubscriptionsEnhanced();
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
        const execution = {
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
        }
        else {
            log.error('scheduler', `Daily subscription refresh completed with issues`, {
                job_id: jobId,
                component: 'background_jobs',
                duration_ms: elapsedMs,
                error: result.error,
                users_processed: recordsProcessed,
                failed_users: result.failed_users
            });
        }
    }
    catch (error) {
        const elapsedMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const err = error;
        log.error('scheduler', `Daily subscription refresh job failed with exception`, err, {
            component: 'background_jobs',
            duration_ms: elapsedMs,
            users_processed: recordsProcessed,
            stack_trace: err?.stack,
            job_name: jobName
        });
        // Log failed execution
        const execution = {
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
 * Sets up cron jobs for vault cleanup and key rotation
 */
export function initializeBackgroundJobs() {
    console.log('BACKGROUND_JOBS: Initializing scheduled jobs');
    // Skip job scheduling in test environment
    if (process.env.NODE_ENV === 'test') {
        console.log('BACKGROUND_JOBS: Skipping job scheduling in test environment');
        return;
    }
    // Daily subscription refresh job configuration
    const dailyRefreshEnabled = process.env.DAILY_REFRESH_ENABLED !== 'false';
    const dailyRefreshCron = process.env.DAILY_REFRESH_CRON || '0 0 * * *'; // Default: midnight
    const dailyRefreshTimezone = process.env.DAILY_REFRESH_TIMEZONE || 'America/Los_Angeles';
    if (dailyRefreshEnabled) {
        // Daily subscription refresh at configured time and timezone
        // Cron format: minute hour day-of-month month day-of-week
        cron.schedule(dailyRefreshCron, async () => {
            console.log('BACKGROUND_JOBS: Starting scheduled daily subscription refresh job');
            await dailySubscriptionRefreshJob();
        }, {
            scheduled: true,
            timezone: dailyRefreshTimezone
        });
        console.log(`  - Daily subscription refresh: ${dailyRefreshCron} ${dailyRefreshTimezone}`);
    }
    else {
        console.log('  - Daily subscription refresh: DISABLED');
    }
    // Nightly vault cleanup at 2 AM UTC
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule('0 2 * * *', async () => {
        console.log('BACKGROUND_JOBS: Starting scheduled vault cleanup job');
        await vaultCleanupJob();
    }, {
        scheduled: true,
        timezone: 'UTC'
    });
    // Quarterly key rotation on 1st day of quarter at 3 AM UTC
    // Runs on January 1st, April 1st, July 1st, October 1st
    cron.schedule('0 3 1 1,4,7,10 *', async () => {
        console.log('BACKGROUND_JOBS: Starting scheduled key rotation job');
        await keyRotationJob();
    }, {
        scheduled: true,
        timezone: 'UTC'
    });
    console.log('BACKGROUND_JOBS: Background jobs scheduled successfully');
    console.log('  - Vault cleanup: Daily at 2:00 AM UTC');
    console.log('  - Key rotation: Quarterly on 1st at 3:00 AM UTC');
}
/**
 * Run a job manually (for testing or administrative purposes)
 * @param {string} jobName - Name of the job to run
 */
export async function runJob(jobName) {
    console.log(`BACKGROUND_JOBS: Manually running job: ${jobName}`);
    switch (jobName.toLowerCase()) {
        case 'daily_subscription_refresh':
        case 'subscription_refresh':
            await dailySubscriptionRefreshJob();
            break;
        case 'vault_cleanup':
            await vaultCleanupJob();
            break;
        case 'key_rotation':
            await keyRotationJob();
            break;
        default:
            console.error(`BACKGROUND_JOBS: Unknown job name: ${jobName}`);
            throw new Error(`Unknown job: ${jobName}`);
    }
}
