import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, type MockInstance } from 'vitest'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import App, { ProtectedRoute } from './App'
import type { User } from '@supabase/supabase-js'

// Type definitions for test utilities
interface MockAuthReturnType {
  user: User | null
  loading: boolean
  signIn?: MockInstance
  signOut?: MockInstance
}

interface RenderWithProvidersOptions {
  providerProps?: Record<string, unknown>
  route?: string
  path?: string
}

// Mock supabaseClient
vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ 
        data: { 
          subscription: { 
            unsubscribe: vi.fn() 
          } 
        } 
      }),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

// Create mockUseAuth BEFORE using it in vi.mock to avoid hoisting issues
const mockUseAuth = vi.fn<[], MockAuthReturnType>()

// Mock useAuth hook with proper typing - use simpler approach
vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuth: () => mockUseAuth(),
}))

/**
 * Helper function to render components with AuthProvider and MemoryRouter
 * @param ui - React component to render
 * @param options - Configuration options for rendering
 * @returns Render result from testing library
 */
const renderWithProviders = (
  ui: React.ReactElement, 
  options: RenderWithProvidersOptions = {}
) => {
  const { providerProps, route = '/', path = '/' } = options
  
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider {...providerProps}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('should render children when user is authenticated', async () => {
    // Arrange
    const mockUser: User = { 
      id: 'test-user',
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
      signIn: vi.fn(),
      signOut: vi.fn()
    })
    
    const TestChildComponent = (): React.JSX.Element => <div>Protected Content</div>

    // Act
    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    )

    // Assert
    expect(await screen.findByText('Protected Content')).toBeInTheDocument()
  })

  it('should redirect to /login when user is not authenticated', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({ 
      user: null, 
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn()
    })
    
    const TestChildComponent = (): React.JSX.Element => <div>Protected Content</div>
    
    // Act
    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    )

    // Assert
    expect(await screen.findByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should show loading indicator when auth state is loading', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({ 
      user: null, 
      loading: true,
      signIn: vi.fn(),
      signOut: vi.fn()
    })
    
    const TestChildComponent = (): React.JSX.Element => <div>Protected Content</div>

    // Act
    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    )

    // Assert
    expect(await screen.findByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  describe('App Routing with ProtectedRoute', () => {
    it('should render AppPage when authenticated and navigating to /app', async () => {
      // Arrange
      const mockUser: User = { 
        id: 'test-user',
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
        signIn: vi.fn(),
        signOut: vi.fn()
      })
      
      vi.mock('./components/AppPage', () => ({ 
        default: (): React.JSX.Element => <div>App Page Content</div> 
      }))
      vi.mock('./components/Login', () => ({ 
        default: (): React.JSX.Element => <div>Login Page Mock</div> 
      }))

      // Act
      render(
        <MemoryRouter initialEntries={['/app']}>
          <App />
        </MemoryRouter>
      )
      
      // Assert
      expect(await screen.findByText('App Page Content')).toBeInTheDocument()
    })

    it('should redirect to /login when not authenticated and navigating to /app', async () => {
      // Arrange
      mockUseAuth.mockReturnValue({ 
        user: null, 
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn()
      })
      
      vi.mock('./components/AppPage', () => ({ 
        default: (): React.JSX.Element => <div>App Page Content</div> 
      }))
      vi.mock('./components/Login', () => ({ 
        default: (): React.JSX.Element => <div>Login Page Mock Content</div> 
      }))

      // Act
      render(
        <MemoryRouter initialEntries={['/app']}>
          <App />
        </MemoryRouter>
      )
      
      // Assert
      expect(await screen.findByText('Login Page Mock Content')).toBeInTheDocument()
    })
  })
}) 