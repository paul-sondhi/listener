import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ApiResponse, SubscriptionStatsResponse } from '@listener/shared'
import ReauthPrompt from './ReauthPrompt'
import OPMLUpload from './OPMLUpload'
import { logger } from '../lib/logger'

// Get the API base URL from environment variables
// Default to an empty string for relative paths if not set (for local development)
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || ''

// Interface for API error response
interface ErrorResponse {
  error: string
}

// Interface for sync shows response
interface SyncShowsResponse extends ApiResponse {
  active_count?: number
  inactive_count?: number
  cached_data?: boolean
  last_sync?: string
  shows?: Array<{
    id: string
    name: string
    spotify_id?: string
  }>
}

/**
 * AppPage Component
 * Main application page that handles podcast transcript downloads
 * and Spotify token synchronization
 */
const AppPage = (): React.JSX.Element => {
  const { user, signOut, clearReauthFlag, checkReauthStatus: _checkReauthStatus } = useAuth()
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null)
  const [loadingStats, setLoadingStats] = useState<boolean>(true)
  
  // Use ref to track if we've already synced for this user session
  const hasSynced = useRef<boolean>(false)

  /**
   * Track whether the component is still mounted to avoid calling setState
   * after Jest/Vitest unmounts the component (e.g. at the end of a test).
   * React will warn if we call setState on an unmounted component and, in
   * JSDOM test environments, the global `window` object can be torn down
   * which leads to `window is not defined` unhandled rejections. Guarding
   * updates with this ref prevents those noisy errors without affecting
   * production behaviour.
   */
  const isMounted = useRef(true)
  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  /**
   * Fetch subscription statistics for the current user
   */
  const fetchSubscriptionStats = async (): Promise<void> => {
    console.log('[SUBSCRIPTION STATS] Starting fetch, user:', user?.id)
    if (!user) {
      logger.debug('No user, skipping subscription stats fetch')
      return
    }

    try {
      setLoadingStats(true)
      console.log('[SUBSCRIPTION STATS] Set loading to true')
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('[SUBSCRIPTION STATS] Got session:', !!session, 'error:', sessionError)
      if (sessionError || !session) {
        logger.error('Error getting session for stats:', sessionError)
        setLoadingStats(false) // Make sure to stop loading on early return
        return
      }

      console.log('[SUBSCRIPTION STATS] Fetching from:', `${API_BASE_URL}/api/user/subscription-stats`)
      const response = await fetch(`${API_BASE_URL}/api/user/subscription-stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      console.log('[SUBSCRIPTION STATS] Response status:', response.status)
      if (!response.ok) {
        const errorData = await response.json() as ErrorResponse
        logger.error('Failed to fetch subscription stats:', errorData.error)
        setLoadingStats(false) // Make sure to stop loading on error
        return
      }

      const data = await response.json() as SubscriptionStatsResponse
      console.log('[SUBSCRIPTION STATS] Response data:', data)
      
      if (data.success) {
        setSubscriptionCount(data.active_count)
        logger.info(`User has ${data.active_count} active subscriptions`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[SUBSCRIPTION STATS] Caught error:', error)
      logger.error('Error fetching subscription stats:', errorMessage)
    } finally {
      console.log('[SUBSCRIPTION STATS] Finally block, isMounted:', isMounted.current)
      // Always set loading to false to prevent stuck loading state
      setLoadingStats(false)
      console.log('[SUBSCRIPTION STATS] Set loading to false')
    }
  }

  // Fetch subscription stats on component mount (separate from Spotify sync)
  useEffect(() => {
    if (user) {
      void fetchSubscriptionStats()
    }
  }, [user])

  // Sync Spotify tokens on component mount
  useEffect(() => {
    /**
     * Synchronize Spotify tokens and user shows
     */
    const syncSpotifyTokens = async (): Promise<void> => {
      // Prevent multiple simultaneous sync attempts or re-syncing for same user
      if (isSyncing || hasSynced.current) {
        logger.debug('Sync already in progress or completed, skipping...')
        return
      }

      try {
        setIsSyncing(true)
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          logger.error('Error getting session:', sessionError)
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }
        if (!session) {
          logger.warn('No session found - user needs to log in')
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }

        // Store the auth provider for checking if it's Spotify
        const provider = session.user?.app_metadata?.provider
        
        // Check if this is a Spotify OAuth session
        if (provider !== 'spotify') {
          logger.info(`User authenticated with ${provider || 'unknown'} provider, skipping Spotify sync`)
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }

        const accessToken: string | null | undefined = session.provider_token
        const refreshToken: string | null | undefined = session.provider_refresh_token
        const expiresAt: number | undefined = session.expires_at
        const supabaseAccessToken: string | undefined = session?.access_token

        // NEW: Ensure we have a Supabase access token before proceeding
        if (!supabaseAccessToken) {
          logger.error('Missing Supabase access token – cannot authenticate backend request')
          // Prevent endless retry loops
          hasSynced.current = true
          return
        }

        // Only proceed if we have all required tokens
        if (!accessToken || !refreshToken || !expiresAt) {
          logger.warn('Missing Spotify tokens:', { 
            hasAccessToken: !!accessToken, 
            hasRefreshToken: !!refreshToken, 
            hasExpiresAt: !!expiresAt 
          })
          // Skip token sync if provider tokens are missing (common after session refresh)
          // Users don't return to the app after initial auth, so this is expected behavior
          logger.info('Skipping token sync - provider tokens not available in refreshed session')
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }

        logger.info('Storing Spotify tokens...')
        const storeResponse: globalThis.Response = await fetch(`${API_BASE_URL}/api/store-spotify-tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAccessToken}`
          },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt
          })
        })

        if (!storeResponse.ok) {
          const errorData = await storeResponse.json() as ErrorResponse
          const errorMessage = errorData.error || 'Failed to store Spotify tokens'
          logger.error('Token storage failed:', errorMessage)
          // CRITICAL: Mark as attempted even on failure to prevent infinite loops
          hasSynced.current = true
          return
        }

        logger.info('Successfully stored tokens, clearing reauth flag...')
        try {
          await clearReauthFlag()
        } catch (clearError) {
          // Don't fail the entire flow if clearing reauth flag fails
          logger.warn('Failed to clear reauth flag:', clearError)
        }

        logger.info('Now syncing shows...')
        const syncResponse: globalThis.Response = await fetch(`${API_BASE_URL}/api/sync-spotify-shows`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAccessToken}`
          }
        })

        if (!syncResponse.ok) {
          const errorData = await syncResponse.json() as ErrorResponse
          const errorMessage = errorData.error || 'Failed to sync Spotify shows'
          logger.error('Show sync failed:', errorMessage)
          // Mark as attempted since token storage succeeded
          hasSynced.current = true
          return
        }

        const result = await syncResponse.json() as SyncShowsResponse
        
        if (result.cached_data) {
          logger.info('Retrieved cached Spotify shows:', result)
          logger.info(`Showing ${result.active_count || 0} cached subscriptions. ${result.last_sync || 'Next refresh scheduled automatically.'}`)
        } else {
          logger.info('Successfully synced Spotify shows:', result)
          logger.info(`Synced ${result.active_count || 0} active subscriptions`)
        }
        
        // Mark as successfully synced for this session
        hasSynced.current = true
        logger.info('Sync completed successfully, setting isSyncing to false')
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
        logger.error('Error syncing Spotify tokens or subsequent operations:', errorMessage)
        // CRITICAL: Always mark as attempted to prevent infinite loops
        hasSynced.current = true
      } finally {
        // Always set syncing to false when done
        setIsSyncing(false)
      }
    }

    // Only try to sync if we have a user and we haven't synced yet
    if (user && !hasSynced.current) {
      void syncSpotifyTokens()
    }
  }, [user, clearReauthFlag, isSyncing]) // Add dependencies for completeness

  // Reset sync status when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      hasSynced.current = false
    }
  }, [user])


  /**
   * Handle user logout
   */
  const handleLogout = async (): Promise<void> => {
    try {
      // eslint-disable-next-line no-console
      console.log('LOGOUT: handleLogout called');
      await signOut()
      // eslint-disable-next-line no-console
      console.log('LOGOUT: signOut completed successfully');
      // Reset sync status on logout
      hasSynced.current = false
      // eslint-disable-next-line no-console
      console.log('LOGOUT: hasSynced reset to false');
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      // eslint-disable-next-line no-console
      console.error('LOGOUT: signOut failed:', errorMessage);
      logger.error('Error during logout:', errorMessage)
    }
  }


  return (
    <div className="app-page">
      {/* Reauth prompt overlay - shows when user needs to re-authenticate */}
      <ReauthPrompt />
      
      {!user ? (
        <div className="login-prompt">
          <p>Please log in to access Listener.</p>
          <p>Go back to the login page to authenticate.</p>
        </div>
      ) : (
        <>
          <div className="user-info">
            <h1>You're in!</h1>
            <div className="subscription-stats">
              {loadingStats ? (
                <p className="stats-loading">Loading subscriptions...</p>
              ) : subscriptionCount !== null ? (
                <p className="stats-count">
                  📚 Subscribed to <strong>{subscriptionCount}</strong> {subscriptionCount === 1 ? 'podcast' : 'podcasts'}
                </p>
              ) : (
                <p className="stats-error">—</p>
              )}
            </div>
            <p>Listener will be delivered to your inbox every day at 12p ET / 9a PT</p>
            <div className="app-buttons">
              <OPMLUpload />
              <button 
                onClick={() => void handleLogout()} 
                className="logout-btn"
                type="button"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default AppPage 