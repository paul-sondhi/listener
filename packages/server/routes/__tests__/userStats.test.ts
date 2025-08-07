import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import userStatsRouter from '../userStats.js'
import type { SubscriptionStatsResponse } from '@listener/shared'

// Mock the Supabase client
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser
    },
    from: mockFrom
  }))
}))

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}))

describe('userStats route', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use('/api/user', userStatsRouter)
    vi.clearAllMocks()
    
    // Set up environment variables for tests
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/user/subscription-stats', () => {
    it('should return subscription stats with podcast details for authenticated user', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock count data for first query
      const mockCountData = [
        { status: 'active' },
        { status: 'active' },
        { status: 'active' },
        { status: 'inactive' }
      ]

      // Mock subscriptions data for second query
      const mockSubscriptions = [
        { id: 'sub-1', status: 'active', show_id: 'show-1', user_id: 'test-user-id' },
        { id: 'sub-2', status: 'active', show_id: 'show-2', user_id: 'test-user-id' },
        { id: 'sub-3', status: 'active', show_id: 'show-3', user_id: 'test-user-id' },
        { id: 'sub-4', status: 'inactive', show_id: 'show-4', user_id: 'test-user-id' }
      ]

      // Mock shows data for third query
      const mockShows = [
        { id: 'show-1', title: 'Podcast A' },
        { id: 'show-2', title: 'Podcast B' },
        { id: 'show-3', title: 'Podcast C' },
        { id: 'show-4', title: 'Podcast D' }
      ]

      // First call returns count query
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: mockCountData,
              error: null
            }))
          }))
        }))
      })

      // Second call returns subscriptions
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: mockSubscriptions,
              error: null
            }))
          }))
        }))
      })

      // Third call returns shows
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({
            data: mockShows,
            error: null
          }))
        }))
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(3)
      expect(body.inactive_count).toBe(1)
      expect(body.total_count).toBe(4)
      expect(body.shows).toBeDefined()
      expect(body.shows).toHaveLength(4)
      expect(body.shows![0]).toEqual({
        id: 'show-1',
        name: 'Podcast A',
        status: 'active'
      })
      expect(body.page).toBe(1)
      expect(body.total_pages).toBe(1)
    })

    it('should return zeros for user with no subscriptions', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // First call returns empty count data
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: [],
              error: null
            }))
          }))
        }))
      })

      // Second call returns empty subscriptions
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: [],
              error: null
            }))
          }))
        }))
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(0)
      expect(body.inactive_count).toBe(0)
      expect(body.total_count).toBe(0)
      expect(body.shows).toEqual([])
      expect(body.page).toBe(1)
      expect(body.total_pages).toBe(0)
    })

    it('should handle pagination correctly', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock count data for 60 podcasts
      const mockCountData = Array(60).fill({ status: 'active' })

      // Mock subscriptions for all 60 podcasts
      const mockSubscriptions = Array(60).fill(null).map((_, i) => ({
        id: `sub-${i}`,
        status: 'active',
        show_id: `show-${i}`,
        user_id: 'test-user-id'
      }))

      // Mock shows data for all 60 podcasts
      const mockShows = Array(60).fill(null).map((_, i) => ({
        id: `show-${i}`,
        title: `Podcast ${String(i).padStart(2, '0')}`
      }))

      // First call returns count query
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: mockCountData,
              error: null
            }))
          }))
        }))
      })

      // Second call returns all subscriptions
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: mockSubscriptions,
              error: null
            }))
          }))
        }))
      })

      // Third call returns all shows
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({
            data: mockShows,
            error: null
          }))
        }))
      })

      const response = await request(app)
        .get('/api/user/subscription-stats?page=2&limit=50')
        .set('Authorization', 'Bearer test-token')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.total_count).toBe(60)
      expect(body.shows).toHaveLength(10)
      expect(body.page).toBe(2)
      expect(body.total_pages).toBe(2)
    })

    it('should return 401 for unauthenticated request', async () => {
      // No authorization header provided
      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(401)

      expect(response.body.error).toBe('Not authenticated')
    })

    it('should handle database errors gracefully', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock database error on first query
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Database connection failed' }
            }))
          }))
        }))
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(500)

      expect(response.body.error).toBe('Failed to fetch subscription statistics')
    })

    it('should handle null data from database', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock null data for all queries
      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            }))
          }))
        }))
      })
      
      // Override for third query (shows) which uses .in()
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            }))
          }))
        }))
      })
      
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: null,
              error: null
            }))
          }))
        }))
      })
      
      mockFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({
            data: null,
            error: null
          }))
        }))
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(0)
      expect(body.inactive_count).toBe(0)
      expect(body.total_count).toBe(0)
      expect(body.shows).toEqual([])
    })

    it('should handle auth errors', async () => {
      // Mock auth error
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body.error).toBe('User authentication failed')
    })

    it('should handle missing environment variables', async () => {
      // Temporarily remove env vars
      const originalUrl = process.env.SUPABASE_URL
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(401)

      expect(response.body.error).toBe('User authentication failed')

      // Restore env vars
      process.env.SUPABASE_URL = originalUrl
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
    })
  })
})