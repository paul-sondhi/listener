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
/**
 * Custom Test Matchers
 * Add custom matchers for better test assertions
 */
declare global {
    namespace Vi {
        interface AsymmetricMatchersContaining {
            toBeValidSpotifyUrl(): any;
            toBeValidUserId(): any;
            toBeValidSubscriptionStatus(): any;
        }
    }
}
export {};
//# sourceMappingURL=setupTests.d.ts.map