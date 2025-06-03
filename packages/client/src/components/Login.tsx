import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Login component that handles Spotify OAuth authentication
 * Redirects authenticated users to the app page
 */
export default function Login(): React.JSX.Element {
  const [error, setError] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  // Read the base URL from Vite env (override in Vercel, fallback locally)
  // For local development, use the frontend URL (port 5173), not backend (port 3000)
  const BASE_URL: string = import.meta.env.VITE_BASE_URL || 'http://localhost:5173'
  const REDIRECT_URI: string = `${BASE_URL}/app`

  // Redirect to app if user is already logged in
  useEffect(() => {
    if (user) {
      navigate('/app', { replace: true })
    }
  }, [user, navigate])

  /**
   * Handle Spotify OAuth login with proper error handling
   */
  const handleLogin = async (): Promise<void> => {
    try {
      setError('')
      setIsLoading(true)
      
      const { error } = await signIn({
        provider: 'spotify',
        options: {
          scopes: 'user-read-email user-library-read',
          redirectTo: REDIRECT_URI,
          queryParams: {
            show_dialog: 'true' // Force the consent screen
          }
        }
      })

      if (error) {
        console.error('Login error:', error)
        setError('Error during login. Please try again.')
      }
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Error during login:', errorMessage)
      setError('An unexpected error occurred during login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="login-card">
        <h1>Welcome to Listener</h1>
        <p>Connect your Spotify account to get started</p>
        
        <button 
          onClick={handleLogin}
          disabled={isLoading}
          className={`login-button ${isLoading ? 'loading' : ''}`}
          type="button"
        >
          {isLoading ? 'Connecting...' : 'Log in with Spotify'}
        </button>
        
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  )
} 