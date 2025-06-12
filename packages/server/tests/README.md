# Testing Documentation

This directory contains the comprehensive testing suite for the **Daily Podcast Subscription Refresh System**. The testing infrastructure provides complete coverage of the subscription refresh functionality with both unit and integration tests.

## Table of Contents

1. [Testing Overview](#testing-overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Test Configuration](#test-configuration)
5. [Writing Tests](#writing-tests)
6. [Coverage Reports](#coverage-reports)
7. [Troubleshooting](#troubleshooting)

## Testing Overview

### Test Types Implemented

#### **1. Unit Tests**
- **Location**: `services/*.test.ts`, `lib/*.test.ts`, `middleware/*.test.ts`, `routes/*.test.ts`
- **Purpose**: Test individual functions and components in isolation
- **Coverage**: 
  - `subscriptionRefreshService.test.ts` - Core subscription refresh logic
  - `backgroundJobs.test.ts` - Daily scheduler and job execution
  - Individual service function testing with mocked dependencies

#### **2. Integration Tests**
- **Location**: `__tests__/*.test.ts`
- **Purpose**: Test complete workflows and service interactions
- **Coverage**:
  - `subscriptionRefreshIntegration.test.ts` - End-to-end refresh flows
  - Database integration with real Supabase connections
  - Admin API endpoint testing

#### **3. Performance Tests**
- **Built-in**: Performance monitoring and slow test detection
- **Metrics**: Memory usage, execution time, API call efficiency
- **Thresholds**: Configurable performance benchmarks

### Testing Framework Stack

- **Test Runner**: [Vitest](https://vitest.dev/) - Fast, TypeScript-native testing
- **Mocking**: Vi.js mocking system with external service mocks
- **Coverage**: V8 coverage provider with detailed reporting
- **Database**: Test Supabase instance for integration testing
- **API Testing**: Supertest for HTTP endpoint testing

## Test Structure

```
packages/server/
├── services/
│   ├── subscriptionRefreshService.test.ts    # Unit tests for core service
│   └── backgroundJobs.test.ts                # Unit tests for scheduler
├── __tests__/
│   └── subscriptionRefreshIntegration.test.ts # Integration tests
├── tests/
│   ├── setupTests.ts                         # Global test configuration
│   ├── globalSetup.ts                        # Test environment setup
│   └── README.md                             # This documentation
├── vitest.config.ts                          # Vitest configuration
├── .env.test                                 # Test environment variables
└── package.json                             # Test scripts and dependencies
```

### Test File Naming Convention

- **Unit Tests**: `[component].test.ts`
- **Integration Tests**: `[feature]Integration.test.ts`
- **Setup Files**: `setup*.ts`, `global*.ts`

## Running Tests

### **5.1 Basic Test Commands**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run subscription refresh specific tests
npm run test:subscription-refresh
```

### **5.2 Advanced Test Commands**

```bash
# Run tests for CI/CD with JSON output
npm run test:ci

# Run tests with verbose debugging
npm run test:debug

# Run coverage with watch mode
npm run test:coverage:watch

# Type checking without running tests
npm run type-check
```

### **5.3 Environment-Specific Testing**

```bash
# Run with real timers (slower but more realistic)
TEST_REAL_TIMERS=true npm test

# Run with debug logging enabled
DEBUG_TESTS=true npm test

# Run integration tests only
INTEGRATION_TESTS_ENABLED=true npm run test:integration
```

## Test Configuration

### **Environment Variables** (`.env.test`)

```bash
# Core Configuration
NODE_ENV=test
LOG_LEVEL=error

# Database Configuration
TEST_SUPABASE_URL=http://localhost:54321
TEST_SUPABASE_ANON_KEY=your-test-key

# Service Configuration
SPOTIFY_API_ENABLED=false
VAULT_ENABLED=false
BACKGROUND_JOBS_ENABLED=false

# Test-Specific Settings
TEST_TIMEOUT=30000
TEST_REAL_TIMERS=false
TEST_PERFORMANCE_MONITORING=true
```

### **Vitest Configuration** (`vitest.config.ts`)

- **Environment**: Node.js for server-side testing
- **TypeScript**: Full TypeScript support with path aliases
- **Coverage**: V8 provider with 80%+ thresholds
- **Timeouts**: 30s for integration tests, 10s for unit tests
- **Parallelization**: Multi-threaded execution for speed

### **Coverage Thresholds**

| Component | Branches | Functions | Lines | Statements |
|-----------|----------|-----------|-------|------------|
| Global | 80% | 85% | 85% | 85% |
| `subscriptionRefreshService.ts` | 90% | 95% | 95% | 95% |
| `backgroundJobs.ts` | 85% | 90% | 90% | 90% |

## Writing Tests

### **5.4 Unit Test Example**

```typescript
describe('refreshUserSubscriptions', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Set up Supabase mock
    setupSupabaseMock();
    
    // Mock logger
    mockCreateSubscriptionRefreshLogger.mockReturnValue(mockLogger);
  });

  it('should successfully refresh user subscriptions', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: createMockTokens()
    });

    // Arrange: Set up successful Spotify API response
    const spotifyResponse = createMockSpotifyResponse([
      { id: 'show1', name: 'Test Show 1' }
    ]);
    
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(spotifyResponse)
    });

    // Act: Execute the function
    const result = await refreshUserSubscriptions('test-user-id');

    // Assert: Verify successful result
    expect(result).toEqual({
      success: true,
      userId: 'test-user-id',
      active_count: 1,
      inactive_count: 0
    });

    // Assert: Verify API calls
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/shows?limit=50',
      expect.objectContaining({
        headers: { 'Authorization': expect.stringContaining('Bearer') }
      })
    );
  });
});
```

### **5.5 Integration Test Example**

```typescript
describe('End-to-End Subscription Refresh', () => {
  let supabase: SupabaseClient;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    // Initialize test database
    supabase = createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY);
  });

  afterEach(async () => {
    // Clean up test data
    await cleanupTestData(supabase, testUserIds);
    testUserIds = [];
  });

  it('should complete full refresh flow with database persistence', async () => {
    // Arrange: Create test user in database
    const testUsers = await createTestUsers(supabase, 1);
    testUserIds = testUsers.map(user => user.id);

    // Arrange: Set up mocks
    setupSuccessfulTokenMocks(1);
    setupSuccessfulSpotifyMocks([
      [{ id: 'show1', name: 'Test Show' }]
    ]);

    // Act: Execute refresh
    const result = await refreshUserSubscriptions(testUsers[0].id);

    // Assert: Verify result
    expect(result.success).toBe(true);

    // Assert: Verify database state
    const { data: subscriptions } = await supabase
      .from('podcast_subscriptions')
      .select('*')
      .eq('user_id', testUsers[0].id);

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions![0].status).toBe('active');
  });
});
```

### **5.6 Testing Best Practices**

#### **Mock External Dependencies**
```typescript
// Mock Spotify API
vi.mock('./tokenService.js', () => ({
  getValidTokens: vi.fn()
}));

// Mock database operations
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockResolvedValue({ data: [], error: null })
};
```

#### **Use Test Data Factories**
```typescript
// Global factories available in tests
const testUser = createTestUser({ id: 'specific-id' });
const testSubscription = createTestSubscription(userId, { status: 'inactive' });
const mockTokens = createMockTokens({ access_token: 'custom-token' });
```

#### **Test Error Scenarios**
```typescript
it('should handle authentication failure gracefully', async () => {
  // Arrange: Set up auth failure
  mockGetValidTokens.mockResolvedValue({
    success: false,
    error: 'token_expired: Invalid refresh token'
  });

  // Act: Execute function
  const result = await refreshUserSubscriptions('user-id');

  // Assert: Verify error handling
  expect(result.success).toBe(false);
  expect(result.auth_error).toBe(true);
  expect(result.error).toContain('token_expired');
});
```

## Coverage Reports

### **Generating Coverage Reports**

```bash
# Generate HTML coverage report
npm run test:coverage

# View coverage in browser
open coverage/index.html

# Generate coverage for CI
npm run test:ci
```

### **Coverage Report Locations**

- **HTML Report**: `coverage/index.html` - Interactive coverage browser
- **LCOV Report**: `coverage/lcov.info` - For CI/CD integration
- **JSON Report**: `coverage/coverage-final.json` - Machine-readable format
- **Text Summary**: Console output during test runs

### **Coverage Metrics Explained**

- **Branches**: Conditional logic paths (if/else, switch cases)
- **Functions**: Function definitions and method calls
- **Lines**: Executable code lines
- **Statements**: Individual JavaScript statements

### **Improving Coverage**

1. **Identify uncovered code**: Check HTML report for red/yellow highlights
2. **Add missing test cases**: Focus on error conditions and edge cases
3. **Test all branches**: Ensure if/else and switch statements are fully tested
4. **Mock external dependencies**: Ensure all code paths can be executed

## Troubleshooting

### **Common Issues**

#### **1. Test Database Connection Fails**
```bash
Error: Test database connection failed: connection timeout
```

**Solution**: Ensure test Supabase instance is running:
```bash
# Start local Supabase (if using local development)
supabase start

# Or update TEST_SUPABASE_URL in .env.test
```

#### **2. Tests Timeout**
```bash
Error: Test timed out after 30000ms
```

**Solutions**:
- Increase timeout in `vitest.config.ts`
- Check for infinite loops in async code
- Ensure mocks are properly configured
- Use `TEST_REAL_TIMERS=false` for faster execution

#### **3. Mock Issues**
```bash
Error: Cannot read property 'mockResolvedValue' of undefined
```

**Solutions**:
- Ensure mocks are set up in `beforeEach`
- Clear mocks between tests: `vi.clearAllMocks()`
- Check mock module paths are correct

#### **4. Coverage Not Meeting Thresholds**
```bash
Error: Coverage threshold for branches (80%) not met: 75%
```

**Solutions**:
- Add tests for uncovered branches
- Check HTML coverage report for specific areas
- Consider adjusting thresholds if appropriate

### **Debug Mode**

Enable debug mode for detailed test output:

```bash
# Run with debug logging
DEBUG_TESTS=true npm run test:debug

# Run specific test file with debugging
npm run test:debug -- services/subscriptionRefreshService.test.ts

# Run with verbose reporter
npm run test -- --reporter=verbose
```

### **Performance Issues**

Monitor test performance:

```bash
# Check for slow tests
TEST_PERFORMANCE_MONITORING=true npm test

# Run with real timers if needed
TEST_REAL_TIMERS=true npm test

# Monitor memory usage
TEST_MEMORY_LIMIT_MB=256 npm test
```

### **Getting Help**

1. **Check test output**: Look for specific error messages and stack traces
2. **Review logs**: Enable debug logging for detailed information
3. **Validate environment**: Ensure `.env.test` is properly configured
4. **Check dependencies**: Verify all testing dependencies are installed
5. **Review documentation**: Check this README and inline code comments

---

## **Task 5.0 Status: ✅ COMPLETED**

### **Comprehensive Testing Suite Delivered**

✅ **5.1 Unit Tests**: Complete coverage for `subscriptionRefreshService` and `backgroundJobs`  
✅ **5.2 Integration Tests**: End-to-end testing with real database interactions  
✅ **5.3 Test Configuration**: Vitest setup with TypeScript and coverage  
✅ **5.4 Test Environment**: Complete setup with mocks and utilities  
✅ **5.5 Documentation**: Comprehensive testing guide and best practices

The testing system provides **production-ready test coverage** with:
- **90%+ coverage targets** for critical subscription refresh components
- **Mocked external APIs** (Spotify, Vault) for isolated testing
- **Real database integration** testing with cleanup
- **Performance monitoring** and slow test detection
- **CI/CD ready** with JSON reporting and coverage thresholds

**Ready for development team adoption and continuous integration.** 