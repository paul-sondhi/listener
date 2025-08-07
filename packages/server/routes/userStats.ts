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
 * Get subscription statistics and podcast details for the authenticated user
 * Supports pagination with page and limit query parameters
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
      logger.error('auth', 'No access token found in cookie or Authorization header')
      res.status(401).json({ 
        success: false,
        error: 'Not authenticated' 
      })
      return
    }

    // Get the authenticated user
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
    if (authError || !user) {
      logger.error('auth', 'User authentication failed', { error: authError?.message })
      res.status(401).json({ 
        success: false,
        error: 'User authentication failed' 
      })
      return
    }

    const userId = user.id
    
    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 50))
    const offset = (page - 1) * limit
    
    logger.info('database', 'Fetching subscription stats', { metadata: { userId, page, limit } })
    
    const supabase = getSupabaseAdmin()
    
    // First, get total counts for all subscriptions
    const { data: countData, error: countError } = await supabase
      .from('user_podcast_subscriptions')
      .select('status')
      .eq('user_id', userId)
      .is('deleted_at', null)
    
    if (countError) {
      logger.error('database', 'Error fetching subscription counts', { error: countError.message })
      res.status(500).json({ error: 'Failed to fetch subscription statistics' })
      return
    }
    
    // Calculate counts from the data
    const activeCount = countData?.filter(sub => sub.status === 'active').length || 0
    const inactiveCount = countData?.filter(sub => sub.status === 'inactive').length || 0
    const totalCount = activeCount + inactiveCount
    
    // Get user's subscriptions first
    const { data: subscriptions, error: subsError } = await supabase
      .from('user_podcast_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
    
    if (subsError) {
      logger.error('database', 'Error fetching subscriptions', { error: subsError.message })
      res.status(500).json({ error: 'Failed to fetch subscriptions' })
      return
    }
    
    // If no subscriptions, return empty array
    if (!subscriptions || subscriptions.length === 0) {
      const response: SubscriptionStatsResponse = {
        active_count: 0,
        inactive_count: 0,
        total_count: 0,
        shows: [],
        page: 1,
        total_pages: 0,
        success: true
      }
      res.json(response)
      return
    }
    
    // Get unique show IDs
    const showIds = subscriptions.map(sub => sub.show_id)
    
    // Fetch podcast shows for those IDs
    const { data: podcastShows, error: showsError } = await supabase
      .from('podcast_shows')
      .select('id, title')
      .in('id', showIds)
    
    if (showsError) {
      logger.error('database', 'Error fetching podcast shows', { error: showsError.message })
      res.status(500).json({ error: 'Failed to fetch podcast details' })
      return
    }
    
    // Create a map of show_id to show title
    const showMap = new Map(podcastShows?.map(show => [show.id, show.title]) || [])
    
    // Format and sort the shows data
    const allShows = subscriptions.map(sub => ({
      id: sub.show_id,
      name: showMap.get(sub.show_id) || 'Unknown Podcast',
      status: sub.status as 'active' | 'inactive'
    }))
    
    // Sort alphabetically by name
    allShows.sort((a, b) => a.name.localeCompare(b.name))
    
    // Apply pagination
    const shows = allShows.slice(offset, offset + limit)
    
    // Calculate total pages
    const totalPages = Math.ceil(totalCount / limit)
    
    const response: SubscriptionStatsResponse = {
      active_count: activeCount,
      inactive_count: inactiveCount,
      total_count: totalCount,
      shows: shows,
      page: page,
      total_pages: totalPages,
      success: true
    }
    
    logger.info('database', 'User subscription stats fetched', { 
      metadata: {
        userId, 
        activeCount, 
        inactiveCount, 
        page, 
        totalPages
      }
    })
    
    res.json(response)
  } catch (error) {
    logger.error('system', 'Unexpected error in subscription-stats endpoint', { metadata: { error } })
    res.status(500).json({ error: 'An unexpected error occurred' })
  }
})

export default router