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
  
  // Add state to defer reauth check outside of onAuthStateChange callback
  const [needsReauthCheck, setNeedsReauthCheck] = useState<boolean>(false)
  
  // Use ref to track reauth check status without causing useEffect loops
  const reauthCheckInProgress = useRef<boolean>(false)
  
  // Add ref to track current user to prevent duplicate reauth checks
  const lastCheckedUserId = useRef<string | null>(null)

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

  // Separate useEffect to handle deferred reauth checks
  // This prevents the deadlock by moving Supabase calls outside the onAuthStateChange callback
  useEffect(() => {
    if (!needsReauthCheck || !user) return;
    
    // Skip if we've already checked for this user
    if (lastCheckedUserId.current === user.id) {
      console.log('DEFERRED_REAUTH: Already checked for this user, skipping');
      setNeedsReauthCheck(false);
      return;
    }
    
    console.log('DEFERRED_REAUTH: Processing deferred reauth check');
    
    const runDeferredReauthCheck = async () => {
      await checkReauthStatus();
      lastCheckedUserId.current = user.id; // Mark this user as checked
      setNeedsReauthCheck(false);
    };
    
    // Use queueMicrotask to defer the execution to the next tick
    // This ensures we're completely outside the auth callback's execution context
    queueMicrotask(runDeferredReauthCheck);
  }, [needsReauthCheck, user, checkReauthStatus]);

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
    // CRITICAL FIX: Remove all Supabase calls from this callback to prevent deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session: Session | null) => {
        console.log('AUTH_STATE_CHANGE:', { event, userEmail: session?.user?.email || null });
        logger.debug('Auth state changed:', event, session?.user?.email)
        setUser(session?.user ?? null)
        setLoading(false)
        
        // FIXED: Only trigger reauth check for actual sign-in events, not INITIAL_SESSION
        // This prevents duplicate reauth checks when the session is restored
        if (session?.user && event === 'SIGNED_IN') {
          console.log('AUTH_STATE_CHANGE: User signed in, scheduling reauth status check');
          setNeedsReauthCheck(true);
        }
        
        // FIXED: Only clear local state, no Supabase calls in the callback
        if (event === 'SIGNED_OUT') {
          console.log('AUTH_STATE_CHANGE: User signed out, clearing reauth flag locally');
          setRequiresReauth(false);
          // Note: Any additional cleanup (like clearing DB flags) should be handled
          // in the signOut method itself, not in this callback
        }
      }
    )

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [checkReauthStatus]) // Keep checkReauthStatus dependency for initial auth

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
      
      try {
        // With the deadlock fix in place, getSession() should now work reliably
        console.log('AUTH_CONTEXT: Calling supabase.auth.signOut()...');
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          console.error('AUTH_CONTEXT: SignOut error:', error);
          logger.error('SignOut failed:', error);
          return { error };
        }
        
        // Clear local state
        setUser(null);
        setRequiresReauth(false);
        
        // Reset the reauth check tracking
        lastCheckedUserId.current = null;
        
        const duration = Date.now() - startTime;
        console.log(`AUTH_CONTEXT: SignOut completed successfully in ${duration}ms`);
        logger.info('SignOut successful', { duration });
        
        return { error: null };
        
      } catch (error) {
        console.error('AUTH_CONTEXT: SignOut exception:', error);
        logger.error('SignOut exception:', error);
        
        // Fallback: clear local state even if signOut fails
        setUser(null);
        setRequiresReauth(false);
        
        const duration = Date.now() - startTime;
        console.log(`AUTH_CONTEXT: SignOut fallback completed in ${duration}ms`);
        
        return { error: error instanceof Error ? error : new Error(String(error)) };
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