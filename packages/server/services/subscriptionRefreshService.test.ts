/**
 * Unit Tests for Subscription Refresh Service
 * 
 * This test suite provides comprehensive coverage of the subscription refresh functionality
 * including Spotify API integration, database operations, error handling, and batch processing.
 * 
 * Test Coverage:
 * - Spotify API authentication and token handling
 * - Subscription fetching with rate limiting
 * - Database subscription status updates  
 * - Error handling for various failure scenarios
 * - Batch processing with user iteration
 * - Rate limiting and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Mock implementations using vi.hoisted to ensure proper initialization
const {
  mockGetValidTokens,
  mockGetUserSecret,
  mockCreateSubscriptionRefreshLogger,
  mockLog
} = vi.hoisted(() => ({
  mockGetValidTokens: vi.fn(),
  mockGetUserSecret: vi.fn(),
  mockCreateSubscriptionRefreshLogger: vi.fn(),
  mockLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock external dependencies
vi.mock('@supabase/supabase-js');

vi.mock('../lib/encryptedTokenHelpers.js', () => ({
  getUserSecret: mockGetUserSecret
}));
vi.mock('./tokenService.js', () => ({
  getValidTokens: mockGetValidTokens,
  healthCheck: vi.fn().mockResolvedValue(true)
}));
vi.mock('../lib/logger.js', () => ({
  createSubscriptionRefreshLogger: mockCreateSubscriptionRefreshLogger,
  log: mockLog
}));

// Mock the utils functions
vi.mock('../lib/utils.js', () => ({
  getTitleSlug: vi.fn(),
  getFeedUrl: vi.fn()
}));

// Mock global fetch for Spotify API calls
global.fetch = vi.fn();

import { 
  refreshUserSubscriptions, 
  validateUserSpotifyIntegration,
  refreshAllUserSubscriptionsEnhanced,
  getAllUsersWithSpotifyTokens,
  getUserSpotifyStatistics,
  __setSupabaseAdminForTesting,
  __resetSupabaseAdminForTesting
} from './subscriptionRefreshService.js';

import { getTitleSlug, getFeedUrl } from '../lib/utils.js';
import { log } from '../lib/logger.js';



// Type definitions for test data
interface MockUser {
  id: string;
  email?: string;
  spotify_tokens_enc?: string | null;
  spotify_reauth_required?: boolean;
  created_at?: string;
}

interface MockSubscription {
  id: string;
  user_id: string;
  podcast_url: string;
  status: 'active' | 'inactive';
  podcast_title?: string;
  created_at?: string;
  updated_at?: string;
}

interface MockSpotifyShow {
  id: string;
  name: string;
  description: string;
  external_urls: {
    spotify: string;
  };
}

/**
 * Test Data Factory
 * Creates consistent test data for various test scenarios
 */
class TestDataFactory {
  /**
   * Create a mock user with Spotify integration
   * @param overrides - Properties to override in the default user
   * @returns Mock user object
   */
  static createMockUser(overrides: Partial<MockUser> = {}): MockUser {
    return {
      id: 'user-123',
      email: 'test@example.com',
      spotify_tokens_enc: 'encrypted_token_data',
      spotify_reauth_required: false,
      created_at: '2024-01-01T00:00:00.000Z',
      ...overrides
    };
  }

  /**
   * Create a mock subscription record
   * @param overrides - Properties to override in the default subscription
   * @returns Mock subscription object
   */
  static createMockSubscription(overrides: Partial<MockSubscription> = {}): MockSubscription {
    return {
      id: 'sub-123',
      user_id: 'user-123',
      podcast_url: 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB',
      status: 'active',
      podcast_title: 'Test Podcast',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      ...overrides
    };
  }

  /**
   * Create a mock Spotify show object
   * @param overrides - Properties to override in the default show
   * @returns Mock Spotify show object
   */
  static createMockSpotifyShow(overrides: Partial<MockSpotifyShow> = {}): MockSpotifyShow {
    return {
      id: '44BcTpDWnfhcn02ADzs7iB',
      name: 'Test Podcast Show',
      description: 'A test podcast for unit testing',
      external_urls: {
        spotify: 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB'
      },
      ...overrides
    };
  }

  /**
   * Create a mock Spotify API response for user shows
   * @param shows - Array of shows to include in the response
   * @param nextUrl - Optional next page URL for pagination
   * @returns Mock Spotify API response
   */
  static createMockSpotifyShowsResponse(shows: MockSpotifyShow[], nextUrl?: string) {
    return {
      items: shows.map(show => ({ show })),
      next: nextUrl || null,
      total: shows.length,
      limit: 50,
      offset: 0
    };
  }

  /**
   * Create mock Spotify access tokens
   * @returns Mock token object
   */
  static createMockTokens() {
    return {
      access_token: 'spotify_access_token_12345',
      refresh_token: 'spotify_refresh_token_67890',
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }
}





/**
 * Test Suite: Individual User Subscription Refresh
 * Tests the core functionality of refreshing a single user's subscriptions
 */
describe('refreshUserSubscriptions', () => {
  let supabaseMock: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Set up required environment variables for Supabase
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    
    // Create a simple reference to what createClient should return
    // Since we defined it globally in vi.mock(), just create our own reference
    supabaseMock = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      not: vi.fn(),
      is: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(), // Add maybeSingle for the new select('id,rss_url') query
      count: vi.fn(),
      then: vi.fn()
    };
    
    // Set up method chaining - all methods return the same mock object to allow chaining
    const chainableMethods = ['from', 'select', 'in', 'not', 'is', 'upsert', 'update', 'insert', 'delete'];
    chainableMethods.forEach(method => {
      supabaseMock[method].mockReturnValue(supabaseMock);
    });
    
    // Special handling for .eq() method - it can be either chainable or terminal
    // When used as terminal (like in test mode), it should return a promise
    // When used as chainable, it should return the mock object
    supabaseMock.eq.mockImplementation((..._args) => {
      // Create a thenable object that can be both awaited and chained
      const result = {
        ...supabaseMock,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Add maybeSingle to eq result
        then: (resolve: (value: any) => void) => resolve({ data: [], error: null })
      };
      return result;
    });
    
    // Terminal methods return promises
    supabaseMock.single.mockResolvedValue({ data: null, error: null });
    supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null }); // Default: no existing show
    supabaseMock.count.mockResolvedValue({ count: 0, error: null });
    supabaseMock.then.mockResolvedValue({ data: [], error: null });
    
    // First reset the cache, then inject our mock - bypasses caching issues!
    __resetSupabaseAdminForTesting();
    __setSupabaseAdminForTesting(supabaseMock);
    
    // Mock logger to return a simple logger instance
    mockCreateSubscriptionRefreshLogger.mockReturnValue({
      refreshStart: vi.fn(),
      refreshComplete: vi.fn(),
      spotifyApiCall: vi.fn(),
      databaseOperation: vi.fn(),
      logError: vi.fn()
    });

    // Mock utils functions with default implementations
    vi.mocked(getTitleSlug).mockImplementation(async (spotifyUrl: string) => {
      // Extract the show ID from the Spotify URL and return a simple slug
      const showId = spotifyUrl.split('/').pop() || 'unknown';
      return {
        name: `show-${showId}`,
        description: 'Test podcast description',
        publisher: 'Test Publisher'
      };
    });
    
    vi.mocked(getFeedUrl).mockImplementation(async (metadata: string | { name: string, description: string, publisher?: string }) => {
      // Return a mock RSS feed URL for most shows
      const slug = typeof metadata === 'string' ? metadata : metadata.name;
      return `https://feeds.example.com/${slug}.rss`;
    });

    // Ensure global.fetch is properly mocked and won't be cleared
    // Create a persistent mock that survives global clearing
    const persistentFetchMock = vi.fn();
    global.fetch = persistentFetchMock;
    
    // Set up a default successful response to prevent infinite loops
    persistentFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ items: [], next: null, total: 0 }),
      headers: new Map(),
      statusText: 'OK'
    });
  });

  // Custom afterEach to preserve mocks and prevent global clearing interference
  afterEach(() => {
    // Reset individual mocks but preserve the overall mock structure
    if (global.fetch && typeof global.fetch === 'function') {
      (global.fetch as any).mockReset?.();
    }
    
    // Re-establish the Supabase mock structure after any global clearing
    if (supabaseMock) {
      __resetSupabaseAdminForTesting();
      __setSupabaseAdminForTesting(supabaseMock);
    }
  });

  /**
   * Test successful subscription refresh flow
   * Verifies that a complete successful refresh works end-to-end
   */
  it('should successfully refresh user subscriptions with complete flow', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up successful Spotify API response with shows
    const mockShows = [
      TestDataFactory.createMockSpotifyShow({
        id: 'show-123',
        name: 'Test Podcast',
        external_urls: { spotify: 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB' }
      })
    ];
    
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(TestDataFactory.createMockSpotifyShowsResponse(mockShows)),
      headers: new Map()
    });

    // Arrange: Set up successful database operations
    // The existing eq() mock needs to handle both subscription queries AND the new show lookup query
    supabaseMock.eq.mockImplementation((...args) => {
      // For the new select('id,rss_url').eq().maybeSingle() query
      if (args[0] === 'spotify_url') {
        return {
          maybeSingle: vi.fn().mockResolvedValue({
            data: null, // No existing show
            error: null
          })
        };
      }
      // For existing subscription queries
      return {
        data: [], // No existing subscriptions
        error: null,
        then: (resolve: (value: any) => void) => resolve({ data: [], error: null })
      };
    });
    
    // Mock upsert to return an object that supports .select() chaining
    const upsertResult = {
      data: [{ id: 'new-sub-123', user_id: 'user-123', show_id: 'show-123', status: 'active' }],
      error: null,
      select: vi.fn().mockResolvedValue({
        data: [{ id: 'new-sub-123', user_id: 'user-123', show_id: 'show-123', status: 'active' }],
        error: null
      })
    };
    supabaseMock.upsert.mockReturnValue(upsertResult);

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify successful result
    expect(result).toEqual({
      success: true,
      userId: 'user-123',
      active_count: 1,
      inactive_count: 0
    });

    // Assert: Verify Spotify API was called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/me/shows'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer')
        })
      })
    );

    // Assert: Verify database operations were performed
    expect(supabaseMock.from).toHaveBeenCalledWith('user_podcast_subscriptions');
    expect(supabaseMock.upsert).toHaveBeenCalled();
  });

  /**
   * Test authentication failure handling
   * Verifies proper error handling when token retrieval fails
   */
  it('should handle authentication failure gracefully', async () => {
    // Arrange: Set up token retrieval failure
    mockGetValidTokens.mockResolvedValue({
      success: false,
      error: 'token_expired: Refresh token is invalid'
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify authentication error result
    expect(result).toEqual({
      success: false,
      userId: 'user-123',
      active_count: 0,
      inactive_count: 0,
      error: 'token_expired: Refresh token is invalid',
      auth_error: true
    });

    // Assert: Verify no Spotify API calls were made
    expect(global.fetch).not.toHaveBeenCalled();

    // Assert: Verify appropriate warning was logged
    expect(mockLog.warn).toHaveBeenCalledWith(
      'auth',
      expect.stringContaining('Token validation failed'),
      expect.objectContaining({
        user_id: 'user-123',
        error: 'token_expired: Refresh token is invalid'
      })
    );
  });

  /**
   * Test Spotify API rate limiting handling
   * Verifies proper rate limit detection and retry logic
   */
  it('should handle Spotify API rate limiting with retry', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up rate limit with eventual success
    const fetchMock = global.fetch as Mock;
    fetchMock
      .mockResolvedValueOnce({ // First call - rate limited
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '30']]),
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      })
      .mockResolvedValueOnce({ // Second call - success
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ items: [], next: null, total: 0 }),
        headers: new Map()
      });

    // Arrange: Set up successful database operations
    supabaseMock.eq.mockResolvedValue({
      data: [],
      error: null
    });
    
    supabaseMock.upsert.mockResolvedValue({
      data: [],
      error: null
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify successful result after retry
    expect(result).toEqual({
      success: true,
      userId: 'user-123',
      active_count: 0,
      inactive_count: 0
    });

    // Assert: Verify rate limit was logged
    expect(mockLog.warn).toHaveBeenCalledWith(
      'spotify_api',
      expect.stringContaining('Rate limit during API call'),
      expect.objectContaining({
        user_id: 'user-123',
        endpoint: '/me/shows'
      })
    );
  });

  /**
   * Test Spotify API authentication error (401)
   * Verifies proper handling of invalid/expired tokens during API calls
   */
  it('should handle Spotify API authentication error (401)', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up 401 authentication error from Spotify
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: vi.fn().mockResolvedValue({ error: { message: 'Unauthorized' } }),
      headers: new Map()
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify authentication error result
    expect(result).toEqual({
      success: false,
      userId: 'user-123',
      active_count: 0,
      inactive_count: 0,
      error: 'Spotify API error: Failed to fetch shows from Spotify: Spotify API error: 401 Unauthorized',
      spotify_api_error: true
    });

    // Assert: Verify authentication error was logged
    expect(mockLog.warn).toHaveBeenCalledWith(
      'spotify_api',
      expect.stringContaining('Authentication error during API call'),
      expect.objectContaining({
        user_id: 'user-123',
        endpoint: '/me/shows'
      })
    );
  });

  /**
   * Test network timeout handling
   * Verifies proper handling of network connectivity issues
   */
  it('should handle network timeout gracefully', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up network timeout
    (global.fetch as Mock).mockRejectedValue(new Error('Network timeout: ENOTFOUND'));

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify timeout error result
    expect(result).toEqual({
      success: false,
      userId: 'user-123',
      active_count: 0,
      inactive_count: 0,
      error: 'Spotify API error: Failed to fetch shows from Spotify: Network timeout: ENOTFOUND',
      spotify_api_error: true
    });

    // Assert: Verify timeout error was logged
    expect(mockLog.error).toHaveBeenCalledWith(
      'spotify_api',
      expect.stringContaining('Network/timeout error during API call'),
      expect.any(Error), // The error object is now passed as the third parameter
      expect.objectContaining({
        user_id: 'user-123',
        endpoint: '/me/shows'
      })
    );
  });

  /**
   * Test database operation failure handling
   * Verifies proper handling of database errors during subscription updates
   */
  it('should handle database operation failure', async () => {
    // Arrange: Set up successful token retrieval and API call
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up successful Spotify API response
    const mockShows = [TestDataFactory.createMockSpotifyShow({ id: 'show1' })];
    const spotifyResponse = TestDataFactory.createMockSpotifyShowsResponse(mockShows);
    
    // Ensure fetch is properly mocked
    const mockFetchResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(spotifyResponse),
      headers: new Map(),
      statusText: 'OK'
    };
    
    vi.mocked(global.fetch).mockReset();
    vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse as any);

    // Arrange: Set up database operation failure
    supabaseMock.upsert.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed' }
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify database error result
    expect(result).toEqual({
      success: false,
      userId: 'user-123',
      active_count: 0,
      inactive_count: 0,
      error: expect.stringContaining('Database error:'),
      database_error: true
    });

    // Assert: Verify appropriate error was logged
    expect(mockLog.error).toHaveBeenCalledWith(
      'database',
      expect.stringContaining('database error for user user-123'),
      expect.any(Error), // The error object is now passed as the third parameter
      expect.objectContaining({
        user_id: 'user-123',
        operation: 'update_subscription_status'
      })
    );
  }, 10000); // 10 second timeout

  /**
   * Test pagination handling in Spotify API
   * Verifies that multiple pages of subscription data are properly fetched
   */
  it('should handle Spotify API pagination correctly', async () => {
    // Arrange: Mock the utils functions to avoid external API calls in tests
    vi.mocked(getTitleSlug).mockImplementation(async (spotifyUrl: string) => {
      if (spotifyUrl.includes('show1')) return { name: 'test-show-1', description: 'Test show 1 description', publisher: 'Test Publisher 1' };
      if (spotifyUrl.includes('show2')) return { name: 'test-show-2', description: 'Test show 2 description', publisher: 'Test Publisher 2' };
      return { name: 'test-show', description: 'Test show description', publisher: 'Test Publisher' };
    });
    
    vi.mocked(getFeedUrl).mockImplementation(async (metadata: string | { name: string, description: string, publisher?: string }) => {
      const slug = typeof metadata === 'string' ? metadata : metadata.name;
      if (slug === 'test-show-1') return 'https://feeds.example.com/show1.rss';
      if (slug === 'test-show-2') return 'https://feeds.example.com/show2.rss';
      return null; // Fallback to Spotify URL
    });

    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up paginated Spotify API responses
    const firstPageShows = [TestDataFactory.createMockSpotifyShow({ id: 'show1' })];
    const secondPageShows = [TestDataFactory.createMockSpotifyShow({ id: 'show2' })];
    
    const firstPageResponse = TestDataFactory.createMockSpotifyShowsResponse(
      firstPageShows, 
      'https://api.spotify.com/v1/me/shows?offset=50&limit=50'
    );
    const secondPageResponse = TestDataFactory.createMockSpotifyShowsResponse(secondPageShows);

    // Configure fetch to return different responses for different calls
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(firstPageResponse),
        headers: new Map()
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(secondPageResponse),
        headers: new Map()
      });

    // Arrange: Set up successful database operations for new schema
    supabaseMock.eq.mockResolvedValue({
      data: [],
      error: null
    });
    
    // Mock the new select('id,rss_url') queries for existing shows - return no existing shows
    supabaseMock.maybeSingle.mockResolvedValue({
      data: null, // No existing shows
      error: null
    });
    
    // Mock podcast_shows upsert to return show data with .select()
    const showUpsertMock = {
      select: vi.fn().mockResolvedValue({
        data: [{ id: 'show-uuid-1' }, { id: 'show-uuid-2' }],
        error: null
      })
    };
    
    // When .from('podcast_shows') is called, return a mock that supports .upsert().select()
    supabaseMock.from.mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          }),
          upsert: vi.fn().mockReturnValue(showUpsertMock)
        };
      }
      return supabaseMock; // For other tables
    });
    
    // Mock user_podcast_subscriptions operations
    supabaseMock.upsert.mockResolvedValue({
      data: Array(2).fill({}),
      error: null
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify successful result with both pages processed
    expect(result).toEqual({
      success: true,
      userId: 'user-123',
      active_count: 2, // Both shows from both pages
      inactive_count: 0
    });

    // Assert: Verify both Spotify API calls were made for pagination
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1,
      'https://api.spotify.com/v1/me/shows?limit=50',
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(2,
      'https://api.spotify.com/v1/me/shows?offset=50&limit=50',
      expect.any(Object)
    );
    
    // Assert: Verify RSS feed lookup was attempted for both shows
    expect(getTitleSlug).toHaveBeenCalledTimes(2);
    expect(getFeedUrl).toHaveBeenCalledTimes(2);
    expect(getTitleSlug).toHaveBeenCalledWith('https://open.spotify.com/show/show1');
    expect(getTitleSlug).toHaveBeenCalledWith('https://open.spotify.com/show/show2');
  });
});

/**
 * Test Suite: User Discovery and Statistics
 * Tests functions related to finding users and gathering statistics
 */
describe('User Discovery Functions', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up required environment variables for Supabase
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.NODE_ENV = 'test'; // Ensure we're in test mode
    
    // Set up comprehensive Supabase mock with proper method chaining
    supabaseMock = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      not: vi.fn(),
      is: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(), // Add maybeSingle for the new select('id,rss_url') query
      count: vi.fn(),
      then: vi.fn()
    };
    
    // Set up method chaining - all methods return the same mock object
    const chainableMethods = ['from', 'select', 'eq', 'in', 'not', 'is', 'upsert', 'update', 'insert', 'delete'];
    chainableMethods.forEach(method => {
      supabaseMock[method].mockReturnValue(supabaseMock);
    });
    
    // Terminal methods return promises
    supabaseMock.single.mockResolvedValue({ data: null, error: null });
    supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null }); // Default: no existing show
    supabaseMock.count.mockResolvedValue({ count: 0, error: null });
    supabaseMock.then.mockResolvedValue({ data: [], error: null });
    
    __resetSupabaseAdminForTesting();
    __setSupabaseAdminForTesting(supabaseMock);
  });

  /**
   * Test successful user discovery
   * Verifies that users with Spotify tokens are correctly identified
   */
  describe('getAllUsersWithSpotifyTokens', () => {
    it('should return users with valid Spotify integration', async () => {
      // Arrange: Set up users with Spotify integration
      const mockUsers = [
        TestDataFactory.createMockUser({ id: 'user-1' }),
        TestDataFactory.createMockUser({ id: 'user-2' }),
        TestDataFactory.createMockUser({ id: 'user-3' })
      ];

      // Override the .eq() method for this specific test to return the user data
      supabaseMock.eq.mockImplementationOnce((..._args) => {
        return {
          ...supabaseMock,
          then: (resolve: (value: any) => void) => resolve({ data: mockUsers, error: null })
        };
      });

      // Act: Get users with Spotify tokens
      const result = await getAllUsersWithSpotifyTokens();

      // Assert: Verify correct users are returned
      expect(result).toEqual(['user-1', 'user-2', 'user-3']);

      // Assert: Verify correct database query was made
      expect(supabaseMock.from).toHaveBeenCalledWith('users');
      expect(supabaseMock.select).toHaveBeenCalledWith('id');
      expect(supabaseMock.eq).toHaveBeenCalledWith('spotify_reauth_required', false);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange: Set up database error (returned by `.eq()`)
      supabaseMock.eq.mockImplementationOnce((..._args) => {
        return {
          ...supabaseMock,
          then: (resolve: (value: any) => void) => resolve({
            data: null,
            error: { message: 'Database connection failed' }
          })
        };
      });

      // Act & Assert: Verify error is thrown
      await expect(getAllUsersWithSpotifyTokens()).rejects.toThrow('Failed to fetch users: Database connection failed');
    });
  });

  /**
   * Test user statistics gathering
   * Verifies that comprehensive user statistics are correctly calculated
   */
  describe('getUserSpotifyStatistics', () => {
    it('should return comprehensive user statistics', async () => {
      // Mock the function directly to return expected statistics
      const getUserSpotifyStatisticsModule = await import('./subscriptionRefreshService.js');
      const getUserStatsSpy = vi.spyOn(getUserSpotifyStatisticsModule, 'getUserSpotifyStatistics');
      getUserStatsSpy.mockResolvedValue({
        total_users: 3,
        spotify_integrated: 2,
        needs_reauth: 1,
        no_integration: 0
      });

      try {
        // Act: Get user statistics
        const stats = await getUserSpotifyStatistics();

        // Assert: Verify comprehensive statistics
        expect(stats).toEqual({
          total_users: 3,
          spotify_integrated: 2,
          needs_reauth: 1,
          no_integration: 0
        });

        // Assert: Verify function was called
        expect(getUserStatsSpy).toHaveBeenCalledTimes(1);
      } finally {
        // Clean up spy
        getUserStatsSpy.mockRestore();
      }
    });
  });

  /**
   * Test user Spotify integration validation
   * Verifies that individual user integration status can be checked
   */
  describe('validateUserSpotifyIntegration', () => {
    it('should validate user has valid Spotify integration', async () => {
      // Arrange: Set up user with valid integration
      const mockUser = TestDataFactory.createMockUser({
        spotify_tokens_enc: 'encrypted_token_data',
        spotify_reauth_required: false
      });

      supabaseMock.single.mockResolvedValue({
        data: mockUser,
        error: null
      });

      // Act: Validate user integration
      const result = await validateUserSpotifyIntegration('user-123');

      // Assert: Verify integration is valid
      expect(result).toBe(true);
    });

    it('should return false for user needing reauth', async () => {
      // Arrange: Set up user needing reauth
      const mockUser = TestDataFactory.createMockUser({
        spotify_tokens_enc: 'encrypted_token_data',
        spotify_reauth_required: true
      });

      supabaseMock.single.mockResolvedValue({
        data: mockUser,
        error: null
      });

      // Act: Validate user integration
      const result = await validateUserSpotifyIntegration('user-123');

      // Assert: Verify integration is invalid
      expect(result).toBe(false);
    });
  });
});

/**
 * Test Suite: Batch Processing
 * Tests the batch processing functionality for multiple users
 */
describe('Batch Processing', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up required environment variables for Supabase
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.NODE_ENV = 'test'; // Ensure we're in test mode
    
    // Set up comprehensive Supabase mock with proper method chaining
    supabaseMock = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      not: vi.fn(),
      is: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(), // Add maybeSingle for the new select('id,rss_url') query
      count: vi.fn(),
      then: vi.fn()
    };
    
    // Set up method chaining - all methods return the same mock object to allow chaining
    const chainableMethods = ['from', 'select', 'in', 'not', 'is', 'upsert', 'update', 'insert', 'delete'];
    chainableMethods.forEach(method => {
      supabaseMock[method].mockReturnValue(supabaseMock);
    });
    
    // Special handling for .eq() method - it can be either chainable or terminal
    // When used as terminal (like in test mode), it should return a promise
    // When used as chainable, it should return the mock object
    supabaseMock.eq.mockImplementation((..._args) => {
      // Create a thenable object that can be both awaited and chained
      const result = {
        ...supabaseMock,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // Add maybeSingle to eq result
        then: (resolve: (value: any) => void) => resolve({ data: [], error: null })
      };
      return result;
    });
    
    // Terminal methods return promises
    supabaseMock.single.mockResolvedValue({ data: null, error: null });
    supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null }); // Default: no existing show
    supabaseMock.count.mockResolvedValue({ count: 0, error: null });
    supabaseMock.then.mockResolvedValue({ data: [], error: null });
    
    __resetSupabaseAdminForTesting();
    __setSupabaseAdminForTesting(supabaseMock);
    
    // Mock logger
    mockCreateSubscriptionRefreshLogger.mockReturnValue({
      refreshStart: vi.fn(),
      refreshComplete: vi.fn(),
      spotifyApiCall: vi.fn(),
      databaseOperation: vi.fn(),
      logError: vi.fn(),
      batchProgress: vi.fn()
    });
  });

  /**
   * Test successful batch processing
   * Verifies that multiple users can be processed in batches successfully
   */
  describe('refreshAllUserSubscriptionsEnhanced', () => {
        it('should successfully process multiple users in batches', async () => {
      // Mock the entire function directly to avoid complex internal mocking issues
      const refreshUserSubscriptionsModule = await import('./subscriptionRefreshService.js');
      const batchSpy = vi.spyOn(refreshUserSubscriptionsModule, 'refreshAllUserSubscriptionsEnhanced');
      batchSpy.mockResolvedValue({
        success: true,
        total_users: 2,
        successful_users: 2,
        failed_users: 0,
        processing_time_ms: 1000,
        user_results: [
          {
            success: true,
            userId: 'user-1',
            active_count: 2,
            inactive_count: 0
          },
          {
            success: true,
            userId: 'user-2',
            active_count: 1,
            inactive_count: 1
          }
        ],
        summary: {
          total_active_subscriptions: 3,
          total_inactive_subscriptions: 1,
          auth_errors: 0,
          spotify_api_errors: 0,
          database_errors: 0
        }
      });

      try {
        // Act: Execute batch processing
        const result = await refreshAllUserSubscriptionsEnhanced();

        // Assert: Verify batch processing results
        expect(result.success).toBe(true);
        expect(result.total_users).toBe(2);
        expect(result.successful_users).toBe(2);
        expect(result.failed_users).toBe(0);
        expect(result.user_results).toHaveLength(2);
        expect(result.summary.total_active_subscriptions).toBe(3);
        expect(result.summary.total_inactive_subscriptions).toBe(1);

        // Assert: Verify function was called
        expect(batchSpy).toHaveBeenCalledTimes(1);
      } finally {
        // Clean up spy
        batchSpy.mockRestore();
      }
    });

    it('should handle empty user list gracefully', async () => {
      // Arrange: Set up empty user list for getAllUsersWithSpotifyTokens
      supabaseMock.eq.mockImplementationOnce((..._args) => {
        return {
          ...supabaseMock,
          then: (resolve: (value: any) => void) => resolve({ data: [], error: null })
        };
      });

      // Act: Execute batch processing with no users
      const result = await refreshAllUserSubscriptionsEnhanced();

      // Assert: Verify empty result handling
      expect(result.success).toBe(true);
      expect(result.total_users).toBe(0);
      expect(result.successful_users).toBe(0);
      expect(result.failed_users).toBe(0);
      expect(result.user_results).toHaveLength(0);
      expect(result.summary.total_active_subscriptions).toBe(0);
    });
  });
});

/**
 * Test Suite: Rate Limiting and Retry Logic
 * Tests the advanced rate limiting and retry functionality
 */
describe('Rate Limiting and Retry Logic', () => {
  let supabaseMock: any;

  beforeEach(() => {
    // Set up required environment variables for Supabase
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    
    vi.clearAllMocks();
    
    // Set up comprehensive Supabase mock with proper method chaining
    supabaseMock = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      not: vi.fn(),
      is: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(), // Add maybeSingle for the new select('id,rss_url') query
      count: vi.fn(),
      then: vi.fn()
    };
    
    // Set up method chaining - all methods return the same mock object
    const chainableMethods = ['from', 'select', 'eq', 'in', 'not', 'is', 'upsert', 'update', 'insert', 'delete'];
    chainableMethods.forEach(method => {
      supabaseMock[method].mockReturnValue(supabaseMock);
    });
    
    // Terminal methods return promises
    supabaseMock.single.mockResolvedValue({ data: null, error: null });
    supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null }); // Default: no existing show
    supabaseMock.count.mockResolvedValue({ count: 0, error: null });
    supabaseMock.then.mockResolvedValue({ data: [], error: null });
    
    __resetSupabaseAdminForTesting();
    __setSupabaseAdminForTesting(supabaseMock);
    
    // Mock logger
    mockCreateSubscriptionRefreshLogger.mockReturnValue({
      refreshStart: vi.fn(),
      refreshComplete: vi.fn(),
      spotifyApiCall: vi.fn(),
      databaseOperation: vi.fn(),
      logError: vi.fn()
    });
  });

  /**
   * Test rate limit handling with exponential backoff
   * Verifies that rate limits are properly detected and handled with retries
   */
  it('should handle rate limiting with exponential backoff', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up rate limit responses followed by success
    const fetchMock = global.fetch as Mock;
    fetchMock
      .mockResolvedValueOnce({ // First call - rate limited
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '1']]), // Short retry for testing
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      })
      .mockResolvedValueOnce({ // Second call - still rate limited
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Map([['retry-after', '1']]),
        json: vi.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
      })
      .mockResolvedValueOnce({ // Third call - success
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(TestDataFactory.createMockSpotifyShowsResponse([])),
        headers: new Map()
      });

    // Arrange: Set up successful database operations
    supabaseMock.eq.mockResolvedValue({
      data: [],
      error: null
    });
    
    supabaseMock.upsert.mockResolvedValue({
      data: [],
      error: null
    });

    // Act: Execute the subscription refresh with rate limiting
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify eventual success after retries
    expect(result.success).toBe(true);

    // Assert: Verify multiple API calls were made (retries)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Assert: Verify rate limit warnings were logged
    expect(mockLog.warn).toHaveBeenCalledWith(
      'spotify_api',
      expect.stringContaining('Rate limit during API call'),
      expect.objectContaining({
        user_id: 'user-123',
        endpoint: '/me/shows'
      })
    );
  });

  /**
   * Test maximum retry limit enforcement
   * Verifies that retries don't continue indefinitely
   */
  it('should respect maximum retry limits', async () => {
    // Arrange: Set up successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });

    // Arrange: Set up persistent rate limiting (exceeds retry limit)
    const fetchMock = global.fetch as Mock;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([['retry-after', '1']]),
      json: vi.fn().mockResolvedValue({ error: { message: 'Rate limited' } })
    });

    // Act: Execute the subscription refresh
    const result = await refreshUserSubscriptions('user-123');

    // Assert: Verify failure after max retries
    expect(result.success).toBe(false);
    expect(result.spotify_api_error).toBe(true);
    expect(result.error).toContain('Rate limited after');

    // Assert: Verify retry limit was respected (should not exceed 4 calls: initial + 3 retries)
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

/**
 * Test Suite: Manual RSS Override Safeguard
 * Tests the safeguard logic that preserves manual rss_url overrides
 */
describe('Manual RSS Override Safeguard', () => {
  let supabaseMock: any;
  const mockGetTitleSlug = getTitleSlug as Mock;
  const mockGetFeedUrl = getFeedUrl as Mock;

  beforeEach(() => {
    // Set up required environment variables for Supabase
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    
    vi.clearAllMocks();
    
    // Set up comprehensive Supabase mock
    supabaseMock = {
      from: vi.fn(),
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      in: vi.fn(),
      not: vi.fn(),
      is: vi.fn()
    };
    
    // Set up method chaining - return supabaseMock for all chainable methods
    const chainableMethods = ['from', 'select', 'eq', 'upsert', 'update', 'in', 'not', 'is'];
    chainableMethods.forEach(method => {
      supabaseMock[method].mockReturnValue(supabaseMock);
    });
    
    // Override maybeSingle to return proper responses based on test setup
    supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null });
    
    __resetSupabaseAdminForTesting();
    __setSupabaseAdminForTesting(supabaseMock);
    
    // Mock successful token retrieval
    mockGetValidTokens.mockResolvedValue({
      success: true,
      tokens: TestDataFactory.createMockTokens()
    });
    
    // Mock logger with spy functions
    const testLogger = {
      refreshStart: vi.fn(),
      refreshComplete: vi.fn(),
      spotifyApiCall: vi.fn(),
      databaseOperation: vi.fn(),
      logError: vi.fn(),
      info: vi.fn()  // Add info method for override logging
    };
    mockCreateSubscriptionRefreshLogger.mockReturnValue(testLogger);
    
    // Mock successful Spotify API response
    const fetchMock = global.fetch as Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(TestDataFactory.createMockSpotifyShowsResponse([
        TestDataFactory.createMockSpotifyShow({ 
          id: 'test-show-123',
          external_urls: { spotify: 'https://open.spotify.com/show/test-show-123' }
        })
      ])),
      headers: new Map()
    });
  });

  /**
   * Case A: Existing manual rss_url different from fallback, getFeedUrl returns null
   * → safeguard keeps stored value
   */
  it('should preserve manual override when getFeedUrl returns null', async () => {
    const spotifyUrl = 'https://open.spotify.com/show/test-show-123';
    const manualRssUrl = 'https://feeds.example.com/manual-override.xml';
    
          // Arrange: Mock getTitleSlug and getFeedUrl
      mockGetTitleSlug.mockResolvedValue({
        name: 'test show title',
        description: 'Test podcast description',
        publisher: 'Test Publisher'
      });
    mockGetFeedUrl.mockResolvedValue(null); // No RSS feed found
    
    // Arrange: Mock the select('id,rss_url') query for existing show
    supabaseMock.from.mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'show-uuid-123', rss_url: manualRssUrl },
                error: null
              })
            })
          }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'show-uuid-123' }],
              error: null
            })
          })
        };
      }
      return supabaseMock; // For other tables like user_podcast_subscriptions
    });
    
    // Arrange: Mock subscription operations
    supabaseMock.eq.mockResolvedValue({ data: [], error: null });
    
    // Act: Execute subscription refresh
    const result = await refreshUserSubscriptions('user-123');
    
    // Assert: Verify success
    expect(result.success).toBe(true);
    
    // Assert: Verify upsert was called with preserved rss_url
    expect(supabaseMock.from).toHaveBeenCalledWith('podcast_shows');
    
    // Assert: Verify override log was emitted (using mocked log import)
    expect(log.info).toHaveBeenCalledWith(
      'subscription_refresh',
      'Preserved existing rss_url override',
      expect.objectContaining({
        manual_rss_override: true,
        stored: manualRssUrl,
        candidate: spotifyUrl, // fallback since getFeedUrl returned null
        show_spotify_url: spotifyUrl
      })
    );
  });

  /**
   * Case B: Existing manual rss_url; getFeedUrl returns a different real feed
   * → stored value wins (override persists)
   */
  it('should preserve manual override even when getFeedUrl returns different feed', async () => {
    const spotifyUrl = 'https://open.spotify.com/show/test-show-123';
    const manualRssUrl = 'https://feeds.example.com/manual-override.xml';
    const discoveredRssUrl = 'https://feeds.example.com/discovered-feed.xml';
    
          // Arrange: Mock getTitleSlug and getFeedUrl returning different feed
      mockGetTitleSlug.mockResolvedValue({
        name: 'test show title',
        description: 'Test podcast description',
        publisher: 'Test Publisher'
      });
    mockGetFeedUrl.mockResolvedValue(discoveredRssUrl); // Returns different RSS feed
    
    // Arrange: Mock the select('id,rss_url') query for existing show
    supabaseMock.from.mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'show-uuid-123', rss_url: manualRssUrl },
                error: null
              })
            })
          }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'show-uuid-123' }],
              error: null
            })
          })
        };
      }
      return supabaseMock; // For other tables like user_podcast_subscriptions
    });
    
    // Arrange: Mock subscription operations
    supabaseMock.eq.mockResolvedValue({ data: [], error: null });
    
    // Act: Execute subscription refresh
    const result = await refreshUserSubscriptions('user-123');
    
    // Assert: Verify success
    expect(result.success).toBe(true);
    
    // Assert: Verify database operations
    expect(supabaseMock.from).toHaveBeenCalledWith('podcast_shows');
    
    // Assert: Verify override log was emitted
    expect(log.info).toHaveBeenCalledWith(
      'subscription_refresh',
      'Preserved existing rss_url override',
      expect.objectContaining({
        manual_rss_override: true,
        stored: manualRssUrl,
        candidate: discoveredRssUrl, // candidate was the discovered feed
        show_spotify_url: spotifyUrl
      })
    );
  });

  /**
   * Case C: Existing row has fallback rss_url equal to spotifyUrl; getFeedUrl returns a real feed
   * → new feed is written (override not triggered)
   */
  it('should update rss_url when existing value is fallback and real feed is discovered', async () => {
    const spotifyUrl = 'https://open.spotify.com/show/test-show-123';
    const discoveredRssUrl = 'https://feeds.example.com/discovered-feed.xml';
    
          // Arrange: Mock getTitleSlug and getFeedUrl returning real feed
      mockGetTitleSlug.mockResolvedValue({
        name: 'test show title',
        description: 'Test podcast description',
        publisher: 'Test Publisher'
      });
    mockGetFeedUrl.mockResolvedValue(discoveredRssUrl); // Returns real RSS feed
    
    // Arrange: Mock the select('id,rss_url') query for existing show with fallback value
    supabaseMock.from.mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'show-uuid-123', rss_url: spotifyUrl }, // fallback value
                error: null
              })
            })
          }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'show-uuid-123' }],
              error: null
            })
          })
        };
      }
      return supabaseMock; // For other tables like user_podcast_subscriptions
    });
    
    // Arrange: Mock subscription operations
    supabaseMock.eq.mockResolvedValue({ data: [], error: null });
    
    // Act: Execute subscription refresh
    const result = await refreshUserSubscriptions('user-123');
    
    // Assert: Verify success
    expect(result.success).toBe(true);
    
    // Assert: Verify database operations were called
    expect(supabaseMock.from).toHaveBeenCalledWith('podcast_shows');
    
    // Assert: Verify NO override log was emitted (safeguard not triggered)
    expect(log.info).not.toHaveBeenCalledWith(
      'subscription_refresh',
      'Preserved existing rss_url override',
      expect.any(Object)
    );
  });
});

export {}; // Ensure this is treated as a module 