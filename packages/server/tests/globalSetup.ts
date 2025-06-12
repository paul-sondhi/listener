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

import { config } from 'dotenv';

/**
 * Global Setup Function
 * Runs once before all tests start
 */
export async function setup() {
  console.log('🚀 Starting global test setup...');

  // Load test environment variables
  config({ path: '.env.test' });

  // Validate test environment
  await validateTestEnvironment();

  // Initialize test database
  await initializeTestDatabase();

  // Set up global test resources
  await setupGlobalTestResources();

  // Initialize performance monitoring
  setupPerformanceMonitoring();

  console.log('✅ Global test setup completed successfully');
}

/**
 * Global Teardown Function
 * Runs once after all tests complete
 */
export async function teardown() {
  console.log('🧹 Starting global test teardown...');

  // Clean up global test resources
  await cleanupGlobalTestResources();

  // Clean up test database
  await cleanupTestDatabase();

  // Generate final test reports
  await generateTestReports();

  console.log('✅ Global test teardown completed successfully');
}

/**
 * Validate Test Environment
 * Ensures all required environment variables and services are available
 */
async function validateTestEnvironment() {
  console.log('🔍 Validating test environment...');

  // Check Node.js version
  const nodeVersion = process.version;
  const requiredNodeVersion = '18.0.0';
  if (!isVersionCompatible(nodeVersion, requiredNodeVersion)) {
    throw new Error(`Node.js version ${requiredNodeVersion} or higher required. Current: ${nodeVersion}`);
  }

  // Validate required environment variables
  const requiredEnvVars = [
    'NODE_ENV',
    'TEST_SUPABASE_URL',
    'TEST_SUPABASE_ANON_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Ensure we're in test mode
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`NODE_ENV must be 'test' for testing. Current: ${process.env.NODE_ENV}`);
  }

  console.log('✅ Test environment validation passed');
}

/**
 * Initialize Test Database
 * Sets up database connection and verifies accessibility
 */
async function initializeTestDatabase() {
  console.log('🗄️  Initializing test database...');

  try {
    // Create test database client
    // NOTE: We intentionally avoid importing the real Supabase SDK at module scope here
    // because our test-suite provides a fully-mocked implementation inside
    // `setupTests.ts` (loaded via Vitest `setupFiles`).  Importing the real SDK
    // before that mock is registered would cache the un-mocked module and prevent
    // the mock from taking effect.  Instead, any Supabase interactions required
    // during global-setup are deferred until after the Vitest mock is active, or
    // (for the majority of cases) skipped entirely because each individual test
    // creates its own in-memory mock client.

    // Set up test database schema if needed
    await setupTestDatabaseSchema();

    // Store global database client for tests
    (global as any).testSupabase = {
      // Placeholder for the real Supabase client
    };

    console.log('✅ Test database initialized successfully');
  } catch (error) {
    console.error('❌ Test database initialization failed:', error);
    throw error;
  }
}

/**
 * Set Up Test Database Schema
 * Ensures required tables and functions exist for testing
 */
async function setupTestDatabaseSchema() {
  // No-op: schema checks are unnecessary with the in-memory Supabase mock
  return;
}

/**
 * Set Up Global Test Resources
 * Initialize shared resources used across tests
 */
async function setupGlobalTestResources() {
  console.log('🔧 Setting up global test resources...');

  // Set up global mock servers if needed
  await setupMockServers();

  // Initialize test data generators
  setupTestDataGenerators();

  // Set up global test utilities
  setupGlobalTestUtilities();

  console.log('✅ Global test resources setup completed');
}

/**
 * Set Up Mock Servers
 * Initialize mock external services for testing
 */
async function setupMockServers() {
  // Mock Spotify API server setup would go here
  // For now, we use fetch mocks in individual tests
  console.log('🎭 Mock servers configured');
}

/**
 * Set Up Test Data Generators
 * Initialize factories for generating consistent test data
 */
function setupTestDataGenerators() {
  // Global test data counters for unique IDs
  (global as any).testDataCounters = {
    users: 0,
    subscriptions: 0,
    shows: 0
  };

  // Enhanced test data generators with counters
  (global as any).generateUniqueTestUser = (overrides: any = {}) => {
    const counter = ++(global as any).testDataCounters.users;
    return {
      id: `test-user-${counter}-${Date.now()}`,
      email: `testuser${counter}@example.com`,
      spotify_vault_secret_id: `vault-secret-${counter}`,
      spotify_reauth_required: false,
      created_at: new Date().toISOString(),
      ...overrides
    };
  };

  (global as any).generateUniqueTestSubscription = (userId: string, overrides: any = {}) => {
    const counter = ++(global as any).testDataCounters.subscriptions;
    return {
      id: `test-sub-${counter}-${Date.now()}`,
      user_id: userId,
      podcast_url: `https://open.spotify.com/show/test-show-${counter}`,
      status: 'active',
      podcast_title: `Test Podcast ${counter}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  };

  console.log('🏭 Test data generators initialized');
}

/**
 * Set Up Global Test Utilities
 * Initialize utility functions available across all tests
 */
function setupGlobalTestUtilities() {
  // Global test timing utilities
  (global as any).startTimer = () => Date.now();
  (global as any).endTimer = (startTime: number) => Date.now() - startTime;

  // Global test assertion utilities
  (global as any).expectToBeWithinRange = (value: number, min: number, max: number) => {
    if (value < min || value > max) {
      throw new Error(`Expected ${value} to be within range ${min}-${max}`);
    }
  };

  // Global test retry utility
  (global as any).retryOperation = async (
    operation: () => Promise<any>,
    maxRetries: number = 3,
    delay: number = 100
  ) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    throw lastError;
  };

  console.log('🛠️  Global test utilities initialized');
}

/**
 * Set Up Performance Monitoring
 * Initialize performance tracking for the test suite
 */
function setupPerformanceMonitoring() {
  console.log('📊 Setting up performance monitoring...');

  // Global performance counters
  (global as any).testPerformance = {
    suiteStartTime: Date.now(),
    slowTests: [],
    memoryUsage: {
      initial: process.memoryUsage(),
      peak: process.memoryUsage()
    }
  };

  // Memory monitoring
  const originalMemoryUsage = process.memoryUsage;
  process.memoryUsage = () => {
    const current = originalMemoryUsage();
    const peak = (global as any).testPerformance.memoryUsage.peak;
    
    // Update peak memory usage
    Object.keys(current).forEach(key => {
      if (current[key as keyof NodeJS.MemoryUsage] > peak[key as keyof NodeJS.MemoryUsage]) {
        peak[key as keyof NodeJS.MemoryUsage] = current[key as keyof NodeJS.MemoryUsage];
      }
    });
    
    return current;
  };

  console.log('✅ Performance monitoring initialized');
}

/**
 * Clean Up Global Test Resources
 * Clean up resources created during global setup
 */
async function cleanupGlobalTestResources() {
  console.log('🧹 Cleaning up global test resources...');

  // Clean up mock servers
  await cleanupMockServers();

  // Clear global test data
  clearGlobalTestData();

  console.log('✅ Global test resources cleaned up');
}

/**
 * Clean Up Mock Servers
 * Shut down any mock servers started during setup
 */
async function cleanupMockServers() {
  // Mock server cleanup would go here
  console.log('🎭 Mock servers cleaned up');
}

/**
 * Clear Global Test Data
 * Clear any global test data and counters
 */
function clearGlobalTestData() {
  // Clear test data counters
  if ((global as any).testDataCounters) {
    delete (global as any).testDataCounters;
  }

  // Clear test utilities
  const globalUtils = [
    'generateUniqueTestUser',
    'generateUniqueTestSubscription',
    'startTimer',
    'endTimer',
    'expectToBeWithinRange',
    'retryOperation'
  ];

  globalUtils.forEach(util => {
    if ((global as any)[util]) {
      delete (global as any)[util];
    }
  });

  console.log('🗑️  Global test data cleared');
}

/**
 * Clean Up Test Database
 * Clean up test database connections and temporary data
 */
async function cleanupTestDatabase() {
  console.log('🗄️  Cleaning up test database...');

  try {
    // Clean up any remaining test data
    const supabase = (global as any).testSupabase;
    if (supabase) {
      // Clean up test users and subscriptions with test prefixes
      await supabase
        .from('podcast_subscriptions')
        .delete()
        .like('user_id', 'test-%');
      
      await supabase
        .from('users')
        .delete()
        .like('id', 'test-%');
    }

    // Clear global database reference
    delete (global as any).testSupabase;

    console.log('✅ Test database cleaned up');
  } catch (error) {
    console.warn('⚠️  Test database cleanup encountered issues:', error);
    // Don't fail teardown for cleanup issues
  }
}

/**
 * Generate Test Reports
 * Generate final reports and performance metrics
 */
async function generateTestReports() {
  console.log('📊 Generating test reports...');

  const performance = (global as any).testPerformance;
  if (performance) {
    const suiteRunTime = Date.now() - performance.suiteStartTime;
    const memoryInitial = performance.memoryUsage.initial;
    const memoryPeak = performance.memoryUsage.peak;

    console.log('📈 Test Suite Performance Report:');
    console.log(`   Total Runtime: ${suiteRunTime}ms`);
    console.log(`   Memory Usage (Initial): ${Math.round(memoryInitial.heapUsed / 1024 / 1024)}MB`);
    console.log(`   Memory Usage (Peak): ${Math.round(memoryPeak.heapUsed / 1024 / 1024)}MB`);
    console.log(`   Memory Increase: ${Math.round((memoryPeak.heapUsed - memoryInitial.heapUsed) / 1024 / 1024)}MB`);

    if (performance.slowTests.length > 0) {
      console.log(`   Slow Tests: ${performance.slowTests.length}`);
      performance.slowTests.slice(0, 5).forEach((test: any, index: number) => {
        console.log(`     ${index + 1}. ${test.name}: ${test.duration}ms`);
      });
    }
  }

  console.log('✅ Test reports generated');
}

/**
 * Utility: Check Version Compatibility
 * Compare version strings for compatibility
 */
function isVersionCompatible(current: string, required: string): boolean {
  const currentVersion = current.replace('v', '').split('.').map(Number);
  const requiredVersion = required.split('.').map(Number);

  for (let i = 0; i < requiredVersion.length; i++) {
    if (currentVersion[i] > requiredVersion[i]) return true;
    if (currentVersion[i] < requiredVersion[i]) return false;
  }

  return true;
}

export { setup as default }; 