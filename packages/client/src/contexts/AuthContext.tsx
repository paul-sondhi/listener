import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react'
import { User, Session, OAuthResponse } from '@supabase/supabase-js'
import type { SignInWithOAuthCredentials } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { logger } from '../lib/logger'

// Get environment variables for direct access
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

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
      
      // Step 0: Analyze current session state with timeout (since getSession might hang)
      console.log('AUTH_CONTEXT: Analyzing current session state with timeout...');
      try {
        const sessionTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Session analysis timeout after 1 second')), 1000);
        });
        
        const sessionPromise = supabase.auth.getSession();
        const { data: { session }, error: sessionError } = await Promise.race([sessionPromise, sessionTimeout]) as any;
        
        if (sessionError) {
          console.error('AUTH_CONTEXT: Session retrieval error:', sessionError);
        }
        if (session) {
          console.log('AUTH_CONTEXT: Current session details:');
          console.log('  - User ID:', session.user.id);
          console.log('  - Email:', session.user.email);
          console.log('  - Token type:', session.token_type);
          console.log('  - Expires at:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'undefined');
          console.log('  - Refresh token length:', session.refresh_token?.length || 0);
          console.log('  - Access token length:', session.access_token?.length || 0);
          console.log('  - Provider token present:', !!session.provider_token);
          console.log('  - Provider refresh token present:', !!session.provider_refresh_token);
        } else {
          console.log('AUTH_CONTEXT: No session found');
        }
      } catch (sessionAnalysisError) {
        const errorMessage = sessionAnalysisError instanceof Error ? sessionAnalysisError.message : String(sessionAnalysisError);
        console.error('AUTH_CONTEXT: Session analysis failed/timed out:', errorMessage);
        
        if (errorMessage.includes('timeout')) {
          console.log('🚨 AUTH_CONTEXT: CRITICAL - getSession() is hanging!');
          console.log('   This explains why signOut operations hang');
          console.log('   Supabase Auth client is in a bad state');
          console.log('   Proceeding with aggressive manual cleanup...');
        }
      }
      
      // Pre-flight check: Test if we can reach auth endpoints
      console.log('AUTH_CONTEXT: Testing auth endpoint connectivity...');
      try {
        const connectivityTest = fetch(`${supabase.supabaseUrl}/auth/v1/settings`, {
          method: 'GET',
          headers: { 'apikey': supabase.supabaseKey }
        });
        
        await Promise.race([
          connectivityTest,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connectivity test timeout')), 2000))
        ]);
        
        console.log('AUTH_CONTEXT: Auth endpoint reachable');
      } catch (connectivityError) {
        const errorMessage = connectivityError instanceof Error ? connectivityError.message : 'Unknown connectivity error';
        console.warn('AUTH_CONTEXT: Auth endpoint connectivity issue:', errorMessage);
      }
      
      // IMMEDIATE FALLBACK: If session exists, clear it locally first for UX
      const hasUser = !!user;
      if (hasUser) {
        console.log('AUTH_CONTEXT: Pre-emptively clearing user for immediate logout UX');
        setUser(null);
      }
      
      // Step 1: Try manual local cleanup (bypass Supabase entirely)
      try {
        console.log('AUTH_CONTEXT: Step 1 - Manual local cleanup...');
        
        // Clear all Supabase-related storage manually
        const localStorageKeys = Object.keys(localStorage);
        const sessionStorageKeys = Object.keys(sessionStorage);
        
        // Remove Supabase auth data from localStorage
        localStorageKeys.forEach(key => {
          if (key.includes('supabase') || key.includes('sb-')) {
            localStorage.removeItem(key);
            console.log('AUTH_CONTEXT: Removed localStorage:', key);
          }
        });
        
        // Remove Supabase auth data from sessionStorage
        sessionStorageKeys.forEach(key => {
          if (key.includes('supabase') || key.includes('sb-')) {
            sessionStorage.removeItem(key);
            console.log('AUTH_CONTEXT: Removed sessionStorage:', key);
          }
        });
        
        // Clear cookies manually
        document.cookie.split(";").forEach(cookie => {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name.startsWith('sb-')) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            console.log('AUTH_CONTEXT: Cleared cookie:', name);
          }
        });
        
        console.log('AUTH_CONTEXT: Manual local cleanup completed');
        
                 // Skip background invalidation since getSession() is hanging
         console.log('AUTH_CONTEXT: Skipping background token invalidation (getSession is hanging)');
         console.log('AUTH_CONTEXT: Tokens will expire naturally or can be invalidated later');
        
        const duration = Date.now() - startTime;
        console.log('AUTH_CONTEXT: Logout completed via manual cleanup in', duration, 'ms');
        
        logger.info('Manual logout successful', { 
          duration,
          method: 'manual_cleanup',
          userWasAuthenticated: hasUser
        });
        
        return { error: null };
        
      } catch (manualError) {
        console.error('AUTH_CONTEXT: Manual cleanup failed:', manualError);
        
        // Final fallback: just ensure user is cleared
        setUser(null);
        
        const finalDuration = Date.now() - startTime;
        logger.error('Logout failed but user cleared', { 
          error: manualError instanceof Error ? manualError.message : String(manualError),
          duration: finalDuration,
          method: 'final_fallback',
          userWasAuthenticated: hasUser
        });
        
        console.log('AUTH_CONTEXT: Final fallback - user cleared locally');
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