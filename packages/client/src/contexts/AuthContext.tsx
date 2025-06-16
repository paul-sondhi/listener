import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react'
import { User, Session, OAuthResponse } from '@supabase/supabase-js'
import type { SignInWithOAuthCredentials } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

// Interface for the authentication context value
interface AuthContextType {
  user: User | null
  loading: boolean
  requiresReauth: boolean
  checkingReauth: boolean
  signIn: (credentials: SignInWithOAuthCredentials) => Promise<OAuthResponse>
  signOut: () => Promise<{ error: any }>
  checkReauthStatus: () => Promise<void>
  clearReauthFlag: () => Promise<void>
}

// Interface for AuthProvider props
interface AuthProviderProps {
  children: ReactNode
}

// Create the auth context with proper typing
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Auth provider component with TypeScript
export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [requiresReauth, setRequiresReauth] = useState<boolean>(false)
  const [checkingReauth, setCheckingReauth] = useState<boolean>(false)
  
  // Use ref to track reauth check status without causing useEffect loops
  const reauthCheckInProgress = useRef<boolean>(false)

  // Define checkReauthStatus function with useCallback to prevent infinite loops
  const checkReauthStatus = useCallback(async (): Promise<void> => {
    // Prevent multiple simultaneous reauth checks using ref
    if (reauthCheckInProgress.current) {
      logger.debug('Reauth check already in progress, skipping...')
      return
    }

    reauthCheckInProgress.current = true
    setCheckingReauth(true)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        logger.error('Error getting session:', sessionError)
        setRequiresReauth(false)
        return
      }
      
      // Query the users table for reauth status
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('spotify_reauth_required')
        .eq('id', session.user.id)
        .single()
      
      if (userError) {
        logger.error('Error checking reauth status:', userError)
        setRequiresReauth(false)
        return
      }
      
      setRequiresReauth(userData?.spotify_reauth_required === true)
    } catch (error) {
      logger.error('Error checking reauth status:', error)
      setRequiresReauth(false)
    } finally {
      reauthCheckInProgress.current = false
      setCheckingReauth(false)
    }
  }, []) // Remove checkingReauth dependency to prevent useEffect loop

  // Define clearReauthFlag function with useCallback for consistency
  const clearReauthFlag = useCallback(async (): Promise<void> => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        logger.error('Error getting session:', sessionError)
        return
      }
      
      // Update the users table to clear reauth flag
      const { error: updateError } = await supabase
        .from('users')
        .update({ spotify_reauth_required: false })
        .eq('id', session.user.id)
      
      if (updateError) {
        logger.error('Error clearing reauth flag:', updateError)
        return
      }
      
      setRequiresReauth(false)
      logger.info('Reauth flag cleared successfully')
    } catch (error) {
      logger.error('Error clearing reauth flag:', error)
    }
  }, [])

  useEffect(() => {
    // Check active sessions and sets the user
    const initializeAuth = async (): Promise<void> => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          logger.error('Error getting session:', error)
        }
        
        setUser(session?.user ?? null)
        
        // Check reauth status if user is authenticated
        if (session?.user) {
          await checkReauthStatus()
        }
      } catch (error) {
        logger.error('Unexpected error during auth initialization:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session: Session | null) => {
        logger.debug('Auth state changed:', event, session?.user?.email)
        setUser(session?.user ?? null)
        setLoading(false)
        
        // Check reauth status when user signs in
        if (session?.user && event === 'SIGNED_IN') {
          await checkReauthStatus()
        }
        
        // Clear reauth flag when user signs out
        if (event === 'SIGNED_OUT') {
          setRequiresReauth(false)
        }
      }
    )

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, []) // Remove checkReauthStatus dependency to prevent infinite loop

  // Authentication context value with proper typing
  const value: AuthContextType = {
    user,
    loading,
    requiresReauth,
    checkingReauth,
    signIn: (credentials: SignInWithOAuthCredentials) => supabase.auth.signInWithOAuth(credentials),
    signOut: () => supabase.auth.signOut(),
    checkReauthStatus: checkReauthStatus,
    clearReauthFlag: clearReauthFlag,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

// Custom hook to use the auth context with proper error handling
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
} 