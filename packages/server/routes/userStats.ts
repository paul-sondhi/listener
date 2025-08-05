import express, { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'
import type { SubscriptionStatsResponse } from '@listener/shared'

const router: Router = express.Router()

/**
 * GET /api/user/subscription-stats
 * Get subscription statistics for the authenticated user
 */
router.get('/subscription-stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' })
      return
    }

    logger.info(`Fetching subscription stats for user: ${userId}`)
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Missing Supabase configuration')
      res.status(500).json({ error: 'Server configuration error' })
      return
    }
    
    const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey)
    
    // Query user_podcast_subscriptions table for active and inactive counts
    const { data, error } = await supabase
      .from('user_podcast_subscriptions')
      .select('status')
      .eq('user_id', userId)
      .is('deleted_at', null)
    
    if (error) {
      logger.error('Error fetching subscription stats:', error)
      res.status(500).json({ error: 'Failed to fetch subscription statistics' })
      return
    }
    
    // Calculate counts from the data
    const activeCount = data?.filter(sub => sub.status === 'active').length || 0
    const inactiveCount = data?.filter(sub => sub.status === 'inactive').length || 0
    const totalCount = activeCount + inactiveCount
    
    const response: SubscriptionStatsResponse = {
      active_count: activeCount,
      inactive_count: inactiveCount,
      total_count: totalCount,
      success: true
    }
    
    logger.info(`User ${userId} has ${activeCount} active and ${inactiveCount} inactive subscriptions`)
    
    res.json(response)
  } catch (error) {
    logger.error('Unexpected error in subscription-stats endpoint:', error)
    res.status(500).json({ error: 'An unexpected error occurred' })
  }
})

export default router