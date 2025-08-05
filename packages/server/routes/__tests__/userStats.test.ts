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
    it('should return subscription stats for authenticated user', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock Supabase response with test data
      const mockData = [
        { status: 'active' },
        { status: 'active' },
        { status: 'active' },
        { status: 'inactive' }
      ]

      mockFrom.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve({
              data: mockData,
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
      expect(body.active_count).toBe(3)
      expect(body.inactive_count).toBe(1)
      expect(body.total_count).toBe(4)
    })

    it('should return zeros for user with no subscriptions', async () => {
      // Mock successful auth
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      })

      // Mock empty data
      mockFrom.mockReturnValue({
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

      // Mock database error
      mockFrom.mockReturnValue({
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

      // Mock null data
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

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .set('Authorization', 'Bearer test-token')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(0)
      expect(body.inactive_count).toBe(0)
      expect(body.total_count).toBe(0)
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