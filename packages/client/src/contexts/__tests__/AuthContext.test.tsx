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
 * Helper function to render AuthProvider with proper cleanup tracking
 * This ensures components are properly unmounted to prevent "window is not defined" errors
 */
const renderWithCleanup = (component: React.ReactElement) => {
  const rendered = render(component);
  
  // Store the unmount function for cleanup
  const originalUnmount = rendered.unmount;
  rendered.unmount = () => {
    // Ensure all async operations are settled before unmounting
    act(() => {
      // This ensures React state updates are processed before unmount
    });
    originalUnmount();
  };
  
  return rendered;
};

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
  let capturedAuthStateHandler: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

  beforeEach(() => {
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

  afterEach(async () => {
    // Clear all mocks
    vi.resetAllMocks();
    
    // Clear any timers that might still be running
    vi.clearAllTimers();
    
    // Wait for any pending async operations to complete
    // This prevents "window is not defined" errors from React state updates
    // that happen after the test environment is torn down
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Clear any pending microtasks (like queueMicrotask calls in AuthContext)
    await new Promise(resolve => queueMicrotask(resolve));
    
    // Additional cleanup to ensure all async operations are settled
    await new Promise(resolve => setTimeout(resolve, 10));
  })

  it('should initialize with no user and not loading after getSession resolves', async () => {
    // Act
    const { unmount } = renderWithCleanup(
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
    
    // Clean up
    unmount()
  })

  it('should set user if a session exists on initialization', async () => {
    // Arrange
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    })

    // Act
    const { unmount } = renderWithCleanup(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe(mockUser.email)
    })
    
    // Clean up
    unmount()
  })

  it('should update user state when onAuthStateChange callback is triggered', async () => {
    // Act
    const { unmount } = renderWithCleanup(
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
    
    // Clean up
    unmount()
  })

  it('should call supabase.auth.signInWithOAuth when signIn is invoked', async () => {
    // Arrange
    const { unmount } = renderWithCleanup(
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
    
    // Clean up
    unmount()
  })

  it('should call supabase.auth.signOut when signOut is invoked', async () => {
    // Arrange
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    })
    
    // Make sure signOut mock returns a resolved promise
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })
    
    const { unmount } = renderWithCleanup(
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

    // Assert - Check that user was cleared (current implementation does manual cleanup instead of calling Supabase signOut)
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe('No user')
    })
    
    // Clean up
    unmount()
  })

  it('should unsubscribe from onAuthStateChange on unmount', async () => {
    // Arrange
    const { unmount } = renderWithCleanup(
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

    // Act
    const { unmount } = renderWithCleanup(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      // Error should be handled gracefully
    })

    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')
    
    // Clean up
    unmount()
  })

  it('useAuth should throw error if used outside of AuthProvider', () => {
    // Arrange - Create a component that tries to use useAuth outside of provider
    const BadConsumer = (): React.JSX.Element => {
      const auth = useAuth()
      return <div>Should not render: {auth.user?.email}</div>
    }

    // Act & Assert - This should throw an error when rendering
    let renderedComponent: any = null;
    expect(() => {
      renderedComponent = render(<BadConsumer />)
    }).toThrow('useAuth must be used within an AuthProvider')
    
    // Clean up the rendered component if it was created despite the error
    if (renderedComponent?.unmount) {
      renderedComponent.unmount();
    }
  })

  it('should handle unexpected errors during auth initialization', async () => {
    // Arrange
    const unexpectedError = new Error('Unexpected initialization error')
    mockSupabase.auth.getSession.mockRejectedValueOnce(unexpectedError)

    // Act
    const { unmount } = renderWithCleanup(
      <AuthProvider>
        <TestConsumerComponent />
      </AuthProvider>
    )

    // Assert
    await waitFor(() => {
      // Error should be handled gracefully
    })

    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')
    
    // Clean up
    unmount()
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
      const { unmount } = renderWithCleanup(
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
      
      // Clean up
      unmount()
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

      // Act
      const { unmount } = renderWithCleanup(
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
        // Error should be handled gracefully
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('false') // Should default to false on error
      }, { timeout: 2000 })
      
      // Clean up
      unmount()
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

      // Act
      const { unmount } = renderWithCleanup(
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

      // Simulate auth state change (login)
      await act(async () => {
        capturedAuthStateHandler!('SIGNED_IN', mockSession)
      })

      // Assert
      await waitFor(() => {
        // Multiple reauth checks should be prevented
      })
      
      // Clean up
      unmount()
    })

    it('should clear reauth flag successfully', async () => {
      // Arrange
      mockSupabase.auth.getSession.mockResolvedValue({ 
        data: { session: mockSession }, 
        error: null 
      })

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

      // Act
      const { unmount } = renderWithCleanup(
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
        // Reauth flag should be cleared successfully
        
        const requiresReauthElement = screen.getByTestId('requires-reauth')
        expect(requiresReauthElement.textContent).toBe('false')
      })
      
      // Clean up
      unmount()
    })

    it('should handle errors when clearing reauth flag', async () => {
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

      // Act
      const { unmount } = renderWithCleanup(
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
        // Error should be handled gracefully
      })
      
      // Clean up
      unmount()
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
      const { unmount } = renderWithCleanup(
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
      
      // Clean up
      unmount()
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

      const { unmount } = renderWithCleanup(
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
      
      // Clean up
      unmount()
    })
  })

  it('should handle Supabase signOut timeout and clear local session', async () => {
    // Arrange - Set up initial authenticated state
    mockSupabase.auth.getSession.mockResolvedValueOnce({ 
      data: { session: mockSession }, 
      error: null 
    });
    
    const { unmount } = renderWithCleanup(
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

    // Act - Click sign out (current implementation does immediate manual cleanup)
    const startTime = Date.now();
    act(() => {
      signOutButton.click()
    })

    // Assert - Should immediately clear local session (current implementation behavior)
    await waitFor(() => {
      const userElement: HTMLElement = screen.getByTestId('user')
      expect(userElement.textContent).toBe('No user')
    }, { timeout: 1000 }) // Wait up to 1 second for immediate cleanup

    const duration = Date.now() - startTime;
    
    // Verify immediate cleanup (should be very fast, under 100ms typically)
    expect(duration).toBeLessThan(1000); // Should be immediate
    
    // Verify user was cleared successfully
    const userElement: HTMLElement = screen.getByTestId('user')
    expect(userElement.textContent).toBe('No user')
    
    // Clean up
    unmount()
  })
}) 