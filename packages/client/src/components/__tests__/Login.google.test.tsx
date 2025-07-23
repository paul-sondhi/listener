import React from 'react'
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../Login'
import type { User, OAuthResponse, AuthError } from '@supabase/supabase-js'

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
 * Test suite for Google authentication functionality in the Login component
 */
describe('Login Component - Google Authentication', () => {
  beforeEach(() => {
    mockSignIn.mockClear()
    mockNavigate.mockClear()
    mockUseAuth.mockReset()
  })

  it('renders the Google login button', () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })

    // Act
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Assert
    const googleButton: HTMLElement = screen.getByRole('button', { name: /continue with google/i })
    expect(googleButton).toBeInTheDocument()
    expect(googleButton).toHaveClass('google-button')
  })

  it('calls signIn with Google provider when Google button is clicked', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    const mockSuccessResponse: OAuthResponse = {
      data: { provider: 'google', url: 'https://example.com' },
      error: null
    }
    mockSignIn.mockResolvedValue(mockSuccessResponse)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const googleButton: HTMLElement = screen.getByRole('button', { name: /continue with google/i })

    // Act
    await act(async () => {
      fireEvent.click(googleButton)
    })

    // Assert
    expect(mockSignIn).toHaveBeenCalledTimes(1)
    expect(mockSignIn).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/app'),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    })
  })

  it('displays Google-specific error message when Google signIn fails', async () => {
    // Arrange
    const mockErrorResponse: OAuthResponse = {
      data: { provider: 'google', url: null },
      error: { 
        message: 'Google authentication failed',
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
    
    const googleButton: HTMLElement = screen.getByRole('button', { name: /continue with google/i })

    // Act
    await act(async () => {
      fireEvent.click(googleButton)
    })

    // Assert
    const errorMessage: HTMLElement = await screen.findByText('Error during google login. Please try again.')
    expect(errorMessage).toBeInTheDocument()
  })

  it('shows loading state for Google button when clicked', async () => {
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
    
    const googleButton: HTMLElement = screen.getByRole('button', { name: /continue with google/i })
    const spotifyButton: HTMLElement = screen.getByRole('button', { name: /continue with spotify/i })

    // Act
    await act(async () => {
      fireEvent.click(googleButton)
    })

    // Assert: Google button shows loading, Spotify button is disabled
    expect(await screen.findByText('Connecting...')).toBeInTheDocument()
    expect(googleButton).toBeDisabled()
    expect(spotifyButton).toBeDisabled()

    // Cleanup
    act(() => {
      resolveSignIn!({
        data: { provider: 'google', url: 'https://example.com' },
        error: null
      })
    })
  })

  it('displays the authentication note about provider differences', () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })

    // Act
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Assert
    const noteText = screen.getByText(/Spotify users get automatic podcast syncing/i)
    expect(noteText).toBeInTheDocument()
    const googleNote = screen.getByText(/Google users can manually add podcasts to track/i)
    expect(googleNote).toBeInTheDocument()
  })

  it('disables both buttons when either provider is clicked', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: mockSignIn,
    })
    
    // Create a promise that doesn't resolve immediately
    let resolveSignIn: (value: OAuthResponse) => void
    const signInPromise = new Promise<OAuthResponse>((resolve) => {
      resolveSignIn = resolve
    })
    mockSignIn.mockReturnValue(signInPromise)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )
    
    const googleButton: HTMLElement = screen.getByRole('button', { name: /continue with google/i })
    const spotifyButton: HTMLElement = screen.getByRole('button', { name: /continue with spotify/i })

    // Act: Click Spotify button
    await act(async () => {
      fireEvent.click(spotifyButton)
    })

    // Assert: Both buttons should be disabled
    expect(googleButton).toBeDisabled()
    expect(spotifyButton).toBeDisabled()

    // Cleanup
    act(() => {
      resolveSignIn!({
        data: { provider: 'spotify', url: 'https://example.com' },
        error: null
      })
    })
  })
})