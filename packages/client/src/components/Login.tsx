import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'

/**
 * Login component that handles OAuth authentication for both Spotify and Google
 * Redirects authenticated users to the app page
 */
export default function Login(): React.JSX.Element {
  const [error, setError] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [loadingProvider, setLoadingProvider] = useState<'spotify' | 'google' | null>(null)
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  // Read the base URL from Vite env (override in Vercel, fallback locally)
  // For local development, use the frontend URL (port 5173), not backend (port 3000)
  const BASE_URL: string = import.meta.env.VITE_BASE_URL || 'http://localhost:5173'
  const REDIRECT_URI: string = `${BASE_URL}/app`

  // Redirect to app if user is already logged in
  useEffect(() => {
    if (user) {
      void navigate('/app', { replace: true })
    }
  }, [user, navigate])

  /**
   * Handle OAuth login with proper error handling
   * @param provider - The OAuth provider to use ('spotify' or 'google')
   */
  const handleLogin = async (provider: 'spotify' | 'google'): Promise<void> => {
    try {
      setError('')
      setIsLoading(true)
      setLoadingProvider(provider)
      
      // Provider-specific options
      const providerOptions: {
        scopes?: string;
        redirectTo: string;
        queryParams: { [key: string]: string };
      } = provider === 'spotify' 
        ? {
            scopes: 'user-read-email user-library-read',
            redirectTo: REDIRECT_URI,
            queryParams: {
              show_dialog: 'true' // Force the consent screen for Spotify
            }
          }
        : {
            redirectTo: REDIRECT_URI,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent' // Force consent screen for Google to ensure we get refresh token
            }
          }

      const { error } = await signIn({
        provider,
        options: providerOptions
      })

      if (error) {
        logger.error(`${provider} login error:`, error)
        setError(`Error during ${provider} login. Please try again.`)
      }
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error(`Error during ${provider} login:`, errorMessage)
      setError(`An unexpected error occurred during ${provider} login. Please try again.`)
    } finally {
      setIsLoading(false)
      setLoadingProvider(null)
    }
  }

  return (
    <div className="login-card">
      <h1>Listener 1.0</h1>
      <p>Your podcast feed in a newsletter</p>
      
      <div className="login-buttons">
        <button 
          onClick={() => void handleLogin('spotify')}
          disabled={isLoading}
          className={`login-button spotify-button ${loadingProvider === 'spotify' ? 'loading' : ''}`}
          type="button"
        >
          {loadingProvider === 'spotify' ? 'Connecting...' : 'Continue with Spotify'}
        </button>
        
        {/* Google auth UI hidden for now
        <div className="login-divider">
          <span>or</span>
        </div>
        
        <button 
          onClick={() => void handleLogin('google')}
          disabled={isLoading}
          className={`login-button google-button ${loadingProvider === 'google' ? 'loading' : ''}`}
          type="button"
        >
          {loadingProvider === 'google' ? 'Connecting...' : 'Continue with Google'}
        </button>
        */}
      </div>
      
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      
      {/* Info box hidden for now
      <div className="login-note">
        <p>
          <strong>Note:</strong> Spotify users get automatic podcast syncing. 
          Google users can manually add podcasts to track.
        </p>
      </div>
      */}
    </div>
  )
} 