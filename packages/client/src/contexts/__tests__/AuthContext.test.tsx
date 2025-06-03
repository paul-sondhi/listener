import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { render, act, waitFor, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import type { User, Session, AuthChangeEvent, SignInWithOAuthCredentials } from '@supabase/supabase-js'

// Type definitions for test utilities
interface MockSupabaseAuth {
  getSession: MockInstance<[], Promise<{ data: { session: Session | null }, error: Error | null }>>
  onAuthStateChange: MockInstance<[(event: AuthChangeEvent, session: Session | null) => void], { data: { subscription: { unsubscribe: MockInstance } } }>
  signInWithOAuth: MockInstance<[SignInWithOAuthCredentials], Promise<{ error: Error | null }>>
  signOut: MockInstance<[], Promise<{ error: Error | null }>>
}

interface MockSupabaseClient {
  auth: MockSupabaseAuth
}

// Use vi.hoisted to properly hoist mock declarations before imports
const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  }
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
 * Test component to use the auth context
 * Provides buttons to test signIn and signOut functionality
 */
const TestConsumerComponent = (): React.JSX.Element => {
  const { user, signIn, signOut } = useAuth()
  
  const handleSignIn = (): void => {
    signIn({ provider: 'google' }).catch(console.error)
  }
  
  const handleSignOut = (): void => {
    signOut().catch(console.error)
  }
  
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'No user'}</span>
      <button onClick={handleSignIn}>Sign In</button>
      <button onClick={handleSignOut}>Sign Out</button>
    </div>
  )
}

/**
 * Test suite for the AuthContext
 * Tests authentication state management, session handling, and auth callbacks
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
    act(() => {
      signOutButton.click()
    })

    // Assert
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
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
}) 