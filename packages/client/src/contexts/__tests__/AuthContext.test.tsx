import React from 'react'
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { render, act, waitFor, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import type { User, Session, AuthChangeEvent, SignInWithOAuthCredentials as _OAuthCredentials } from '@supabase/supabase-js'

// Type definitions for test utilities
interface _MockSupabaseAuth {
  getSession: MockInstance
  onAuthStateChange: MockInstance
  signInWithOAuth: MockInstance
  signOut: MockInstance
}

interface _MockSupabaseClient {
  auth: _MockSupabaseAuth
}

// Use vi.hoisted to properly hoist mock declarations before imports
const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn()
    }))
  }))
}))

// Mock supabase client - this will now work with hoisting
vi.mock('../../lib/supabaseClient', () => ({
  supabase: mockSupabase,
}))

// Mock supabase client - create BEFORE using in vi.mock to avoid hoisting issues
const mockUser: User = {
  id: 'user-123',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.com',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {}
}

const mockSession: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockUser
}

const mockSubscription = { unsubscribe: vi.fn() }

/**
 * Test component to use the auth context including reauth functionality
 * Provides buttons to test signIn, signOut, and reauth functionality
 */
const TestConsumerComponent = (): React.JSX.Element => {
  const { user, signIn, signOut, requiresReauth, checkReauthStatus, clearReauthFlag, checkingReauth } = useAuth()
  
  const handleSignIn = (): void => {
    signIn({ provider: 'google' }).catch(console.error)
  }
  
  const handleSignOut = (): void => {
    signOut().catch(console.error)
  }

  const handleCheckReauth = (): void => {
    checkReauthStatus().catch(console.error)
  }

  const handleClearReauth = (): void => {
    clearReauthFlag().catch(console.error)
  }
  
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'No user'}</span>
      <span data-testid="requires-reauth">{requiresReauth ? 'true' : 'false'}</span>
      <span data-testid="checking-reauth">{checkingReauth ? 'true' : 'false'}</span>
      <button onClick={handleSignIn}>Sign In</button>
      <button onClick={handleSignOut}>Sign Out</button>
      <button onClick={handleCheckReauth}>Check Reauth</button>
      <button onClick={handleClearReauth}>Clear Reauth</button>
    </div>
  )
}

/**
 * Test suite for the AuthContext
 * Tests authentication state management, session handling, auth callbacks, and reauth functionality
 */
describe('AuthContext', () => {
  // Store the callback passed to onAuthStateChange for testing
  let capturedAuthStateHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks()
    capturedAuthStateHandler = null
    
    // Set up default mock implementations
    mockSupabase.auth.getSession.mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    })
    
    mockSupabase.auth.onAuthStateChange.mockImplementation((handler) => {
      capturedAuthStateHandler = handler
      return { data: { subscription: mockSubscription } }
    })
    
    mockSupabase.auth.signInWithOAuth.mockResolvedValue({ error: null })
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })

    // Add missing properties for the signOut connectivity test
    mockSupabase.supabaseUrl = 'http://localhost:54321'
    mockSupabase.supabaseKey = 'test-anon-key'

    // Set up default Supabase table mocks with proper chaining
    const mockSingle = vi.fn().mockResolvedValue({
      data: { spotify_reauth_required: false },
      error: null
    })
    
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

    mockSupabase.from.mockReturnValue({
      select: mockSelect,
      update: mockUpdate
    })

    // Mock fetch for the connectivity test in signOut
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
  })

  it('should initialize with no user and not loading after getSession resolves', async () => {
    // Act
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
    })
    
    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')
  })

  it('should set user if a session exists on initialization', async () => {
    // Arrange
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    })

    // Act
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe(mockUser.email)
    })
  })

  it('should update user state when onAuthStateChange callback is triggered', async () => {
    // Act
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )
    
    // Wait for initial setup
    await waitFor(() => {
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })
    
    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')

    // Verify the auth state change handler was captured
    if (!capturedAuthStateHandler) {
      throw new Error('capturedAuthStateHandler was not set by the mock')
    }

    // Simulate auth state change (login)
    act(() => {
      capturedAuthStateHandler!('SIGNED_IN', mockSession)
    })
    
    expect(userElement.textContent).toBe(mockUser.email)

    // Simulate auth state change (logout)
    act(() => {
      capturedAuthStateHandler!('SIGNED_OUT', null)
    })
    
    expect(userElement.textContent).toBe('No user')
  })

  it('should call supabase.auth.signInWithOAuth when signIn is invoked', async () => {
    // Arrange
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(mockSupabase.auth.getSession).toHaveBeenCalled()
    })
    
    const signInButton: HTMLElement = screen.getByText('Sign In')

    // Act
    act(() => {
      signInButton.click()
    })

    // Assert
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google' })
  })

  it('should call supabase.auth.signOut when signOut is invoked', async () => {
    // Arrange
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    })
    
    // Make sure signOut mock returns a resolved promise
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })
    
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe(mockUser.email)
    })

    const signOutButton: HTMLElement = screen.getByText('Sign Out')

    // Act
    await act(async () => {
      signOutButton.click()
      // Wait for the signOut to complete
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    // Assert - Check that signOut was called with the scope parameter as used in the implementation
    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('should unsubscribe from onAuthStateChange on unmount', async () => {
    // Arrange
    const { unmount } = render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })

    // Act
    unmount()

    // Assert
    expect(mockSubscription.unsubscribe).toHaveBeenCalled()
  })

  it('should handle session error during initialization', async () => {
    // Arrange
    const sessionError = new Error('Session retrieval failed')
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: sessionError
    })

    // Mock console.error to verify error logging
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting session:', sessionError)
    })

    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')

    consoleErrorSpy.mockRestore()
  })

  it('useAuth should throw error if used outside of AuthProvider', () => {
    // Arrange - Create a component that tries to use useAuth outside of provider
    const BadConsumer = (): React.JSX.Element => {
      const auth = useAuth()
      return <div>Should not render: {auth.user?.email}</div>
    }

    // Act & Assert - This should throw an error when rendering
    expect(() => {
      render(<BadConsumer />)
    }).toThrow('useAuth must be used within an AuthProvider')
  })

  it('should handle unexpected errors during auth initialization', async () => {
    // Arrange
    const unexpectedError = new Error('Unexpected initialization error')
    mockSupabase.auth.getSession.mockRejectedValueOnce(unexpectedError)

    // Mock console.error to verify error logging
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unexpected error during auth initialization:', unexpectedError)
    })

    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')

    consoleErrorSpy.mockRestore()
  })

  describe('Reauth Functionality', () => {
    it('should check reauth status when user is authenticated on initialization', async () => {
      // Arrange - Mock session for initialization AND for checkReauthStatus call
      const mockSessionData = { 
        data: { session: mockSession }, 
        error: null 
      }
      
      mockSupabase.auth.getSession
        .mockResolvedValueOnce(mockSessionData) // For initialization
        .mockResolvedValue(mockSessionData) // For checkReauthStatus call

      const mockSingle = vi.fn().mockResolvedValue({
        data: { spotify_reauth_required: true },
        error: null
      })

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      
      // Include both select and update for TypeScript compatibility
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )

      // Assert - Wait for both user state and reauth check to complete
      await waitFor(() => {
        const userElement = screen.getByTestId('user')
        expect(userElement.textContent).toBe(mockUser.email)
      })

      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('users')
        expect(mockSelect).toHaveBeenCalledWith('spotify_reauth_required')
        expect(mockEq).toHaveBeenCalledWith('id', mockUser.id)
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('true')
      }, { timeout: 2000 })
    })

    it('should handle network errors during reauth status check gracefully', async () => {
      // Arrange - Mock session for initialization AND for checkReauthStatus call
      const mockSessionData = { 
        data: { session: mockSession }, 
        error: null 
      }
      
      mockSupabase.auth.getSession
        .mockResolvedValueOnce(mockSessionData) // For initialization
        .mockResolvedValue(mockSessionData) // For checkReauthStatus call

      const networkError = new Error('Network request failed')
      const mockSingle = vi.fn().mockRejectedValue(networkError)
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      
      // Include both select and update for TypeScript compatibility
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )

      // Assert - Wait for user state first, then error handling
      await waitFor(() => {
        const userElement = screen.getByTestId('user')
        expect(userElement.textContent).toBe(mockUser.email)
      })

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking reauth status:', networkError)
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('false') // Should default to false on error
      }, { timeout: 2000 })

      consoleErrorSpy.mockRestore()
    })

    it('should prevent multiple simultaneous reauth checks', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      const mockSingle = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          data: { spotify_reauth_required: false },
          error: null
        }), 100))
      )

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      
      // Include both select and update for TypeScript compatibility
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )

      // Wait for component to be ready
      const checkReauthButton = await screen.findByText('Check Reauth')
      
      // Trigger multiple reauth checks quickly
      act(() => {
        checkReauthButton.click()
        checkReauthButton.click()
        checkReauthButton.click()
      })

      // Assert
      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith('Reauth check already in progress, skipping...')
      })

      // Verify that the database was only queried appropriately (once on init, once on button click, others skipped)
      await waitFor(() => {
        expect(mockSingle).toHaveBeenCalledTimes(2) // Once on init, once on button click (others skipped)
      })

      consoleLogSpy.mockRestore()
    })

    it('should clear reauth flag successfully', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
      
      // Include both select and update for TypeScript compatibility
      const mockSingle = vi.fn().mockResolvedValue({
        data: { spotify_reauth_required: false },
        error: null
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )

      const clearReauthButton = await screen.findByText('Clear Reauth')
      act(() => {
        clearReauthButton.click()
      })

      // Assert
      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('users')
        expect(mockUpdate).toHaveBeenCalledWith({ spotify_reauth_required: false })
        expect(mockUpdateEq).toHaveBeenCalledWith('id', mockUser.id)
        expect(consoleLogSpy).toHaveBeenCalledWith('Reauth flag cleared successfully')
        
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('false')
      })

      consoleLogSpy.mockRestore()
    })

    it('should handle clearReauthFlag errors gracefully', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      const updateError = new Error('Database update failed')
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: updateError })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
      
      // Include both select and update for TypeScript compatibility
      const mockSingle = vi.fn().mockResolvedValue({
        data: { spotify_reauth_required: false },
        error: null
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )

      const clearReauthButton = await screen.findByText('Clear Reauth')
      act(() => {
        clearReauthButton.click()
      })

      // Assert
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error clearing reauth flag:', updateError)
      })

      consoleErrorSpy.mockRestore()
    })

    it('should check reauth status on SIGNED_IN event', async () => {
      // Arrange
      const mockSingle = vi.fn().mockResolvedValue({
        data: { spotify_reauth_required: true },
        error: null
      })

      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      
      // Include both select and update for TypeScript compatibility
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      // Act
      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
      })

      // Verify the auth state change handler was captured
      if (!capturedAuthStateHandler) {
        throw new Error('capturedAuthStateHandler was not set by the mock')
      }

      // Mock session for the SIGNED_IN event
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      // Simulate auth state change (login)
      await act(async () => {
        capturedAuthStateHandler!('SIGNED_IN', mockSession)
      })

      // Assert
      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('users')
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('true')
      }, { timeout: 2000 })
    })

    it('should clear reauth flag on SIGNED_OUT event', async () => {
      // Arrange
      // Include both select and update for TypeScript compatibility
      const mockSingle = vi.fn().mockResolvedValue({
        data: { spotify_reauth_required: false },
        error: null
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate
      })

      render(
        <AuthProvider>
          <TestConsumerComponent />
        </AuthProvider>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
      })

      // Verify the auth state change handler was captured
      if (!capturedAuthStateHandler) {
        throw new Error('capturedAuthStateHandler was not set by the mock')
      }

      // Mock session for the SIGNED_IN event
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

      // First set reauth to true, then sign out
      await act(async () => {
        capturedAuthStateHandler!('SIGNED_IN', mockSession)
      })

      // Simulate sign out
      await act(async () => {
        capturedAuthStateHandler!('SIGNED_OUT', null)
      })

      // Assert
      await waitFor(() => {
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('false')
      })
    })
  })

  it('should handle Supabase signOut timeout and clear local session', async () => {
    // Arrange - Set up initial authenticated state
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    });
    
    // Mock a hanging signOut call that never resolves
    const hangingPromise = new Promise(() => {
      // This promise never resolves, simulating a hanging network call
    });
    mockSupabase.auth.signOut.mockReturnValue(hangingPromise);
    
    render(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )
    
    // Wait for initialization with authenticated user
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe(mockUser.email)
    })

    const signOutButton: HTMLElement = screen.getByText('Sign Out')

    // Act - Click sign out and wait for timeout
    const startTime = Date.now();
    act(() => {
      signOutButton.click()
    })

    // Assert - Should timeout after 5 seconds and clear local session
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe('No user')
    }, { timeout: 6000 }) // Wait up to 6 seconds for timeout to complete

    const duration = Date.now() - startTime;
    
    // Verify timeout occurred around 5 seconds
    expect(duration).toBeGreaterThanOrEqual(4900); // Allow some timing variance
    expect(duration).toBeLessThan(6000);
    
    // Verify signOut was called but the local user was still cleared
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  }, 10000) // Increase test timeout to allow for the 5-second timeout
}) 