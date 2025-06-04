import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ApiResponse } from '@listener/shared'
import ReauthPrompt from './ReauthPrompt'

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
  const [spotifyUrl, setSpotifyUrl] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  
  // Use ref to track if we've already synced for this user session
  const hasSynced = useRef<boolean>(false)

  // Sync Spotify tokens on component mount
  useEffect(() => {
    /**
     * Synchronize Spotify tokens and user shows
     */
    const syncSpotifyTokens = async (): Promise<void> => {
      // Prevent multiple simultaneous sync attempts or re-syncing for same user
      if (isSyncing || hasSynced.current) {
        console.log('Sync already in progress or completed, skipping...')
        return
      }

      try {
        setIsSyncing(true)
        setError(null)
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          console.error('Error getting session:', sessionError)
          setError(sessionError.message)
          return
        }
        if (!session) {
          console.warn('No session found - user needs to log in')
          return
        }

        // Check if this is a Spotify OAuth session
        if (session.user?.app_metadata?.provider !== 'spotify') {
          console.warn('User not authenticated with Spotify')
          return
        }

        const accessToken: string | null | undefined = session.provider_token
        const refreshToken: string | null | undefined = session.provider_refresh_token
        const expiresAt: number | undefined = session.expires_at
        const supabaseAccessToken: string | undefined = session?.access_token

        // Only proceed if we have all required tokens
        if (!accessToken || !refreshToken || !expiresAt) {
          console.warn('Missing Spotify tokens:', { 
            hasAccessToken: !!accessToken, 
            hasRefreshToken: !!refreshToken, 
            hasExpiresAt: !!expiresAt 
          })
          setError('Spotify authentication incomplete. Please log in again.')
          return
        }

        console.log('Storing Spotify tokens...')
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
          throw new Error(errorData.error || 'Failed to store Spotify tokens')
        }

        console.log('Successfully stored tokens, clearing reauth flag...')
        await clearReauthFlag()

        console.log('Now syncing shows...')
        const syncResponse: globalThis.Response = await fetch(`${API_BASE_URL}/api/sync-spotify-shows`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAccessToken}`
          }
        })

        if (!syncResponse.ok) {
          const errorData: ErrorResponse = await syncResponse.json()
          throw new Error(errorData.error || 'Failed to sync Spotify shows')
        }

        const result: SyncShowsResponse = await syncResponse.json()
        console.log('Successfully synced Spotify shows:', result)
        
        // Mark as successfully synced for this session
        hasSynced.current = true
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
        console.error('Error syncing Spotify tokens or subsequent operations:', errorMessage)
        setError(`Authentication error: ${errorMessage}`)
      } finally {
        setIsSyncing(false)
      }
    }

    // Only try to sync if we have a user and we haven't synced yet
    if (user && !hasSynced.current) {
      syncSpotifyTokens()
    }
  }, [user]) // Remove isSyncing from dependencies to prevent infinite loop

  // Reset sync status when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      hasSynced.current = false
    }
  }, [user])

  /**
   * Handle form submission for transcript download
   * @param event - Form submission event
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    // Trim whitespace and remove leading/trailing quotes or apostrophes from the URL
    let cleanSpotifyUrl: string = spotifyUrl.trim()
    // Specifically remove the leading modifier letter turned comma if present
    if (cleanSpotifyUrl.startsWith('ʻ')) {
      cleanSpotifyUrl = cleanSpotifyUrl.substring(1)
    }
    // Remove leading/trailing standard single or double quotes
    if ((cleanSpotifyUrl.startsWith("'") && cleanSpotifyUrl.endsWith("'")) || 
        (cleanSpotifyUrl.startsWith('"') && cleanSpotifyUrl.endsWith('"'))) {
      cleanSpotifyUrl = cleanSpotifyUrl.substring(1, cleanSpotifyUrl.length - 1)
    }

    try {
      const response: globalThis.Response = await fetch(
        `${API_BASE_URL}/api/transcribe?url=${encodeURIComponent(cleanSpotifyUrl)}`
      )

      if (!response.ok) {
        const errorData: ErrorResponse = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      // Parse transcript text and trigger download
      const transcript: string = await response.text()
      const blob: Blob = new Blob([transcript], { type: 'text/plain' })
      const downloadUrl: string = URL.createObjectURL(blob)
      const linkElement: HTMLAnchorElement = document.createElement('a')
      linkElement.href = downloadUrl
      linkElement.download = 'transcript.txt'
      document.body.appendChild(linkElement)
      linkElement.click()
      linkElement.remove()
      URL.revokeObjectURL(downloadUrl)

      // Clear the input after successful download
      setSpotifyUrl('')
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Download error:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handle user logout
   */
  const handleLogout = async (): Promise<void> => {
    try {
      await signOut()
      // Reset sync status on logout
      hasSynced.current = false
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Error during logout:', errorMessage)
    }
  }

  /**
   * Handle input change for Spotify URL
   * @param event - Input change event
   */
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSpotifyUrl(event.target.value)
  }

  return (
    <div className="container">
      {/* Reauth prompt overlay - shows when user needs to re-authenticate */}
      <ReauthPrompt />
      
      <h1>Podcast Transcript Downloader</h1>
      {!user ? (
        <div className="login-prompt">
          <p>Please log in with Spotify to access the transcript downloader.</p>
          <p>Go back to the login page to authenticate with Spotify.</p>
        </div>
      ) : (
        <>
          <div className="user-info">
            <p>Welcome, {user.email}!</p>
            {isSyncing && <p className="syncing">Syncing Spotify data...</p>}
            <button 
              onClick={handleLogout} 
              className="logout-btn"
              type="button"
            >
              Log out
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <input
              type="url"
              value={spotifyUrl}
              onChange={handleInputChange}
              placeholder="Enter Spotify show URL"
              required
              disabled={isSyncing}
              aria-label="Spotify show URL"
            />
            <button 
              type="submit" 
              disabled={isLoading || isSyncing}
            >
              {isLoading ? 'Downloading...' : 'Download Episode'}
            </button>
          </form>
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