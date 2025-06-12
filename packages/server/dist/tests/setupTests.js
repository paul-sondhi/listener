/**
 * Test Setup Configuration
 *
 * This file configures the testing environment for both unit and integration tests.
 * It sets up global mocks, test utilities, and environment configuration.
 *
 * Setup Features:
 * - Global mock configuration for external services
 * - Test database setup utilities
 * - Environment variable configuration
 * - Global test utilities and helpers
 * - Error handling setup for tests
 */
import { vi, afterEach, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { config } from 'dotenv';
// Load test environment variables
config({ path: '.env.test' });
/**
 * Global Environment Setup
 * Configure environment variables for consistent test execution
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during testing
process.env.SPOTIFY_API_ENABLED = 'false';
process.env.VAULT_ENABLED = 'false';
process.env.DAILY_REFRESH_ENABLED = 'false';
process.env.BACKGROUND_JOBS_ENABLED = 'false';
// Test database configuration
process.env.TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://localhost:54321';
process.env.TEST_SUPABASE_ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || 'test-anon-key';
/**
 * Global Mock Setup
 * Set up mocks for external services and dependencies
 */
// Mock console methods to reduce noise during testing
global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};
// Mock global fetch for API calls
global.fetch = vi.fn();
/**
 * ---------------------------------------------------------------
 * Comprehensive Supabase Client Mock
 * ---------------------------------------------------------------
 * Many test suites spin up their own Supabase mocks but some rely on a
 * default implementation.  We provide a chain-friendly mock here that
 * faithfully supports *every* query builder method used across the codebase
 * (`select`, `insert`, `update`, `upsert`, `delete`, `eq`, `in`, `not`, `is`,
 *  `single`, `count`, and a terminal mocked `then`).  Each invocation of
 * `createClient()` returns a **fresh** mock so individual tests can safely
 * stub/spy on its internals without cross-test leakage.
 */
const _USE_ALIAS_SUPABASE_MOCK = process.env.USE_ALIAS_SUPABASE_MOCK === 'true';
// Mock setTimeout and setInterval for timer-based tests
vi.mock('timers', () => ({
    setTimeout: vi.fn((callback, delay) => {
        // Execute immediately in tests unless specified otherwise
        if (process.env.TEST_REAL_TIMERS === 'true') {
            return setTimeout(callback, delay);
        }
        callback();
        return 1;
    }),
    setInterval: vi.fn((callback, delay) => {
        if (process.env.TEST_REAL_TIMERS === 'true') {
            return setInterval(callback, delay);
        }
        callback();
        return 1;
    }),
    clearTimeout: vi.fn(),
    clearInterval: vi.fn()
}));
// Mock node-cron for background job testing
vi.mock('node-cron', () => ({
    default: {
        schedule: vi.fn((_expression, _callback, _options) => {
            // Return a mock scheduled task
            return {
                start: vi.fn(),
                stop: vi.fn(),
                destroy: vi.fn(),
                getStatus: vi.fn(() => 'scheduled')
            };
        }),
        validate: vi.fn(() => true),
        getTasks: vi.fn(() => new Map())
    }
}));
/**
 * Test Utilities
 * Global utilities available in all test files
 */
// Global test data factory
global.createTestUser = (overrides = {}) => ({
    id: `test-user-${Math.random().toString(36).substr(2, 9)}`,
    email: `test${Math.random().toString(36).substr(2, 5)}@example.com`,
    spotify_vault_secret_id: `vault-secret-${Math.random().toString(36).substr(2, 9)}`,
    spotify_reauth_required: false,
    created_at: new Date().toISOString(),
    ...overrides
});
// Global test subscription factory
global.createTestSubscription = (userId, overrides = {}) => ({
    id: `test-sub-${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    podcast_url: `https://open.spotify.com/show/test-${Math.random().toString(36).substr(2, 9)}`,
    status: 'active',
    podcast_title: `Test Podcast ${Math.random().toString(36).substr(2, 5)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
});
// Global mock Spotify API response factory
global.createMockSpotifyResponse = (shows = []) => ({
    items: shows.map(show => ({
        show: {
            id: show.id || `show-${Math.random().toString(36).substr(2, 9)}`,
            name: show.name || `Test Show ${Math.random().toString(36).substr(2, 5)}`,
            description: show.description || 'Test show description',
            external_urls: {
                spotify: show.external_urls?.spotify || `https://open.spotify.com/show/${show.id}`
            },
            ...show
        }
    })),
    next: null,
    total: shows.length,
    limit: 50,
    offset: 0
});
// Global mock tokens factory
global.createMockTokens = (overrides = {}) => ({
    access_token: `test_access_token_${Math.random().toString(36).substr(2, 9)}`,
    refresh_token: `test_refresh_token_${Math.random().toString(36).substr(2, 9)}`,
    expires_in: 3600,
    token_type: 'Bearer',
    ...overrides
});
// Global async delay utility for testing
global.delay = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
// Global test database cleanup utility
global.cleanupTestData = async (supabase, userIds) => {
    if (userIds.length === 0)
        return;
    // Clean up subscriptions first (foreign key constraint)
    await supabase
        .from('podcast_subscriptions')
        .delete()
        .in('user_id', userIds);
    // Clean up users
    await supabase
        .from('users')
        .delete()
        .in('id', userIds);
};
/**
 * Error Handling Setup
 * Configure proper error handling for tests
 */
// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process in tests, just log the error
});
// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process in tests, just log the error
});
/**
 * Global Test Hooks
 * Set up hooks that run before/after all tests
 */
beforeAll(async () => {
    // Global setup before all tests
    console.log('🧪 Setting up test environment...');
    // Ensure test environment is properly configured
    if (process.env.NODE_ENV !== 'test') {
        console.warn('⚠️  NODE_ENV is not set to "test". This may cause issues.');
    }
    // Initialize any global test resources here
    // (e.g., test database connections, external service mocks)
});
afterAll(async () => {
    // Global cleanup after all tests
    console.log('🧹 Cleaning up test environment...');
    // Clean up any global test resources
    // (e.g., close database connections, clear caches)
});
// Reset mocks after each test
afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    // Reset fetch mock specifically
    if (global.fetch) {
        global.fetch.mockClear();
    }
    // Reset console mocks
    console.log.mockClear?.();
    console.error.mockClear?.();
    console.warn.mockClear?.();
    console.info.mockClear?.();
    console.debug.mockClear?.();
});
// Custom matcher for Spotify URLs
expect.extend({
    toBeValidSpotifyUrl(received) {
        const spotifyUrlPattern = /^https:\/\/open\.spotify\.com\/show\/[a-zA-Z0-9]+$/;
        const pass = spotifyUrlPattern.test(received);
        return {
            pass,
            message: () => pass
                ? `Expected ${received} not to be a valid Spotify URL`
                : `Expected ${received} to be a valid Spotify URL (format: https://open.spotify.com/show/[id])`
        };
    },
    toBeValidUserId(received) {
        const pass = typeof received === 'string' && received.length > 0;
        return {
            pass,
            message: () => pass
                ? `Expected ${received} not to be a valid user ID`
                : `Expected ${received} to be a valid user ID (non-empty string)`
        };
    },
    toBeValidSubscriptionStatus(received) {
        const validStatuses = ['active', 'inactive'];
        const pass = validStatuses.includes(received);
        return {
            pass,
            message: () => pass
                ? `Expected ${received} not to be a valid subscription status`
                : `Expected ${received} to be a valid subscription status (one of: ${validStatuses.join(', ')})`
        };
    }
});
/**
 * Test Performance Monitoring
 * Add performance monitoring for slow tests
 */
const SLOW_TEST_THRESHOLD = 5000; // 5 seconds
beforeEach(() => {
    // Track test start time
    global.testStartTime = Date.now();
});
afterEach(() => {
    // Check test duration and warn about slow tests
    const duration = Date.now() - global.testStartTime;
    if (duration > SLOW_TEST_THRESHOLD) {
        console.warn(`⚠️  Slow test detected: ${duration}ms (threshold: ${SLOW_TEST_THRESHOLD}ms)`);
    }
});
