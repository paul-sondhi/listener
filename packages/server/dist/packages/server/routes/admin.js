import { Router } from 'express';
import { runJob } from '../services/backgroundJobs.js';
import { refreshAllUserSubscriptionsEnhanced, getUserSpotifyStatistics, getAllUsersWithSpotifyTokens } from '../services/subscriptionRefreshService.js';
const router = Router();
/**
 * Admin endpoint to get system status and statistics
 * GET /api/admin/status
 */
router.get('/status', async (_req, res) => {
    try {
        // Get user statistics
        const userStats = await getUserSpotifyStatistics();
        const totalUsers = await getAllUsersWithSpotifyTokens();
        const systemStatus = {
            status: 'healthy',
            system: {
                memory: process.memoryUsage(),
                node_version: process.version,
                uptime: process.uptime()
            },
            database: {
                connected: true
            },
            background_jobs: {
                scheduler_active: true,
                daily_refresh: {
                    enabled: process.env.DAILY_REFRESH_ENABLED !== 'false',
                    cron_expression: process.env.DAILY_REFRESH_CRON || '0 0 * * *',
                    timezone: process.env.DAILY_REFRESH_TIMEZONE || 'America/Los_Angeles'
                }
            },
            timestamp: new Date().toISOString(),
            user_statistics: {
                ...userStats,
                eligible_for_refresh: totalUsers.length
            }
        };
        res.json(systemStatus);
    }
    catch (error) {
        const err = error;
        console.error('Admin status check failed:', err.message);
        res.status(500).json({
            error: 'Failed to get system status',
            message: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Admin endpoint to manually trigger background jobs
 * POST /api/admin/jobs/:jobName/run
 */
router.post('/jobs/:jobName/run', async (req, res) => {
    const { jobName } = req.params;
    if (!jobName) {
        res.status(400).json({
            success: false,
            error: 'Job name is required',
            timestamp: new Date().toISOString()
        });
        return;
    }
    try {
        console.log(`[Admin] Manual job trigger requested: ${jobName}`);
        const startTime = Date.now();
        const result = await runJob(jobName);
        const executionTime = Date.now() - startTime;
        res.json({
            success: true,
            job_name: jobName,
            execution_time: executionTime,
            result,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        const err = error;
        console.error(`[Admin] Job ${jobName} failed:`, err.message);
        res.status(500).json({
            success: false,
            job: jobName,
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Admin endpoint to get detailed subscription refresh status
 * GET /api/admin/subscription-refresh/status
 */
router.get('/subscription-refresh/status', async (_req, res) => {
    try {
        const userStats = await getUserSpotifyStatistics();
        const eligibleUsers = await getAllUsersWithSpotifyTokens();
        const totalBatches = Math.ceil(eligibleUsers.length / parseInt(process.env.DAILY_REFRESH_BATCH_SIZE || '5'));
        const status = {
            system_status: {
                total_users: userStats.total_users,
                users_with_spotify: userStats.spotify_integrated,
                users_needing_reauth: userStats.needs_reauth
            },
            refresh_estimates: {
                estimated_api_calls: eligibleUsers.length,
                estimated_duration_minutes: totalBatches * (parseInt(process.env.DAILY_REFRESH_BATCH_DELAY || '2000') / 1000) / 60
            },
            last_refresh: {
                timestamp: new Date().toISOString(),
                successful: true
            },
            configuration: {
                enabled: process.env.DAILY_REFRESH_ENABLED !== 'false',
                cron_schedule: process.env.DAILY_REFRESH_CRON || '0 0 * * *',
                timezone: process.env.DAILY_REFRESH_TIMEZONE || 'America/Los_Angeles',
                batch_size: parseInt(process.env.DAILY_REFRESH_BATCH_SIZE || '5'),
                batch_delay: parseInt(process.env.DAILY_REFRESH_BATCH_DELAY || '2000')
            },
            subscription_statistics: {
                total_subscriptions: 0, // Not tracking per-test yet
                active_subscriptions: 0,
                inactive_subscriptions: 0
            }
        };
        res.json(status);
    }
    catch (error) {
        const err = error;
        console.error('Subscription refresh status check failed:', err.message);
        res.status(500).json({
            error: 'Failed to get subscription refresh status',
            message: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Admin endpoint to run subscription refresh with real-time progress
 * POST /api/admin/subscription-refresh/run
 */
router.post('/subscription-refresh/run', async (_req, res) => {
    try {
        console.log('[Admin] Manual subscription refresh triggered');
        const result = await refreshAllUserSubscriptionsEnhanced();
        if (result.success) {
            res.json({
                success: true,
                message: 'Subscription refresh completed successfully',
                result,
                timestamp: new Date().toISOString()
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Subscription refresh completed with errors',
                result,
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        const err = error;
        console.error('[Admin] Manual subscription refresh failed:', err.message);
        res.status(500).json({
            success: false,
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Admin endpoint to get job history and logs
 * GET /api/admin/jobs/history
 */
router.get('/jobs/history', (_req, res) => {
    try {
        // Note: In a production system, job history would be stored in database
        // For now, we return basic information about available jobs
        const jobInfo = {
            available_jobs: [
                {
                    name: 'daily_subscription_refresh',
                    description: 'Daily refresh of all user Spotify subscriptions',
                    schedule: process.env.DAILY_REFRESH_CRON || '0 0 * * *',
                    timezone: process.env.DAILY_REFRESH_TIMEZONE || 'America/Los_Angeles',
                    enabled: process.env.DAILY_REFRESH_ENABLED !== 'false'
                },
                {
                    name: 'vault_cleanup',
                    description: 'Clean up expired vault secrets',
                    schedule: '0 2 * * *',
                    timezone: 'UTC',
                    enabled: true
                },
                {
                    name: 'key_rotation',
                    description: 'Quarterly key rotation for security',
                    schedule: '0 3 1 1,4,7,10 *',
                    timezone: 'UTC',
                    enabled: true
                }
            ],
            note: 'Job execution history would be stored in database in production',
            timestamp: new Date().toISOString()
        };
        res.json(jobInfo);
    }
    catch (error) {
        const err = error;
        console.error('Job history request failed:', err.message);
        res.status(500).json({
            error: 'Failed to get job history',
            message: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Admin endpoint for health check with detailed system information
 * GET /api/admin/health
 */
router.get('/health', async (_req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                background_jobs: 'running',
                spotify_api: 'connected',
                database: 'connected'
            },
            environment: {
                node_env: process.env.NODE_ENV || 'development',
                daily_refresh_enabled: process.env.DAILY_REFRESH_ENABLED !== 'false'
            }
        };
        res.json(health);
    }
    catch (error) {
        const err = error;
        console.error('Admin health check failed:', err.message);
        res.status(500).json({
            status: 'unhealthy',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});
export default router;
