/**
 * Test setup for server-side Node.js code
 * Configures testing environment, global utilities, and API mocks
 */

// Import Vitest utilities
import { vi, beforeAll, afterAll, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Global type declarations for test utilities
declare global {
  // Environment variable mocks
  var TEST_ENV: {
    SUPABASE_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
    SPOTIFY_CLIENT_ID: string
    SPOTIFY_CLIENT_SECRET: string
    JWT_SECRET: string
    NODE_ENV: string
    PORT: string
  }
  
  // Mock function types
  var mockFetch: MockInstance
  var mockConsoleLog: MockInstance
  var mockConsoleError: MockInstance
  var mockConsoleWarn: MockInstance
}

// Set up test environment variables
global.TEST_ENV = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SPOTIFY_CLIENT_ID: 'test-spotify-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-spotify-client-secret',
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
  NODE_ENV: 'test',
  PORT: '3001',
}

// Mock environment variables
vi.mock('process', () => ({
  env: {
    ...process.env,
    ...global.TEST_ENV,
  },
}))

// Mock fetch for API testing - More selective to avoid conflicts with node-fetch
global.mockFetch = vi.fn()

// Only mock global fetch if it's not already mocked by a specific test
Object.defineProperty(global, 'fetch', {
  writable: true,
  configurable: true,
  value: global.mockFetch,
})

// Mock console methods to reduce noise in tests
global.mockConsoleLog = vi.fn()
global.mockConsoleError = vi.fn()
global.mockConsoleWarn = vi.fn()

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
}

beforeAll(() => {
  // Replace console methods with mocks during tests
  console.log = global.mockConsoleLog
  console.error = global.mockConsoleError
  console.warn = global.mockConsoleWarn
})

afterAll(() => {
  // Restore original console methods
  console.log = originalConsole.log
  console.error = originalConsole.error
  console.warn = originalConsole.warn
})

// Mock common Node.js modules that are frequently used in tests
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  }
})

vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return {
    ...actual,
    resolve: vi.fn((...paths: string[]) => paths.join('/')),
    join: vi.fn((...paths: string[]) => paths.join('/')),
  }
})

// Mock crypto for consistent test results
vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto')
  return {
    ...actual,
    randomUUID: vi.fn(() => 'test-uuid-123'),
    randomBytes: vi.fn((size: number) => Buffer.alloc(size, 'test')),
  }
})

// Mock external service modules
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

// Mock Spotify API responses - Only used when no specific mock is set
const mockSpotifyResponses = {
  token: {
    access_token: 'test-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
  },
  show: {
    id: '44BcTpDWnfhcn02ADzs7iB',
    name: 'Test Podcast Show',
    description: 'A test podcast for testing purposes',
    episodes: {
      items: [
        {
          id: 'test-episode-1',
          name: 'Test Episode 1',
          description: 'First test episode',
          release_date: '2024-01-01',
          duration_ms: 1800000, // 30 minutes
        },
      ],
    },
  },
}

// Setup selective fetch mock responses
beforeAll(() => {
  global.mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    // Skip mocking if this appears to be a node-fetch test (has specific mock headers or patterns)
    if (options?.headers && 
        (JSON.stringify(options.headers).includes('client_credentials') || 
         JSON.stringify(options.headers).includes('Basic '))) {
      // Let the test's own node-fetch mock handle this
      return Promise.reject(new Error('Global mock intentionally skipped - use local mock'))
    }
    
    // Mock Spotify token endpoint (only for tests that don't use node-fetch)
    if (url.includes('accounts.spotify.com/api/token')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSpotifyResponses.token),
      })
    }
    
    // Mock Spotify API endpoints
    if (url.includes('api.spotify.com/v1/shows/44BcTpDWnfhcn02ADzs7iB')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockSpotifyResponses.show),
      })
    }
    
    // Default mock response
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    })
  })
})

// Test cleanup
afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks()
  
  // Reset fetch mock to default implementation but don't clear existing setups
  if (global.mockFetch.mockClear) {
    global.mockFetch.mockClear()
  }
  
  // Clear console mocks
  global.mockConsoleLog.mockClear()
  global.mockConsoleError.mockClear()
  global.mockConsoleWarn.mockClear()
  
  // Clear any timers
  vi.clearAllTimers()
  
  // Reset modules to ensure clean state
  vi.resetModules()
})

// Utility functions for tests
export const testUtils = {
  /**
   * Create a mock request object for testing Express routes
   */
  createMockRequest: (overrides: Partial<any> = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ...overrides,
  }),
  
  /**
   * Create a mock response object for testing Express routes
   */
  createMockResponse: () => {
    const res: any = {}
    res.status = vi.fn().mockReturnValue(res)
    res.json = vi.fn().mockReturnValue(res)
    res.send = vi.fn().mockReturnValue(res)
    res.cookie = vi.fn().mockReturnValue(res)
    res.clearCookie = vi.fn().mockReturnValue(res)
    res.redirect = vi.fn().mockReturnValue(res)
    return res
  },
  
  /**
   * Create a mock next function for Express middleware testing
   */
  createMockNext: () => vi.fn(),
  
  /**
   * Wait for a specified number of milliseconds (useful for async tests)
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Mock Spotify show data for consistent testing
   */
  mockSpotifyData: mockSpotifyResponses,
} 