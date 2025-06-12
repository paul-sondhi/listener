/**
 * Global Test Setup
 *
 * This file handles global setup and teardown for the entire test suite.
 * It runs once before all tests start and once after all tests complete.
 *
 * Global Setup Features:
 * - Test database initialization
 * - External service mock setup
 * - Environment validation
 * - Global test resources management
 * - Performance monitoring setup
 */
/**
 * Global Setup Function
 * Runs once before all tests start
 */
export declare function setup(): Promise<void>;
/**
 * Global Teardown Function
 * Runs once after all tests complete
 */
export declare function teardown(): Promise<void>;
export { setup as default };
//# sourceMappingURL=globalSetup.d.ts.map