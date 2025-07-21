import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../lib/logger'

/**
 * ReauthPrompt component that displays when user needs to re-authenticate with Spotify
 * Shows when spotify_reauth_required flag is true in the database
 */
export default function ReauthPrompt(): React.JSX.Element | null {
  const [isReauthenticating, setIsReauthenticating] = useState<boolean>(false)
  const { requiresReauth, signIn, clearReauthFlag } = useAuth()

  // Don't render if reauth is not required
  if (!requiresReauth) {
    return null
  }

  /**
   * Handle Spotify re-authentication
   */
  const handleReauth = async (): Promise<void> => {
    try {
      setIsReauthenticating(true)
      
      // Read the base URL from Vite env (override in Vercel, fallback locally)
      const BASE_URL: string = import.meta.env.VITE_BASE_URL || 'http://localhost:5173'
      const REDIRECT_URI: string = `${BASE_URL}/app`

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
        logger.error('Reauth error:', error)
        // Don't clear the flag if reauth failed
      } else {
        // Clear the reauth flag on successful authentication
        await clearReauthFlag()
      }
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Error during re-authentication:', errorMessage)
    } finally {
      setIsReauthenticating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
        <div className="text-center">
          {/* Spotify Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
          </div>

          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Spotify Re-authentication Required
          </h3>
          
          <p className="text-sm text-gray-500 mb-6">
            Your Spotify tokens have expired or become invalid. Please re-authenticate to continue using the app.
          </p>

          <div className="flex flex-col space-y-3">
            <button
              onClick={() => void handleReauth()}
              disabled={isReauthenticating}
              className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReauthenticating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </>
              ) : (
                'Re-authenticate with Spotify'
              )}
            </button>
            
            <p className="text-xs text-gray-400">
              This will redirect you to Spotify to re-authorize the app
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 