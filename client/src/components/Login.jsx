import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [error, setError] = useState('')
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

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
          redirectTo: `${window.location.origin}/app`,
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