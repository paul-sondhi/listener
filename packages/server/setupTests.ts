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
// Enhanced Supabase Client Mock with Database Constraints Simulation
// ---------------------------------------------------------------------------

// Global shared data stores to ensure all client instances share the same data
const globalDataStores = {
  users: {} as Record<string, { id: string; email: string }>,
  podcastShows: {} as Record<string, any>,
  podcastEpisodes: {} as Record<string, any>,
  transcripts: {} as Record<string, any>
}

const supabaseMockFactory = () => ({
  createClient: vi.fn(() => {
    // -------------------------------------------------------------------------
    // In-memory data store with database-like behavior and constraint enforcement
    // -------------------------------------------------------------------------
    const users = globalDataStores.users
    const podcastShows = globalDataStores.podcastShows
    const podcastEpisodes = globalDataStores.podcastEpisodes
    const transcripts = globalDataStores.transcripts

    // Helper to generate deterministic test JWTs (simple placeholder string)
    const makeJwt = (uid: string) => `test-jwt-${uid}`

    // Generate consistent UUIDs for test data
    const generateUUID = () => {
      return `test-uuid-${Date.now()}-${Math.random().toString(36).substring(2)}`
    }

    // Validate database constraints
    const validateConstraints = (table: string, operation: string, data: any) => {
      switch (table) {
        case 'transcripts':
          // Check constraint for status values
          if (data.status && !['pending', 'available', 'error'].includes(data.status)) {
            throw new Error(`new row for relation "transcripts" violates check constraint "transcripts_status_check"`)
          }
          
          // Foreign key constraint for episode_id
          if (operation === 'insert' && data.episode_id && !podcastEpisodes[data.episode_id]) {
            throw new Error(`insert or update on table "transcripts" violates foreign key constraint "transcripts_episode_id_fkey"`)
          }
          
          // Unique constraint for episode_id
          if (operation === 'insert' && data.episode_id) {
            const existingTranscript = Object.values(transcripts).find((t: any) => 
              t.episode_id === data.episode_id && !t.deleted_at
            )
            if (existingTranscript) {
              throw new Error(`duplicate key value violates unique constraint "transcripts_episode_id_key"`)
            }
          }
          break
      }
    }

    // Enhanced query builder
    const createQueryBuilder = (tableName: string) => {
      const queryState = {
        tableName,
        selectedFields: '*',
        filters: [] as any[],
        isUpdateQuery: false,
        isInsertQuery: false,
        isDeleteQuery: false,
        updateData: {} as any,
        insertData: [] as any[],
        shouldReturnSingle: false,
      }
      
      const getTableData = () => {
        switch (tableName) {
          case 'podcast_shows': return podcastShows
          case 'podcast_episodes': return podcastEpisodes
          case 'transcripts': return transcripts
          default: return {}
        }
      }
      
      const applyFilters = (data: any) => {
        return queryState.filters.every(filter => {
          switch (filter.type) {
            case 'eq':
              return data[filter.column] === filter.value
            case 'is':
              if (filter.value === null) {
                return data[filter.column] === null || data[filter.column] === undefined
              }
              return data[filter.column] === filter.value
            case 'in':
              return filter.value.includes(data[filter.column])
            default:
              return true
          }
        })
      }

      const executeQuery = async () => {
        const tableData = getTableData()
        
        try {
          if (queryState.isInsertQuery) {
            const insertedRecords = []
            for (const record of queryState.insertData) {
              // Validate constraints before inserting
              validateConstraints(tableName, 'insert', record)
              
              const id = record.id || generateUUID()
              const now = new Date().toISOString()
              const newRecord = {
                id,
                ...record,
                // Ensure nullable fields are explicitly null, not undefined
                word_count: record.word_count !== undefined ? record.word_count : null,
                deleted_at: record.deleted_at !== undefined ? record.deleted_at : null,
                created_at: record.created_at || now,
                updated_at: record.updated_at || now,
              }
              
              tableData[id] = newRecord
              insertedRecords.push(newRecord)
            }
            
            return { 
              data: queryState.shouldReturnSingle ? insertedRecords[0] : insertedRecords, 
              error: null,
              status: 201,
              statusText: 'Created'
            }
          } else if (queryState.isUpdateQuery) {
            const matchingRecords = Object.values(tableData).filter(applyFilters)
            if (matchingRecords.length === 0 && queryState.shouldReturnSingle) {
              return { data: null, error: null }
            } else {
              const updatedRecords = []
              for (const record of matchingRecords) {
                const updatedRecord = {
                  ...record,
                  ...queryState.updateData,
                  // Trigger behavior: automatically update updated_at timestamp
                  updated_at: new Date().toISOString(),
                  // Ensure nullable fields are explicitly null, not undefined
                  word_count: queryState.updateData.word_count !== undefined ? queryState.updateData.word_count : (record.word_count !== undefined ? record.word_count : null),
                  deleted_at: queryState.updateData.deleted_at !== undefined ? queryState.updateData.deleted_at : (record.deleted_at !== undefined ? record.deleted_at : null),
                }
                tableData[record.id] = updatedRecord
                updatedRecords.push(updatedRecord)
              }
              return { 
                data: queryState.shouldReturnSingle ? updatedRecords[0] : updatedRecords, 
                error: null 
              }
            }
          } else if (queryState.isDeleteQuery) {
            const matchingRecords = Object.values(tableData).filter(applyFilters)
            for (const record of matchingRecords) {
              delete tableData[record.id]
            }
            return { 
              data: null, 
              error: null 
            }
          } else {
            // SELECT query
            const matchingRecords = Object.values(tableData).filter(applyFilters)
            if (queryState.shouldReturnSingle) {
              if (matchingRecords.length === 0) {
                return { 
                  data: null, 
                  error: { code: 'PGRST116', message: 'No rows found' } 
                }
              } else {
                return { 
                  data: matchingRecords[0], 
                  error: null 
                }
              }
            } else {
              return { 
                data: matchingRecords, 
                error: null 
              }
            }
          }
        } catch (err: any) {
          const error = { message: err.message, code: 'constraint_violation' }
          return { data: null, error }
        }
      }

      // Create a thenable object that works with async/await
      const createThenable = () => {
        let promise: Promise<any> | null = null
        
        const getPromise = () => {
          if (!promise) {
            promise = executeQuery()
          }
          return promise
        }
        
        return {
          then: (onFulfilled?: any, onRejected?: any) => {
            return getPromise().then((result) => {
              if (result.error && result.error.code === 'constraint_violation') {
                if (onRejected) {
                  return onRejected(new Error(result.error.message))
                }
                throw new Error(result.error.message)
              }
              if (onFulfilled) {
                return onFulfilled(result)
              }
              return result
            }, onRejected)
          },
          catch: (onRejected?: any) => {
            return getPromise().then((result) => {
              if (result.error && result.error.code === 'constraint_violation') {
                if (onRejected) {
                  return onRejected(new Error(result.error.message))
                }
                throw new Error(result.error.message)
              }
              return result
            }).catch(onRejected)
          }
        }
      }

      const queryBuilder = {
        select: vi.fn((fields = '*') => {
          queryState.selectedFields = fields
          return queryBuilder
        }),
        
        insert: vi.fn((data) => {
          queryState.isInsertQuery = true
          queryState.insertData = Array.isArray(data) ? data : [data]
          return queryBuilder
        }),
        
        update: vi.fn((data) => {
          queryState.isUpdateQuery = true
          queryState.updateData = data
          return queryBuilder
        }),
        
        delete: vi.fn(() => {
          queryState.isDeleteQuery = true
          return queryBuilder
        }),
        
        upsert: vi.fn((data) => {
          // For simplicity, treat upsert as insert for now
          queryState.isInsertQuery = true
          queryState.insertData = Array.isArray(data) ? data : [data]
          return createThenable()
        }),
        
        eq: vi.fn((column, value) => {
          queryState.filters.push({ type: 'eq', column, value })
          return queryBuilder
        }),
        
        is: vi.fn((column, value) => {
          queryState.filters.push({ type: 'is', column, value })
          return queryBuilder
        }),

        in: vi.fn((column, values) => {
          queryState.filters.push({ type: 'in', column, value: values })
          return queryBuilder
        }),
        
        single: vi.fn(() => {
          queryState.shouldReturnSingle = true
          return createThenable()
        }),
        
        limit: vi.fn(() => createThenable()),
        
        // Also make the query builder itself thenable for cases where methods are chained
        then: (onFulfilled?: any, onRejected?: any) => {
          return createThenable().then(onFulfilled, onRejected)
        },
        
        catch: (onRejected?: any) => {
          return createThenable().catch(onRejected)
        }
      }
      
      return queryBuilder
    }

    // Typed stub for the Supabase client used throughout the server codebase
    const client = {
      // ---------------------------------------------------------------------
      // Enhanced query-builder with database constraint simulation
      // ---------------------------------------------------------------------
      from: vi.fn((tableName: string) => createQueryBuilder(tableName)),

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
                  action_link: `http://localhost:3000/auth/callback?token=${token}`
                }
              },
              error: null
            }
          }),
          deleteUser: vi.fn(async (uid) => {
            delete users[uid]
            return { data: null, error: null }
          })
        }
      },

      // ---------------------------------------------------------------------
      // Storage namespace (minimal stub)
      // ---------------------------------------------------------------------
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: null, error: null }),
          download: vi.fn().mockResolvedValue({ data: null, error: null }),
          remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        }))
      }
    }

    return client
  })
})

// Apply the Supabase mock - this must intercept the createClient calls in the database modules
vi.mock('@supabase/supabase-js', () => {
  const mockFactory = supabaseMockFactory()
  return {
    createClient: mockFactory.createClient,
    // Include any other exports that might be needed
    SupabaseClient: vi.fn(),
  }
})

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
  
  // Clear global data stores but preserve structure
  Object.keys(globalDataStores.users).forEach(key => delete globalDataStores.users[key])
  Object.keys(globalDataStores.podcastShows).forEach(key => delete globalDataStores.podcastShows[key])
  Object.keys(globalDataStores.podcastEpisodes).forEach(key => delete globalDataStores.podcastEpisodes[key])
  Object.keys(globalDataStores.transcripts).forEach(key => delete globalDataStores.transcripts[key])
  
  // Reset module registry so that subsequent suites get a *fresh* copy of
  // @supabase/supabase-js backed by our full-featured mock implementation.
  vi.resetModules()
  
  // Re-register the Supabase mock so subsequent suites start with a fresh
  // client that includes the full admin API. This counters overrides applied
  // by individual test files which might strip critical functionality.
  vi.mock('@supabase/supabase-js', () => {
    const mockFactory = supabaseMockFactory()
    return {
      createClient: mockFactory.createClient,
      SupabaseClient: vi.fn(),
    }
  })
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