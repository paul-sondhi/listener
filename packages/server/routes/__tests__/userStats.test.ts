import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import userStatsRouter from '../userStats.js'
import type { SubscriptionStatsResponse } from '@listener/shared'

// Mock the auth middleware
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: vi.fn((req: any, res: any, next: any) => {
    // Default: authenticated user
    req.user = { id: 'test-user-id' }
    next()
  })
}))

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => Promise.resolve({
            data: null,
            error: null
          }))
        }))
      }))
    }))
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

import { requireAuth } from '../../middleware/auth.js'
import { createClient } from '@supabase/supabase-js'

describe('userStats route', () => {
  let app: express.Application

  beforeEach(() => {
    app = express()
    app.use(express.json())
    app.use('/api/user', userStatsRouter)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/user/subscription-stats', () => {
    it('should return subscription stats for authenticated user', async () => {
      // Mock Supabase response with test data
      const mockData = [
        { status: 'active' },
        { status: 'active' },
        { status: 'active' },
        { status: 'inactive' }
      ]

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({
                data: mockData,
                error: null
              }))
            }))
          }))
        }))
      }

      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(3)
      expect(body.inactive_count).toBe(1)
      expect(body.total_count).toBe(4)
    })

    it('should return zeros for user with no subscriptions', async () => {
      // Mock Supabase response with empty data
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({
                data: [],
                error: null
              }))
            }))
          }))
        }))
      }

      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(0)
      expect(body.inactive_count).toBe(0)
      expect(body.total_count).toBe(0)
    })

    it('should return 401 for unauthenticated request', async () => {
      // Mock requireAuth to simulate unauthenticated user
      vi.mocked(requireAuth).mockImplementation((req: any, res: any) => {
        res.status(401).json({ error: 'Unauthorized' })
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(401)

      expect(response.body.error).toBe('Unauthorized')
    })

    it('should handle database errors gracefully', async () => {
      // Mock Supabase error
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({
                data: null,
                error: { message: 'Database connection failed' }
              }))
            }))
          }))
        }))
      }

      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(500)

      expect(response.body.error).toBe('Failed to fetch subscription statistics')
    })

    it('should handle null data from database', async () => {
      // Mock Supabase response with null data
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({
                data: null,
                error: null
              }))
            }))
          }))
        }))
      }

      vi.mocked(createClient).mockReturnValue(mockSupabase as any)

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(200)

      const body = response.body as SubscriptionStatsResponse
      expect(body.success).toBe(true)
      expect(body.active_count).toBe(0)
      expect(body.inactive_count).toBe(0)
      expect(body.total_count).toBe(0)
    })

    it('should handle user without id', async () => {
      // Mock requireAuth to pass through but without user id
      vi.mocked(requireAuth).mockImplementation((req: any, res: any, next: any) => {
        req.user = {} // User object without id
        next()
      })

      const response = await request(app)
        .get('/api/user/subscription-stats')
        .expect(401)

      expect(response.body.error).toBe('User not authenticated')
    })
  })
})