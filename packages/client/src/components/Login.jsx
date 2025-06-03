import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [error, setError] = useState('')
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

// Read the base URL from Vite env (override in Vercel, fallback locally)
// For local development, use the frontend URL (port 5173), not backend (port 3000)
const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:5173'
const REDIRECT_URI = `${BASE_URL}/app`

  // Redirect to app if user is already logged in
  useEffect(() => {
    if (user) {
      navigate('/app')
    }
  }, [user, navigate])

  const handleLogin = async () => {
    try {
      setError('')
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
    } catch (error) {
      console.error('Error during login:', error)
      setError('An unexpected error occurred during login. Please try again.')
    }
  }

  return (
    <div className="container">
      <button onClick={handleLogin}>Log in with Spotify</button>
      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
    </div>
  )
} 