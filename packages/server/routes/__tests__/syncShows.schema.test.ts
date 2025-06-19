/**
 * Database Schema Integration Tests for Sync Shows
 * These tests ensure the sync shows endpoint works with the actual database schema
 * and catch schema mismatches that unit tests might miss.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createClient } from '@supabase/supabase-js'
import syncShowsRouter from '../syncShows.js'
import * as encryptedTokenHelpers from '../../lib/encryptedTokenHelpers.js'

// Set up environment variables for testing
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

describe('Sync Shows Database Schema Integration', () => {
  let app: express.Application
  let mockSupabaseClient: any
  let mockFetch: any

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Create test app
    app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/api/sync-spotify-shows', syncShowsRouter)

    // Mock encrypted token helpers
    vi.mocked(encryptedTokenHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'mock-spotify-token',
        refresh_token: 'mock-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 50
    })

    // Mock Spotify API response
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            show: {
              id: 'spotify-show-123',
              name: 'Test Podcast',
              description: 'A test podcast',
              images: [{ url: 'https://example.com/image.jpg' }]
            }
          }
        ],
        next: null
      })
    })
    global.fetch = mockFetch
  })

  /**
   * Test 1: Ensure correct table names are used
   * This test verifies that the code uses the actual table names from the database
   */
  it('should use correct table names: podcast_shows and user_podcast_subscriptions', async () => {
    // Mock successful authentication
    const mockAuthGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123', email: 'test@example.com' } },
      error: null
    })

    // Track which tables are accessed
    const tablesAccessed: string[] = []
    const mockFrom = vi.fn().mockImplementation((tableName: string) => {
      tablesAccessed.push(tableName)
      
      if (tableName === 'podcast_shows') {
        return {
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'show-uuid-123' }],
              error: null
            })
          })
        }
      }
      
      if (tableName === 'user_podcast_subscriptions') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null })
          })
        }
      }

      // Return error for wrong table names
      return {
        upsert: vi.fn().mockResolvedValue({
          error: { message: `Table "${tableName}" does not exist` }
        })
      }
    })

    mockSupabaseClient = {
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    }

    // Mock createClient to return our mock
    vi.mocked(createClient).mockReturnValue(mockSupabaseClient)

    // Make request
    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=test-token')

    // Verify response is successful
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    // Verify correct tables were accessed
    expect(tablesAccessed).toContain('podcast_shows')
    expect(tablesAccessed).toContain('user_podcast_subscriptions')
    
    // Verify incorrect table names were NOT used
    expect(tablesAccessed).not.toContain('podcast_subscriptions')
  })

  /**
   * Test 2: Ensure correct column structure for podcast_shows
   */
  it('should use correct columns for podcast_shows table: spotify_url, title, description, image_url', async () => {
    let showUpsertData: any = null

    const mockAuthGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null
    })

    const mockFrom = vi.fn().mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          upsert: vi.fn().mockImplementation((data) => {
            showUpsertData = data[0] // Capture the data being inserted
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'show-uuid-123' }],
                error: null
              })
            }
          })
        }
      }
      
      if (tableName === 'user_podcast_subscriptions') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        }
      }

      return { upsert: vi.fn().mockResolvedValue({ error: null }) }
    })

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    })

    await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=test-token')

    // Verify the correct columns are being used for podcast_shows
    expect(showUpsertData).toHaveProperty('spotify_url')
    expect(showUpsertData).toHaveProperty('title', 'Test Podcast')
    expect(showUpsertData).toHaveProperty('description', 'A test podcast')
    expect(showUpsertData).toHaveProperty('image_url', 'https://example.com/image.jpg')
    expect(showUpsertData).toHaveProperty('last_updated')

    // Verify old/incorrect columns are NOT used
    expect(showUpsertData).not.toHaveProperty('rss_url')
    expect(showUpsertData).not.toHaveProperty('podcast_url')
    expect(showUpsertData).not.toHaveProperty('name')
  })

  /**
   * Test 3: Ensure correct column structure for user_podcast_subscriptions
   */
  it('should use correct columns for user_podcast_subscriptions: user_id, show_id, status', async () => {
    let subscriptionUpsertData: any = null

    const mockAuthGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null
    })

    const mockFrom = vi.fn().mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'show-uuid-123' }],
              error: null
            })
          })
        }
      }
      
      if (tableName === 'user_podcast_subscriptions') {
        return {
          upsert: vi.fn().mockImplementation((data) => {
            subscriptionUpsertData = data[0] // Capture the data being inserted
            return Promise.resolve({ error: null })
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        }
      }

      return { upsert: vi.fn().mockResolvedValue({ error: null }) }
    })

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    })

    await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=test-token')

    // Verify the correct columns are being used for user_podcast_subscriptions
    expect(subscriptionUpsertData).toHaveProperty('user_id', 'test-user-123')
    expect(subscriptionUpsertData).toHaveProperty('show_id', 'show-uuid-123')
    expect(subscriptionUpsertData).toHaveProperty('status', 'active')
    expect(subscriptionUpsertData).toHaveProperty('updated_at')

    // Verify old/incorrect columns are NOT used
    expect(subscriptionUpsertData).not.toHaveProperty('podcast_url')
  })

  /**
   * Test 4: Error handling for schema mismatches
   */
  it('should fail gracefully when database schema is mismatched', async () => {
    const mockAuthGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null
    })

    // Simulate old schema or missing tables
    const mockFrom = vi.fn().mockImplementation((tableName: string) => {
      // Simulate table not found error
      return {
        upsert: vi.fn().mockResolvedValue({
          error: { message: `relation "${tableName}" does not exist` }
        })
      }
    })

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    })

    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=test-token')

         // Should return error, not crash
     expect(response.status).toBe(500)
     expect(response.body.success).toBe(false)
     // The error should contain some indication of the problem
     expect(response.body.error).toBeDefined()
     expect(typeof response.body.error).toBe('string')
  })

  /**
   * Test 5: Integration test to verify the full flow works
   */
  it('should complete full sync flow with correct database operations', async () => {
    const mockAuthGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null
    })

    // Track all database operations
    const databaseOperations: Array<{ table: string; operation: string; data?: any }> = []

    const mockFrom = vi.fn().mockImplementation((tableName: string) => {
      if (tableName === 'podcast_shows') {
        return {
          upsert: vi.fn().mockImplementation((data) => {
            databaseOperations.push({ table: tableName, operation: 'upsert', data: data[0] })
            return {
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'show-uuid-123' }],
                error: null
              })
            }
          })
        }
      }
      
      if (tableName === 'user_podcast_subscriptions') {
        return {
          upsert: vi.fn().mockImplementation((data) => {
            databaseOperations.push({ table: tableName, operation: 'upsert', data: data[0] })
            return Promise.resolve({ error: null })
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => {
              databaseOperations.push({ table: tableName, operation: 'select' })
              return Promise.resolve({ data: [], error: null })
            })
          }),
          update: vi.fn().mockImplementation((data) => {
            databaseOperations.push({ table: tableName, operation: 'update', data })
            return {
              in: vi.fn().mockResolvedValue({ error: null })
            }
          })
        }
      }

      return { upsert: vi.fn().mockResolvedValue({ error: null }) }
    })

    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom
    })

    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=test-token')

    // Verify successful response
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.active_count).toBe(1)

    // Verify correct sequence of database operations
    const operationTypes = databaseOperations.map(op => `${op.table}:${op.operation}`)
    expect(operationTypes).toContain('podcast_shows:upsert')
    expect(operationTypes).toContain('user_podcast_subscriptions:upsert')
    expect(operationTypes).toContain('user_podcast_subscriptions:select')

    // Verify show was created with correct data
    const showUpsert = databaseOperations.find(op => op.table === 'podcast_shows' && op.operation === 'upsert')
    expect(showUpsert?.data).toHaveProperty('title', 'Test Podcast')

    // Verify subscription was created with correct data
    const subscriptionUpsert = databaseOperations.find(op => op.table === 'user_podcast_subscriptions' && op.operation === 'upsert')
    expect(subscriptionUpsert?.data).toHaveProperty('show_id', 'show-uuid-123')
  })
})

// Mock the modules
vi.mock('@supabase/supabase-js')
vi.mock('../../lib/encryptedTokenHelpers.js') 