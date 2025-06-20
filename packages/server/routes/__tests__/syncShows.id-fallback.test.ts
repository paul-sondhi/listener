/**
 * Sync Shows ID Fallback Tests
 * 
 * These tests ensure that the sync shows route properly handles ID retrieval
 * from upsert operations and prevents Spotify URLs from being used as UUIDs
 * in production environments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'

// Mock modules before importing the route
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}))

vi.mock('../../lib/encryptedTokenHelpers.js', () => ({
  getUserSecret: vi.fn()
}))

// Import after mocking
import syncShowsRouter, { __setSupabaseAdminForTesting } from '../syncShows.js'
import { createClient } from '@supabase/supabase-js'
import { getUserSecret } from '../../lib/encryptedTokenHelpers.js'

describe('Sync Shows ID Fallback Logic', () => {
  let app: express.Express
  let mockSupabaseClient: any
  let mockCreateClient: any
  let mockGetUserSecret: any
  let podcastShowsTableMock: any
  let subscriptionsTableMock: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up Express app
    app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use('/sync-spotify-shows', syncShowsRouter)

    // Set up mock functions
    mockCreateClient = vi.mocked(createClient)
    mockGetUserSecret = vi.mocked(getUserSecret)

    // Create table-specific mocks that can be modified in tests
    podcastShowsTableMock = {
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'test-uuid-123' }],
          error: null
        })
      })
    }

    subscriptionsTableMock = {
      upsert: vi.fn().mockResolvedValue({
        data: null,
        error: null
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null
        })
      }),
      update: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: null,
          error: null
        })
      })
    }

    // Create a comprehensive mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
          error: null
        })
      },
      from: vi.fn((table: string) => {
        if (table === 'podcast_shows') {
          return podcastShowsTableMock
        } else if (table === 'user_podcast_subscriptions') {
          return subscriptionsTableMock
        }
        // Default fallback
        return {
          upsert: vi.fn(),
          select: vi.fn(),
          update: vi.fn()
        }
      })
    }

    // Set up the mocked createClient to return our mock client
    mockCreateClient.mockReturnValue(mockSupabaseClient)

    // Set up encrypted token mock
    mockGetUserSecret.mockResolvedValue({
      success: true,
      data: {
        access_token: 'mock_token',
        refresh_token: 'mock_refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'scope'
      }
    })

    // Mock global fetch for Spotify API
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          show: {
            id: 'spotify123',
            name: 'Test Show',
            description: 'Test Description',
            images: [{ url: 'http://example.com/image.jpg' }]
          }
        }],
        next: null
      }),
      headers: new Map()
    })

    // Use the testing helper to inject our mock
    __setSupabaseAdminForTesting(mockSupabaseClient)
  })

  it('should use proper UUID when upsert returns valid ID', async () => {
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', 'sb-access-token=mock_token')

    expect(response.status).toBe(200)
    
    // Verify that the subscription upsert was called with the proper UUID, not the Spotify URL
    // We need to check calls to the from function and then the upsert method
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_podcast_subscriptions')
    
    // Check that the subscription upsert was called with the correct data
    expect(subscriptionsTableMock.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-123',
          show_id: 'test-uuid-123', // Should be the UUID, not the Spotify URL
          status: 'active'
        })
      ]),
      expect.any(Object)
    )
  })

  it('should throw error in production when upsert does not return ID', async () => {
    // Set production environment
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      // Mock the podcast_shows table to return no ID
      podcastShowsTableMock.upsert.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{}], // No ID in response
          error: null
        })
      })

      const response = await request(app)
        .post('/sync-spotify-shows')
        .set('Cookie', 'sb-access-token=mock_token')

      expect(response.status).toBe(500)
      expect(response.body.error).toContain('Failed to get podcast show ID')
    } finally {
      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('should allow fallback to Spotify URL in test environment', async () => {
    // Set test environment
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'

    try {
      // Mock the podcast_shows table to return no ID
      podcastShowsTableMock.upsert.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{}], // No ID in response
          error: null
        })
      })

      const response = await request(app)
        .post('/sync-spotify-shows')
        .set('Cookie', 'sb-access-token=mock_token')

      // In test environment, it should succeed with Spotify URL fallback
      expect(response.status).toBe(200)
    } finally {
      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv
    }
  })
}) 