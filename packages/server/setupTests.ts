/**
 * Test setup for server-side Node.js code
 * Configures testing environment, global utilities, and API mocks
 */

// Import Vitest utilities
import { vi, beforeAll, afterAll, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import crypto from 'crypto'

// Global type declarations for test utilities
declare global {
  // Environment variable mocks
  let TEST_ENV: {
    SUPABASE_URL: string
    SUPABASE_SERVICE_ROLE_KEY: string
    SPOTIFY_CLIENT_ID: string
    SPOTIFY_CLIENT_SECRET: string
    JWT_SECRET: string
    NODE_ENV: string
    PORT: string
  }
  
  // Mock function types
  let mockFetch: MockInstance
  let mockConsoleLog: MockInstance
  let mockConsoleError: MockInstance
  let mockConsoleWarn: MockInstance
}

// Set up test environment variables
(global as any).TEST_ENV = {
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
    ...(global as any).TEST_ENV,
  },
}))

// Mock fetch for API testing - More selective to avoid conflicts with node-fetch
;(global as any).mockFetch = vi.fn()

// Only mock global fetch if it's not already mocked by a specific test
Object.defineProperty(global, 'fetch', {
  writable: true,
  configurable: true,
  value: (global as any).mockFetch,
})

// Mock console methods to reduce noise in tests
;(global as any).mockConsoleLog = vi.fn()
;(global as any).mockConsoleError = vi.fn()
;(global as any).mockConsoleWarn = vi.fn()

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
}

const originalError = console.error
const originalWarn = console.warn

beforeAll(() => {
  // Replace console methods with mocks during tests
  console.log = (global as any).mockConsoleLog
  console.error = (...args: unknown[]) => {
    // Filter out React warning messages that are noise in tests
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is deprecated') ||
       args[0].includes('Warning: React.createFactory is deprecated') ||
       args[0].includes('Warning: componentWillReceiveProps has been renamed'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }
  console.warn = (...args: unknown[]) => {
    // Filter out React warning messages that are noise in tests
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is deprecated') ||
       args[0].includes('Warning: React.createFactory is deprecated') ||
       args[0].includes('Warning: componentWillReceiveProps has been renamed'))
    ) {
      return
    }
    originalWarn.call(console, ...args)
  }
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

// ---------------------------------------------------------------------------
// Supabase Client Mock
// ---------------------------------------------------------------------------

const supabaseMockFactory = () => ({
  createClient: vi.fn(() => {
    // -------------------------------------------------------------------------
    // In-memory data store so that admin.createUser → auth.getUser share state
    // -------------------------------------------------------------------------
    const users: Record<string, { id: string; email: string }> = {}

    // Helper to generate deterministic test JWTs (simple placeholder string)
    const makeJwt = (uid: string) => `test-jwt-${uid}`

    // Typed stub for the Supabase client used throughout the server codebase
    const client = {
      // ---------------------------------------------------------------------
      // Minimal query-builder stub – enough for .from(...).upsert(...).select()
      // ---------------------------------------------------------------------
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),

      //--------------------------------------------------------------------
      // Auth namespace ----------------------------------------------------
      //--------------------------------------------------------------------
      auth: {
        // Regular user-facing helpers --------------------------------------
        getUser: vi.fn(async (jwt?: string) => {
          // Extract the uid encoded in makeJwt() – fallback to first user
          const uidMatch = typeof jwt === 'string' ? jwt.match(/test-jwt-(.*)/) : null
          const uid = uidMatch?.[1] || Object.keys(users)[0]
          const user = uid ? users[uid] : null
          return { data: { user }, error: null }
        }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: null, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),

        // Administrative helpers ------------------------------------------
        admin: {
          createUser: vi.fn(async ({ email }) => {
            const id = crypto.randomUUID?.() || `user-${Date.now()}`
            users[id] = { id, email }
            return { data: { user: users[id] }, error: null }
          }),
          generateLink: vi.fn(async ({ email }) => {
            // Find the user by email (created via createUser)
            const entry = Object.values(users).find((u) => u.email === email)
            if (!entry) {
              return { data: null, error: { message: 'User not found' } }
            }
            const token = makeJwt(entry.id)
            return {
              data: {
                properties: {
                  action_link: `https://example.com/#access_token=${token}`,
                },
              },
              error: null,
            }
          }),
          deleteUser: vi.fn(async (uid: string) => {
            delete users[typeof uid === 'string' ? uid : String(uid)]
            return { data: {}, error: null }
          }),
        },
      },
    }

    if (process.env.NODE_ENV === 'test') {
      console.log('[SUPABASE_MOCK] createClient invoked – admin:', !!client.auth.admin)
    }
    return client
  }),
})

// Register the mock at module load
vi.mock('@supabase/supabase-js', supabaseMockFactory)

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
  (global as any).mockFetch.mockImplementation((url: string, options?: RequestInit) => {
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
  if ((global as any).mockFetch.mockClear) {
    (global as any).mockFetch.mockClear()
  }
  
  // Clear console mocks
  ;(global as any).mockConsoleLog.mockClear()
  ;(global as any).mockConsoleError.mockClear()
  ;(global as any).mockConsoleWarn.mockClear()
  
  // Clear any timers
  vi.clearAllTimers()
  
  // Reset module registry so that subsequent suites get a *fresh* copy of
  // @supabase/supabase-js backed by our full-featured mock implementation.
  vi.resetModules()
  
  // Re-register the Supabase mock so subsequent suites start with a fresh
  // client that includes the full admin API. This counters overrides applied
  // by individual test files which might strip critical functionality.
  vi.mock('@supabase/supabase-js', supabaseMockFactory)
})

// Utility functions for tests
export const testUtils = {
  /**
   * Create a mock request object for testing Express routes
   */
  createMockRequest: (overrides: Record<string, unknown> = {}) => ({
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
    const res: Record<string, unknown> = {}
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