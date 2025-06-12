/**
 * Unit Tests for Background Jobs and Scheduler
 * 
 * This test suite provides comprehensive coverage of the background job system
 * including the daily subscription refresh job, job execution tracking, and 
 * scheduler functionality.
 * 
 * Test Coverage:
 * - Daily subscription refresh job execution
 * - Job execution tracking and metrics
 * - Error handling in scheduled jobs
 * - Manual job triggering
 * - Scheduler initialization and configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock implementations using vi.hoisted to ensure proper initialization
const { 
  mockRefreshAllUserSubscriptionsEnhanced,
  mockLog,
  mockCronSchedule 
} = vi.hoisted(() => ({
  mockRefreshAllUserSubscriptionsEnhanced: vi.fn(),
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  mockCronSchedule: vi.fn()
}));

// Mock external dependencies - use factory functions with hoisted mocks
vi.mock('./subscriptionRefreshService.js', () => ({
  refreshAllUserSubscriptionsEnhanced: mockRefreshAllUserSubscriptionsEnhanced
}));

vi.mock('../lib/logger.js', () => ({
  log: mockLog
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mockCronSchedule
  }
}));

import { 
  dailySubscriptionRefreshJob,
  initializeBackgroundJobs,
  runJob
} from './backgroundJobs.js';

/**
 * Test Data Factory for Background Jobs
 * Creates consistent test data for various job execution scenarios
 */
class JobTestDataFactory {
  /**
   * Create a successful batch refresh result
   * @param overrides - Properties to override in the default result
   * @returns Mock successful batch refresh result
   */
  static createSuccessfulBatchResult(overrides: any = {}) {
    return {
      success: true,
      total_users: 10,
      successful_users: 10,
      failed_users: 0,
      processing_time_ms: 5000,
      user_results: Array(10).fill(null).map((_, i) => ({
        success: true,
        userId: `user-${i + 1}`,
        active_count: 2,
        inactive_count: 1
      })),
      summary: {
        total_active_subscriptions: 20,
        total_inactive_subscriptions: 10,
        auth_errors: 0,
        spotify_api_errors: 0,
        database_errors: 0
      },
      errors: [],
      ...overrides
    };
  }

  /**
   * Create a failed batch refresh result
   * @param overrides - Properties to override in the default result
   * @returns Mock failed batch refresh result
   */
  static createFailedBatchResult(overrides: any = {}) {
    return {
      success: false,
      total_users: 5,
      successful_users: 2,
      failed_users: 3,
      processing_time_ms: 3000,
      user_results: [
        { success: true, userId: 'user-1', active_count: 1, inactive_count: 0 },
        { success: true, userId: 'user-2', active_count: 2, inactive_count: 1 },
        { success: false, userId: 'user-3', active_count: 0, inactive_count: 0, error: 'Auth failed', auth_error: true },
        { success: false, userId: 'user-4', active_count: 0, inactive_count: 0, error: 'API error', spotify_api_error: true },
        { success: false, userId: 'user-5', active_count: 0, inactive_count: 0, error: 'DB error', database_error: true }
      ],
      summary: {
        total_active_subscriptions: 3,
        total_inactive_subscriptions: 1,
        auth_errors: 1,
        spotify_api_errors: 1,
        database_errors: 1
      },
      errors: [
        {
          category: 'auth_error',
          count: 1,
          sample_errors: ['Auth failed']
        },
        {
          category: 'api_error', 
          count: 1,
          sample_errors: ['API error']
        },
        {
          category: 'database_error',
          count: 1,
          sample_errors: ['DB error']
        }
      ],
      error: '3 users failed to sync',
      ...overrides
    };
  }

  /**
   * Create a batch result with mixed outcomes
   * @returns Mock batch result with both successes and failures
   */
  static createMixedBatchResult() {
    return {
      success: false, // Overall failure due to some failed users
      total_users: 100,
      successful_users: 85,
      failed_users: 15,
      processing_time_ms: 12000,
      user_results: [
        // Simulate a mix of successful and failed users
        ...Array(85).fill(null).map((_, i) => ({
          success: true,
          userId: `user-success-${i + 1}`,
          active_count: Math.floor(Math.random() * 5),
          inactive_count: Math.floor(Math.random() * 3)
        })),
        ...Array(15).fill(null).map((_, i) => ({
          success: false,
          userId: `user-fail-${i + 1}`,
          active_count: 0,
          inactive_count: 0,
          error: `Error ${i + 1}`,
          auth_error: i < 5,
          spotify_api_error: i >= 5 && i < 10,
          database_error: i >= 10
        }))
      ],
      summary: {
        total_active_subscriptions: 170, // 85 users * 2 avg
        total_inactive_subscriptions: 85, // 85 users * 1 avg
        auth_errors: 5,
        spotify_api_errors: 5,
        database_errors: 5
      },
      errors: [
        {
          category: 'auth_error',
          count: 5,
          sample_errors: ['Error 1', 'Error 2', 'Error 3']
        },
        {
          category: 'api_error',
          count: 5,
          sample_errors: ['Error 6', 'Error 7', 'Error 8']
        },
        {
          category: 'database_error',
          count: 5,
          sample_errors: ['Error 11', 'Error 12', 'Error 13']
        }
      ]
    };
  }
}

/**
 * Test Suite: Daily Subscription Refresh Job
 * Tests the core daily subscription refresh job functionality
 */
describe('dailySubscriptionRefreshJob', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Reset console spy to track console.log calls
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    vi.restoreAllMocks();
  });

  /**
   * Test successful daily refresh job execution
   * Verifies that a complete successful refresh job works end-to-end
   */
  it('should execute daily refresh job successfully with comprehensive logging', async () => {
    // Arrange: Set up successful batch refresh result
    const successfulResult = JobTestDataFactory.createSuccessfulBatchResult();
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(successfulResult);

    // Act: Execute the daily refresh job
    await dailySubscriptionRefreshJob();

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledWith();

    // Assert: Verify successful completion logging
    expect(mockLog.info).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Starting daily_subscription_refresh job'),
      expect.objectContaining({
        component: 'background_jobs'
      })
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      'subscription_refresh',
      expect.stringContaining('Daily refresh processed 10 users'),
      expect.objectContaining({
        total_users: 10,
        successful_users: 10,
        failed_users: 0,
        success_rate: '100.0',
        subscriptions: {
          total_active: 20,
          total_inactive: 10,
          auth_errors: 0,
          api_errors: 0,
          database_errors: 0
        }
      })
    );

    expect(mockLog.info).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Daily subscription refresh completed successfully'),
      expect.objectContaining({
        component: 'background_jobs',
        users_processed: 10,
        success_rate: '100.0'
      })
    );

    // Assert: Verify no error logging occurred
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  /**
   * Test daily refresh job with partial failures
   * Verifies proper handling and logging when some users fail
   */
  it('should handle partial failures with detailed error categorization', async () => {
    // Arrange: Set up batch result with mixed outcomes
    const mixedResult = JobTestDataFactory.createMixedBatchResult();
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(mixedResult);

    // Act: Execute the daily refresh job
    await dailySubscriptionRefreshJob();

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify detailed progress logging
    expect(mockLog.info).toHaveBeenCalledWith(
      'subscription_refresh',
      expect.stringContaining('Daily refresh processed 100 users'),
      expect.objectContaining({
        total_users: 100,
        successful_users: 85,
        failed_users: 15,
        success_rate: '85.0', // 85% success rate
        subscriptions: {
          total_active: 170,
          total_inactive: 85,
          auth_errors: 5,
          api_errors: 5,
          database_errors: 5
        }
      })
    );

    // Assert: Verify error categorization logging
    expect(mockLog.warn).toHaveBeenCalledWith(
      'subscription_refresh',
      expect.stringContaining('Daily refresh completed with categorized errors'),
      expect.objectContaining({
        error_categories: expect.objectContaining({
          auth_errors: 5,
          api_errors: 5,
          database_errors: 5,
          failed_users: 15,
          percentage: '15.0'
        }),
        job_id: expect.stringContaining('daily-')
      })
    );

    // Assert: Verify completion with issues logging
    expect(mockLog.error).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Daily subscription refresh completed with issues'),
      expect.objectContaining({
        component: 'background_jobs',
        users_processed: 100,
        failed_users: 15
      })
    );
  });

  /**
   * Test daily refresh job complete failure
   * Verifies proper error handling when the entire refresh operation fails
   */
  it('should handle complete job failure gracefully', async () => {
    // Arrange: Set up complete failure result
    const failedResult = JobTestDataFactory.createFailedBatchResult();
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(failedResult);

    // Act: Execute the daily refresh job
    await dailySubscriptionRefreshJob();

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify failure logging
    expect(mockLog.info).toHaveBeenCalledWith(
      'subscription_refresh',
      expect.stringContaining('Daily refresh processed 5 users'),
      expect.objectContaining({
        total_users: 5,
        successful_users: 2,
        failed_users: 3,
        success_rate: '40.0' // 40% success rate
      })
    );

    // Assert: Verify error completion logging
    expect(mockLog.error).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Daily subscription refresh completed with issues'),
      expect.objectContaining({
        component: 'background_jobs',
        failed_users: 3,
        error: '3 users failed to sync'
      })
    );
  });

  /**
   * Test exception handling in daily refresh job
   * Verifies proper handling when the refresh service throws an exception
   */
  it('should handle exceptions in refresh service gracefully', async () => {
    // Arrange: Set up refresh service to throw an exception
    const testError = new Error('Database connection failed');
    mockRefreshAllUserSubscriptionsEnhanced.mockRejectedValue(testError);

    // Act: Execute the daily refresh job
    await dailySubscriptionRefreshJob();

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify exception error logging
    expect(mockLog.error).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Daily subscription refresh job failed with exception'),
      testError,
      expect.objectContaining({
        component: 'background_jobs',
        users_processed: 0,
        stack_trace: expect.stringContaining('Database connection failed')
      })
    );

    // Assert: Verify no success logging occurred
    expect(mockLog.info).not.toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('completed successfully'),
      expect.any(Object)
    );
  });

  /**
   * Test job execution with zero users
   * Verifies proper handling when no users need subscription refresh
   */
  it('should handle zero users scenario correctly', async () => {
    // Arrange: Set up empty result (no users to process)
    const emptyResult = JobTestDataFactory.createSuccessfulBatchResult({
      total_users: 0,
      successful_users: 0,
      failed_users: 0,
      user_results: [],
      summary: {
        total_active_subscriptions: 0,
        total_inactive_subscriptions: 0,
        auth_errors: 0,
        spotify_api_errors: 0,
        database_errors: 0
      }
    });
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(emptyResult);

    // Act: Execute the daily refresh job
    await dailySubscriptionRefreshJob();

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify zero users logging
    expect(mockLog.info).toHaveBeenCalledWith(
      'subscription_refresh',
      expect.stringContaining('Daily refresh processed 0 users'),
      expect.objectContaining({
        total_users: 0,
        successful_users: 0,
        failed_users: 0,
        success_rate: '0' // Handle division by zero
      })
    );

    // Assert: Verify successful completion (even with zero users)
    expect(mockLog.info).toHaveBeenCalledWith(
      'scheduler',
      expect.stringContaining('Daily subscription refresh completed successfully'),
      expect.objectContaining({
        component: 'background_jobs',
        users_processed: 0,
        success_rate: '100' // 100% success rate when no failures
      })
    );
  });
});

/**
 * Test Suite: Manual Job Execution
 * Tests the manual job triggering functionality
 */
describe('runJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test manual triggering of daily subscription refresh
   * Verifies that the job can be triggered manually for testing/admin purposes
   */
  it('should execute daily subscription refresh job when triggered manually', async () => {
    // Arrange: Set up successful refresh result
    const successfulResult = JobTestDataFactory.createSuccessfulBatchResult();
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(successfulResult);

    // Act: Manually trigger the daily subscription refresh job
    await runJob('daily_subscription_refresh');

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify manual job execution logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('BACKGROUND_JOBS: Manually running job: daily_subscription_refresh')
    );
  });

  /**
   * Test manual triggering with alternative job name
   * Verifies that the job can be triggered with the shorter alias name
   */
  it('should execute job with alternative name "subscription_refresh"', async () => {
    // Arrange: Set up successful refresh result
    const successfulResult = JobTestDataFactory.createSuccessfulBatchResult();
    mockRefreshAllUserSubscriptionsEnhanced.mockResolvedValue(successfulResult);

    // Act: Manually trigger with alternative name
    await runJob('subscription_refresh');

    // Assert: Verify refresh service was called
    expect(mockRefreshAllUserSubscriptionsEnhanced).toHaveBeenCalledTimes(1);

    // Assert: Verify manual job execution logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('BACKGROUND_JOBS: Manually running job: subscription_refresh')
    );
  });

  /**
   * Test error handling for unknown job names
   * Verifies proper error handling when an invalid job name is provided
   */
  it('should throw error for unknown job names', async () => {
    // Act & Assert: Verify error is thrown for unknown job
    await expect(runJob('unknown_job')).rejects.toThrow('Unknown job: unknown_job');

    // Assert: Verify error logging
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('BACKGROUND_JOBS: Unknown job name: unknown_job')
    );

    // Assert: Verify no refresh service calls were made
    expect(mockRefreshAllUserSubscriptionsEnhanced).not.toHaveBeenCalled();
  });
});

/**
 * Test Suite: Scheduler Initialization
 * Tests the background job scheduler setup and configuration
 */
describe('initializeBackgroundJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.DAILY_REFRESH_ENABLED;
    delete process.env.DAILY_REFRESH_CRON;
    delete process.env.DAILY_REFRESH_TIMEZONE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test scheduler initialization in production environment
   * Verifies that all jobs are scheduled correctly in production
   */
  it('should initialize all background jobs in production environment', () => {
    // Arrange: Set production environment
    process.env.NODE_ENV = 'production';

    // Mock cron schedule function
    const mockScheduleTask = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn().mockReturnValue('scheduled')
    };
    mockCronSchedule.mockReturnValue(mockScheduleTask);

    // Act: Initialize background jobs
    initializeBackgroundJobs();

    // Assert: Verify daily subscription refresh job was scheduled
    expect(mockCronSchedule).toHaveBeenCalledWith(
      '0 0 * * *', // Default midnight cron expression
      expect.any(Function),
      expect.objectContaining({
        scheduled: true,
        timezone: 'America/Los_Angeles' // Default Pacific timezone
      })
    );

    // Assert: Verify vault cleanup job was scheduled
    expect(mockCronSchedule).toHaveBeenCalledWith(
      '0 2 * * *', // 2 AM UTC
      expect.any(Function),
      expect.objectContaining({
        scheduled: true,
        timezone: 'UTC'
      })
    );

    // Assert: Verify key rotation job was scheduled
    expect(mockCronSchedule).toHaveBeenCalledWith(
      '0 3 1 1,4,7,10 *', // Quarterly
      expect.any(Function),
      expect.objectContaining({
        scheduled: true,
        timezone: 'UTC'
      })
    );

    // Assert: Verify success logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('BACKGROUND_JOBS: Background jobs scheduled successfully')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('- Vault cleanup: Daily at 2:00 AM UTC')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('- Key rotation: Quarterly on 1st at 3:00 AM UTC')
    );
  });

  /**
   * Test scheduler initialization with custom configuration
   * Verifies that environment variable configuration is properly applied
   */
  it('should respect environment variable configuration', () => {
    // Arrange: Set custom environment variables
    process.env.DAILY_REFRESH_ENABLED = 'true';
    process.env.DAILY_REFRESH_CRON = '0 3 * * *'; // 3 AM instead of midnight
    process.env.DAILY_REFRESH_TIMEZONE = 'America/New_York'; // Eastern time

    // Mock cron schedule function
    const mockScheduleTask = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn().mockReturnValue('scheduled')
    };
    mockCronSchedule.mockReturnValue(mockScheduleTask);

    // Act: Initialize background jobs
    initializeBackgroundJobs();

    // Assert: Verify custom configuration was used
    expect(mockCronSchedule).toHaveBeenCalledWith(
      '0 3 * * *', // Custom 3 AM cron expression
      expect.any(Function),
      expect.objectContaining({
        scheduled: true,
        timezone: 'America/New_York' // Custom Eastern timezone
      })
    );

    // Assert: Verify custom configuration logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('0 3 * * * America/New_York')
    );
  });

  /**
   * Test scheduler initialization with disabled daily refresh
   * Verifies that daily refresh can be disabled via environment variable
   */
  it('should disable daily refresh when DAILY_REFRESH_ENABLED is false', () => {
    // Arrange: Disable daily refresh
    process.env.DAILY_REFRESH_ENABLED = 'false';

    // Mock cron schedule function
    const mockScheduleTask = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      getStatus: vi.fn().mockReturnValue('scheduled')
    };
    mockCronSchedule.mockReturnValue(mockScheduleTask);

    // Act: Initialize background jobs
    initializeBackgroundJobs();

    // Assert: Verify daily refresh was not scheduled
    const dailyRefreshCalls = mockCronSchedule.mock.calls.filter(call => 
      call[0] === '0 0 * * *' || call[0] === process.env.DAILY_REFRESH_CRON
    );
    expect(dailyRefreshCalls).toHaveLength(0);

    // Assert: Verify disabled logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('- Daily subscription refresh: DISABLED')
    );

    // Assert: Verify other jobs were still scheduled
    expect(mockCronSchedule).toHaveBeenCalledWith(
      '0 2 * * *', // Vault cleanup should still be scheduled
      expect.any(Function),
      expect.any(Object)
    );
  });

  /**
   * Test scheduler initialization in test environment
   * Verifies that job scheduling is skipped during testing
   */
  it('should skip job scheduling in test environment', () => {
    // Arrange: Set test environment
    process.env.NODE_ENV = 'test';

    // Act: Initialize background jobs
    initializeBackgroundJobs();

    // Assert: Verify no jobs were scheduled
    expect(mockCronSchedule).not.toHaveBeenCalled();

    // Assert: Verify test environment logging
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('BACKGROUND_JOBS: Skipping job scheduling in test environment')
    );
  });
});

export {}; // Ensure this is treated as a module 