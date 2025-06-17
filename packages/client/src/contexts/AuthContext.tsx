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
      console.log('REAUTH_CHECK: Already in progress, skipping');
      return
    }

    console.log('REAUTH_CHECK: Starting reauth status check');
    reauthCheckInProgress.current = true
    setCheckingReauth(true)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        logger.error('Error getting session:', sessionError)
        console.log('REAUTH_CHECK: No session or error, setting reauth to false');
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
        console.log('REAUTH_CHECK: Database error, setting reauth to false');
        setRequiresReauth(false)
        return
      }
      
      console.log('REAUTH_CHECK: Database result:', userData?.spotify_reauth_required);
      setRequiresReauth(userData?.spotify_reauth_required === true)
    } catch (error) {
      logger.error('Error checking reauth status:', error)
      console.log('REAUTH_CHECK: Exception, setting reauth to false');
      setRequiresReauth(false)
    } finally {
      reauthCheckInProgress.current = false
      setCheckingReauth(false)
      console.log('REAUTH_CHECK: Completed');
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
        console.log('AUTH_STATE_CHANGE:', { event, userEmail: session?.user?.email || null });
        logger.debug('Auth state changed:', event, session?.user?.email)
        setUser(session?.user ?? null)
        setLoading(false)
        
        // Check reauth status when user signs in
        if (session?.user && event === 'SIGNED_IN') {
          console.log('AUTH_STATE_CHANGE: User signed in, checking reauth status');
          await checkReauthStatus()
        }
        
        // Clear reauth flag when user signs out
        if (event === 'SIGNED_OUT') {
          console.log('AUTH_STATE_CHANGE: User signed out, clearing reauth flag');
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
    signOut: async () => {
      console.log('AUTH_CONTEXT: signOut called');
      const startTime = Date.now();
      
      // Pre-flight check: Test if we can reach auth endpoints
      console.log('AUTH_CONTEXT: Testing auth endpoint connectivity...');
      try {
        const connectivityTest = fetch(`${supabase.supabaseUrl}/auth/v1/settings`, {
          method: 'GET',
          headers: { 'apikey': supabase.supabaseKey }
        });
        
        const connectivityResult = await Promise.race([
          connectivityTest,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connectivity test timeout')), 2000))
        ]);
        
        console.log('AUTH_CONTEXT: Auth endpoint reachable');
      } catch (connectivityError) {
        console.warn('AUTH_CONTEXT: Auth endpoint connectivity issue:', connectivityError.message);
      }
      
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('SignOut timeout after 5 seconds')), 5000);
        });
        
        console.log('AUTH_CONTEXT: Starting supabase.auth.signOut()...');
        // Try local-only signOut first (faster, more reliable)
        const signOutPromise = supabase.auth.signOut({ scope: 'local' });
        
        // FALLBACK: Full server signOut (if local-only doesn't work)
        // const signOutPromise = supabase.auth.signOut();
        
        const result = await Promise.race([signOutPromise, timeoutPromise]) as any;
        const duration = Date.now() - startTime;
        
        console.log('AUTH_CONTEXT: supabase.auth.signOut result:', result);
        console.log('AUTH_CONTEXT: signOut completed in', duration, 'ms');
        
        // Log success metrics with more context
        logger.info('Supabase signOut successful', { 
          duration,
          resultHasError: !!result.error,
          userWasAuthenticated: !!user
        });
        
        if (result.error) {
          console.error('AUTH_CONTEXT: signOut error:', result.error);
        }
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error('AUTH_CONTEXT: signOut exception:', error);
        console.log('AUTH_CONTEXT: signOut failed after', duration, 'ms');
        
        // Enhanced error categorization
        const errorType = error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'network_error';
        const wasTimeout = duration >= 5000;
        const wasConnectivityIssue = error instanceof Error && error.message.includes('Connectivity test timeout');
        
        logger.error('Supabase signOut failed', { 
          error: error instanceof Error ? error.message : String(error),
          duration,
          errorType,
          wasTimeout,
          wasConnectivityIssue,
          userWasAuthenticated: !!user,
          supabaseUrl: supabase.supabaseUrl
        });
        
        // Detailed diagnostic info
        if (wasTimeout) {
          console.log('🚨 AUTH_CONTEXT: DIAGNOSIS - SignOut hung for 5+ seconds');
          console.log('   This indicates Supabase Auth service issues, not general network problems');
          console.log('   Specific issue: supabase.auth.signOut() call to auth service');
        }
        
        // Even if signOut fails/times out, we should clear the local session
        console.log('AUTH_CONTEXT: Forcing local session clear due to error');
        setUser(null);
        // Return a success-like response to allow logout flow to continue
        return { error: null };
      }
    },
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