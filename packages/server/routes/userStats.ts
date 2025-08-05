import express, { Router, Request, Response } from 'express'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'
import type { SubscriptionStatsResponse, Database } from '@listener/shared'

const router: Router = express.Router()

// Initialize Supabase Admin client lazily with proper typing
let supabaseAdmin: SupabaseClient<Database> | null = null

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseAdmin
}

/**
 * GET /api/user/subscription-stats
 * Get subscription statistics for the authenticated user
 */
router.get('/subscription-stats', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check for Supabase environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      res.status(401).json({
        success: false,
        error: 'User authentication failed'
      })
      return
    }

    // Try to get the token from the cookie, or from the Authorization header
    let token: string | undefined = req.cookies?.['sb-access-token'] as string
    
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1]
    }
    
    if (!token) {
      logger.error('No access token found in cookie or Authorization header')
      res.status(401).json({ 
        success: false,
        error: 'Not authenticated' 
      })
      return
    }

    // Get the authenticated user
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
    if (authError || !user) {
      logger.error('User authentication failed:', authError?.message)
      res.status(401).json({ 
        success: false,
        error: 'User authentication failed' 
      })
      return
    }

    const userId = user.id
    logger.info(`Fetching subscription stats for user: ${userId}`)
    
    const supabase = getSupabaseAdmin()
    
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