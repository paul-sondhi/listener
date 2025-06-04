import React from 'react'
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../Login'
import type { User, OAuthResponse, SignInWithOAuthCredentials as _OAuthCredentials, AuthError } from '@supabase/supabase-js'

// Type definitions for test utilities
interface MockAuthHookReturnType {
  user: User | null
  loading?: boolean
  signIn: MockInstance
  signOut?: MockInstance
}

interface MockNavigateFunction {
  (to: string, options?: { replace?: boolean }): void
}

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal() as typeof import('react-router-dom')
  return {
    ...original,
    useNavigate: (): MockNavigateFunction => mockNavigate as any,
  }
})

// Mock the useAuth hook
const mockSignIn = vi.fn()
const mockUseAuth = vi.fn()

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: (): MockAuthHookReturnType => mockUseAuth()
}))

/**
 * Test suite for the Login component
 * Tests authentication flow, error handling, and navigation behavior
 */
describe('Login Component', () => {
  /**
   * Reset mocks before each test to ensure test isolation
   */
  beforeEach(() => {
    mockSignIn.mockClear()
    mockNavigate.mockClear()
    mockUseAuth.mockReset()
  })

  it('renders the login button', () => {
    // Arrange: Set up the mock return value for useAuth
    mockUseAuth.mockReturnValue({
      user: null, // Simulate no user logged in
      loading: false,
      signIn: mockSignIn, // Provide the mock signIn function
    })

    // Act: Render the Login component within a MemoryRouter
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Assert: Check if the login button is present in the document
    const loginButton: HTMLElement = screen.getByRole('button', { name: /log in with spotify/i })
    expect(loginButton).toBeInTheDocument()
  })

  it('calls signIn when the login button is clicked', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    // Simulate a successful sign-in (no error object returned)
    const mockSuccessResponse: OAuthResponse = {
      data: { provider: 'spotify', url: 'https://example.com' },
      error: null
    }
    mockSignIn.mockResolvedValue(mockSuccessResponse)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const loginButton: HTMLElement = screen.getByRole('button', { name: /log in with spotify/i })

    // Act: Simulate a user clicking the login button
    await act(async () => {
      fireEvent.click(loginButton)
    })

    // Assert: Check if the signIn function was called with correct parameters
    expect(mockSignIn).toHaveBeenCalledTimes(1)
    expect(mockSignIn).toHaveBeenCalledWith({
      provider: 'spotify',
      options: {
        scopes: 'user-read-email user-library-read',
        redirectTo: expect.stringContaining('/app'), 
        queryParams: {
          show_dialog: 'true'
        }
      }
    })
  })

  it('displays an error message when signIn returns an error', async () => {
    // Arrange
    const errorMessageContent: string = 'Test login error from signIn'
    const mockErrorResponse: OAuthResponse = {
      data: { provider: 'spotify', url: null },
      error: { 
        message: errorMessageContent,
        code: 'auth_error',
        status: 400,
        __isAuthError: true,
        name: 'AuthError'
      } as unknown as AuthError,
    }
    mockSignIn.mockResolvedValue(mockErrorResponse)
    
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const loginButton: HTMLElement = screen.getByRole('button', { name: /log in with spotify/i })

    // Act: Click the button, which should now lead to an error
    await act(async () => {
      fireEvent.click(loginButton)
    })

    // Assert: Check for the error message
    const errorMessage: HTMLElement = await screen.findByText('Error during login. Please try again.')
    expect(errorMessage).toBeInTheDocument()
  })

  it('displays error message when signIn throws an exception', async () => {
    // Arrange
    mockSignIn.mockRejectedValue(new Error('Network error'))
    
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const loginButton: HTMLElement = screen.getByRole('button', { name: /log in with spotify/i })

    // Act: Click the button, which should throw an error
    await act(async () => {
      fireEvent.click(loginButton)
    })

    // Assert: Check for the error message
    const errorMessage: HTMLElement = await screen.findByText('An unexpected error occurred during login. Please try again.')
    expect(errorMessage).toBeInTheDocument()
  })

  it('navigates to /app if user is already logged in on initial render', () => {
    // Arrange: Simulate a logged-in user
    const mockUser: User = {
      id: 'test-user-id',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.com',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {}
    }
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signIn: mockSignIn,
    })
    
    // Act
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    )

    // Assert: The navigation happens in a useEffect hook
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true })
  })

  it('shows loading state when login button is clicked', async () => {
    // Arrange
    let resolveSignIn: (value: OAuthResponse) => void
    const signInPromise = new Promise<OAuthResponse>((resolve) => {
      resolveSignIn = resolve
    })
    mockSignIn.mockReturnValue(signInPromise)
    
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const loginButton: HTMLElement = screen.getByRole('button', { name: /log in with spotify/i })

    // Act: Click the button but don't resolve the promise yet - wrap in act()
    await act(async () => {
      fireEvent.click(loginButton)
    })

    // Assert: Button should show loading state
    expect(await screen.findByText('Connecting...')).toBeInTheDocument()
    expect(loginButton).toBeDisabled()

    // Cleanup: Resolve the promise to complete the test
    act(() => {
      resolveSignIn!({
        data: { provider: 'spotify', url: 'https://example.com' },
        error: null
      })
    })
  })
}) 