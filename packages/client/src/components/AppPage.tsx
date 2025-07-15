import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ApiResponse } from '@listener/shared'
import ReauthPrompt from './ReauthPrompt'
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
}

/**
 * AppPage Component
 * Main application page that handles podcast transcript downloads
 * and Spotify token synchronization
 */
const AppPage = (): React.JSX.Element => {
  const { user, signOut, clearReauthFlag, checkReauthStatus: _checkReauthStatus } = useAuth()
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  
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
        setError(null)
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          logger.error('Error getting session:', sessionError)
          setError(sessionError.message)
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

        // Check if this is a Spotify OAuth session
        if (session.user?.app_metadata?.provider !== 'spotify') {
          logger.warn('User not authenticated with Spotify')
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
          setError('Authentication error: missing session token. Please log out and sign in again.')
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
          setError('Spotify authentication incomplete. Please log in again.')
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
          const errorData: ErrorResponse = await storeResponse.json()
          const errorMessage = errorData.error || 'Failed to store Spotify tokens'
          logger.error('Token storage failed:', errorMessage)
          setError(`Authentication error: ${errorMessage}`)
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
          const errorData: ErrorResponse = await syncResponse.json()
          const errorMessage = errorData.error || 'Failed to sync Spotify shows'
          logger.error('Show sync failed:', errorMessage)
          setError(`Sync error: ${errorMessage}`)
          // Mark as attempted since token storage succeeded
          hasSynced.current = true
          return
        }

        const result: SyncShowsResponse = await syncResponse.json()
        logger.info('Successfully synced Spotify shows:', result)
        
        // Mark as successfully synced for this session
        hasSynced.current = true
        logger.info('Sync completed successfully, setting isSyncing to false')
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
        logger.error('Error syncing Spotify tokens or subsequent operations:', errorMessage)
        setError(`Authentication error: ${errorMessage}`)
        // CRITICAL: Always mark as attempted to prevent infinite loops
        hasSynced.current = true
      } finally {
        // Always set syncing to false when done
        setIsSyncing(false)
      }
    }

    // Only try to sync if we have a user and we haven't synced yet
    if (user && !hasSynced.current) {
      syncSpotifyTokens()
    }
  }, [user, clearReauthFlag]) // Add clearReauthFlag to dependencies for completeness

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
          <p>Please log in with Spotify to access the transcript downloader.</p>
          <p>Go back to the login page to authenticate with Spotify.</p>
        </div>
      ) : (
        <>
          <div className="user-info">
            <h1>You're in!</h1>
            <p>Look out for an email from Listener every day at 12p ET / 9a PT.</p>
            <button 
              onClick={handleLogout} 
              className="logout-btn"
              type="button"
            >
              Log out
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AppPage 