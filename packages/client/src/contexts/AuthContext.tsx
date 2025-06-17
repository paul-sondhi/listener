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
      
      // Pre-flight check: Test if we can reach auth endpoints
      console.log('AUTH_CONTEXT: Testing auth endpoint connectivity...');
      try {
        const connectivityTest = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          method: 'GET',
          headers: { 'apikey': SUPABASE_ANON_KEY }
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
      
      // Step 1: Try standard signOut
      try {
        console.log('AUTH_CONTEXT: Step 1 - Attempting standard signOut...');
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('SignOut timeout after 5 seconds')), 5000);
        });
        
        const signOutPromise = supabase.auth.signOut({ scope: 'local' });
        const result = await Promise.race([signOutPromise, timeoutPromise]) as any;
        const duration = Date.now() - startTime;
        
        console.log('AUTH_CONTEXT: Standard signOut succeeded in', duration, 'ms');
        console.log('AUTH_CONTEXT: signOut result:', result);
        
        // Log success metrics with more context
        logger.info('Supabase signOut successful', { 
          duration,
          resultHasError: !!result.error,
          userWasAuthenticated: !!user,
          method: 'standard'
        });
        
        if (result.error) {
          console.error('AUTH_CONTEXT: signOut error:', result.error);
        }
        return result;
        
      } catch (standardError) {
        const duration = Date.now() - startTime;
        console.error('AUTH_CONTEXT: Standard signOut failed:', standardError);
        console.log('AUTH_CONTEXT: Step 1 failed after', duration, 'ms');
        
        // If this was a timeout error, clear the user immediately for better UX
        const wasTimeout = duration >= 4900; // Allow some variance
        if (wasTimeout) {
          console.log('AUTH_CONTEXT: Timeout detected, clearing local session immediately');
          setUser(null);
        }
        
        // Step 2: Try global scope signOut (more aggressive)
        try {
          console.log('AUTH_CONTEXT: Step 2 - Attempting global scope signOut...');
          const globalTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Global signOut timeout after 3 seconds')), 3000);
          });
          
          const globalSignOutPromise = supabase.auth.signOut({ scope: 'global' });
          const globalResult = await Promise.race([globalSignOutPromise, globalTimeoutPromise]) as any;
          
          console.log('AUTH_CONTEXT: Global signOut succeeded');
          logger.info('Supabase signOut successful', { 
            duration: Date.now() - startTime,
            method: 'global_fallback',
            userWasAuthenticated: !!user
          });
          
          return globalResult;
          
        } catch (globalError) {
          console.error('AUTH_CONTEXT: Global signOut also failed:', globalError);
          
          // Step 3: Manual token invalidation as last resort
          try {
            console.log('AUTH_CONTEXT: Step 3 - Manual session invalidation...');
            
            // Get current session to extract tokens
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session?.access_token) {
              // Try to manually invalidate via direct API call
              const invalidateResponse = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'apikey': SUPABASE_ANON_KEY,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ scope: 'global' })
              });
              
              console.log('AUTH_CONTEXT: Manual invalidation response:', invalidateResponse.status);
              
              if (invalidateResponse.ok || invalidateResponse.status === 401) {
                console.log('AUTH_CONTEXT: Manual invalidation succeeded');
              }
            }
            
          } catch (manualError) {
            console.error('AUTH_CONTEXT: Manual invalidation failed:', manualError);
          }
          
          // Final step: Clear all local data and log comprehensive error
          const finalDuration = Date.now() - startTime;
          const wasTimeout = finalDuration >= 5000;
          
          logger.error('Supabase signOut completely failed', { 
            standardError: standardError instanceof Error ? standardError.message : String(standardError),
            globalError: globalError instanceof Error ? globalError.message : String(globalError),
            duration: finalDuration,
            errorType: wasTimeout ? 'timeout' : 'network_error',
            wasTimeout,
            userWasAuthenticated: !!user,
            supabaseUrl: SUPABASE_URL
          });
          
          // Detailed diagnostic info
          console.log('🚨 AUTH_CONTEXT: COMPREHENSIVE SIGNOUT FAILURE');
          console.log('   All signOut methods failed - this indicates serious Supabase Auth issues');
          console.log('   Standard signOut: FAILED');
          console.log('   Global scope signOut: FAILED'); 
          console.log('   Manual token invalidation: ATTEMPTED');
          console.log('   Forcing local session clear as final fallback');
          
          // Force local session clear
          setUser(null);
          
          // Also clear any browser storage manually
          try {
            localStorage.removeItem('supabase.auth.token');
            sessionStorage.removeItem('supabase.auth.token');
            
            // Clear cookies by setting them to expire
            document.cookie.split(";").forEach(cookie => {
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
              if (name.startsWith('sb-')) {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
              }
            });
            
            console.log('AUTH_CONTEXT: Cleared local storage and cookies');
          } catch (clearError) {
            console.error('AUTH_CONTEXT: Error clearing local data:', clearError);
          }
          
          return { error: null };
        }
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