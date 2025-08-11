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
  // Start with null to indicate we haven't determined if sync is needed
  const [needsSpotifySync, setNeedsSpotifySync] = useState<boolean | null>(null)
  // Store user auth provider and email
  const [authProvider, setAuthProvider] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  
  // New state for podcast list display
  const [shows, setShows] = useState<Array<{id: string, name: string, status: 'active' | 'inactive'}>>([])
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [showsError, setShowsError] = useState<string | null>(null)
  const [loadingPage, setLoadingPage] = useState<boolean>(false)
  
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
  const fetchSubscriptionStats = async (page: number = 1): Promise<void> => {
    if (!user) {
      logger.debug('No user, skipping subscription stats fetch')
      return
    }

    try {
      // Only show full loading state on initial load
      if (subscriptionCount === null) {
        setLoadingStats(true)
      } else {
        setLoadingPage(true)
      }
      setShowsError(null)
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        logger.error('Error getting session for stats:', sessionError)
        setLoadingStats(false) // Make sure to stop loading on early return
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/user/subscription-stats?page=${page}&limit=50`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json() as ErrorResponse
        logger.error('Failed to fetch subscription stats:', errorData.error)
        setShowsError('Failed to load podcast list. Please try again.')
        setLoadingStats(false) // Make sure to stop loading on error
        return
      }

      const data = await response.json() as SubscriptionStatsResponse
      
      if (data.success) {
        setSubscriptionCount(data.active_count)
        setShows(data.shows || [])
        setCurrentPage(data.page || 1)
        setTotalPages(data.total_pages || 1)
        logger.info(`User has ${data.active_count} active subscriptions, showing page ${data.page} of ${data.total_pages}`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Error fetching subscription stats:', errorMessage)
      setShowsError('An error occurred while loading podcasts.')
    } finally {
      // Always set loading to false to prevent stuck loading state
      setLoadingStats(false)
      setLoadingPage(false)
    }
  }

  // Fetch user auth info on component mount
  useEffect(() => {
    const fetchUserAuthInfo = async (): Promise<void> => {
      if (!user) return
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (!error && session) {
          const provider = session.user?.app_metadata?.provider
          const email = session.user?.email
          
          setAuthProvider(provider || 'unknown')
          setUserEmail(email || null)
        }
      } catch (error) {
        logger.error('Error fetching user auth info:', error)
      }
    }
    
    // Only fetch if we don't have the info yet
    if (user && !authProvider) {
      void fetchUserAuthInfo()
    }
  }, [user, authProvider])

  // Fetch subscription stats on component mount (but wait for Spotify sync if needed)
  useEffect(() => {
    // Only fetch if:
    // 1. We have a user
    // 2. We don't have a count yet
    // 3. We've determined if sync is needed (needsSpotifySync is not null)
    // 4. Either sync is not needed OR sync is complete
    if (user && subscriptionCount === null && needsSpotifySync === false) {
      void fetchSubscriptionStats(currentPage)
    }
  }, [user, subscriptionCount, needsSpotifySync, currentPage])

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
          setNeedsSpotifySync(false)
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }
        if (!session) {
          logger.warn('No session found - user needs to log in')
          setNeedsSpotifySync(false)
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }

        // Store the auth provider for checking if it's Spotify
        const provider = session.user?.app_metadata?.provider
        const email = session.user?.email
        
        // Set auth provider and email for display
        setAuthProvider(provider || 'unknown')
        setUserEmail(email || null)
        
        // Check if this is a Spotify OAuth session
        if (provider !== 'spotify') {
          logger.info(`User authenticated with ${provider || 'unknown'} provider, skipping Spotify sync`)
          setNeedsSpotifySync(false)
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
          setNeedsSpotifySync(false) // No sync needed for returning users
          // Mark as attempted to prevent infinite retries
          hasSynced.current = true
          return
        }

        // We have provider tokens - this is likely a new Spotify OAuth callback
        setNeedsSpotifySync(true)

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
          setNeedsSpotifySync(false) // Don't keep waiting on error
          // Try to fetch stats anyway
          await fetchSubscriptionStats(1)
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
          setNeedsSpotifySync(false) // Don't keep waiting on error
          // Try to fetch stats anyway - user might have existing subscriptions
          await fetchSubscriptionStats(1)
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
        setNeedsSpotifySync(false) // Sync is complete
        
        // Now fetch the subscription stats after sync is complete
        logger.info('Spotify sync completed, now fetching subscription stats...')
        await fetchSubscriptionStats(1)
        
        logger.info('Sync completed successfully, setting isSyncing to false')
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
        logger.error('Error syncing Spotify tokens or subsequent operations:', errorMessage)
        // CRITICAL: Always mark as attempted to prevent infinite loops
        hasSynced.current = true
        setNeedsSpotifySync(false) // Even on error, don't keep waiting
        // Try to fetch stats anyway in case some shows were synced
        await fetchSubscriptionStats(1)
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
        <div className="app-content">
          <div className="left-section">
            <div className="header-section">
              <h1>🎧 Listener</h1>
              <p>Delivered every day at 12p ET / 9a PT</p>
            </div>
            
            {/* Actions section on the left */}
            <div className="actions-section">
              {/* Authentication info box */}
              <div className="auth-info-box">
                {userEmail && (
                  <div className="auth-email">
                    <span className="auth-label">Email:</span>
                    <span className="auth-value">{userEmail}</span>
                  </div>
                )}
                <div className="auth-provider">
                  <span className="auth-label">Connection:</span>
                  <span className="auth-value">
                    {authProvider ? (
                      authProvider.charAt(0).toUpperCase() + authProvider.slice(1)
                    ) : (
                      'Loading...'
                    )}
                  </span>
                </div>
              </div>
              <div className="app-actions">
                <div className="action-item">
                  <svg className="action-icon" width="20" height="20" viewBox="0 0 16 18" fill="none">
                    <path d="M8 2L8 13M8 2L5 5M8 2L11 5" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 13L14 13" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <OPMLUpload />
                </div>
                <div className="action-item">
                  <svg className="action-icon" width="20" height="20" viewBox="0 0 16 18" fill="none">
                    <path d="M3 9L14 9M14 9L11 6M14 9L11 12" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 3L3 15" stroke="black" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span 
                    onClick={() => void handleLogout()} 
                    className="action-link"
                    role="button"
                    tabIndex={0}
                  >
                    Log out
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Podcast panel on the right */}
          <div className="right-section">
            <div className="subscription-stats">
              {loadingStats ? (
                <p className="stats-loading">
                  Loading subscriptions<span className="loading-ellipsis"></span>
                </p>
              ) : showsError ? (
                <div className="shows-error">
                  <p className="error-message">{showsError}</p>
                  <button 
                    onClick={() => void fetchSubscriptionStats(currentPage)}
                    className="retry-btn"
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : subscriptionCount !== null ? (
                <>
                  <div className="podcast-list">
                    <div className="list-header">
                      <p className="stats-count">
                        Subscribed to <strong>{subscriptionCount}</strong> {subscriptionCount === 1 ? 'podcast' : 'podcasts'}
                      </p>
                    </div>
                    <div className={`shows-container ${loadingPage ? 'loading-page' : ''}`}>
                      {loadingPage ? (
                        <div className="page-loading">
                          <div className="loading-spinner"></div>
                          <p>Loading page {currentPage}...</p>
                        </div>
                      ) : shows.length > 0 ? (
                        <div className="shows-list-wrapper">
                          {shows.map((show) => (
                            <div key={show.id} className={`show-item ${show.status === 'inactive' ? 'inactive' : ''}`}>
                              <span className="show-name">{show.name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="no-shows-page">
                          <p>No podcasts to display</p>
                        </div>
                      )}
                    </div>
                    {totalPages > 1 && (
                      <div className="pagination-controls">
                        <button
                          onClick={() => {
                            const newPage = currentPage - 1
                            setCurrentPage(newPage)
                            void fetchSubscriptionStats(newPage)
                          }}
                          disabled={currentPage === 1 || loadingPage}
                          className="pagination-btn"
                          type="button"
                        >
                          Previous
                        </button>
                        <span className="page-indicator">
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          onClick={() => {
                            const newPage = currentPage + 1
                            setCurrentPage(newPage)
                            void fetchSubscriptionStats(newPage)
                          }}
                          disabled={currentPage === totalPages || loadingPage}
                          className="pagination-btn"
                          type="button"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="stats-error">—</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppPage 