import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { AuthProvider, useAuth } from './contexts/AuthContext'; // Adjust path as necessary
import App, { ProtectedRoute } from './App'; // Import default App and named ProtectedRoute

// Mock supabaseClient
vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

// Mock useAuth hook
vi.mock('./contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Helper function to render components with AuthProvider and MemoryRouter
const renderWithProviders = (ui, { providerProps, route, path } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider {...providerProps}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('ProtectedRoute', () => {
  it('should render children when user is authenticated', async () => {
    useAuth.mockReturnValue({ user: { id: 'test-user' }, loading: false });
    const TestChildComponent = () => <div>Protected Content</div>;

    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    );

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect to /login when user is not authenticated', async () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    const TestChildComponent = () => <div>Protected Content</div>;
    
    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    );

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should show loading indicator when auth state is loading', async () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    const TestChildComponent = () => <div>Protected Content</div>;

    renderWithProviders(
      <ProtectedRoute>
        <TestChildComponent />
      </ProtectedRoute>,
      { route: '/protected', path: '/protected' }
    );

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  describe('App Routing with ProtectedRoute', () => {
    it('should render AppPage when authenticated and navigating to /app', async () => {
      useAuth.mockReturnValue({ user: { id: 'test-user' }, loading: false });
      
      vi.mock('./components/AppPage', () => ({ default: () => <div>App Page Content</div> }));
      vi.mock('./components/Login', () => ({ default: () => <div>Login Page Mock</div> }));

      render(
        <MemoryRouter initialEntries={['/app']}>
          <App />
        </MemoryRouter>
      );
      expect(await screen.findByText('App Page Content')).toBeInTheDocument();
    });

    it('should redirect to /login when not authenticated and navigating to /app', async () => {
      useAuth.mockReturnValue({ user: null, loading: false });
      
      vi.mock('./components/AppPage', () => ({ default: () => <div>App Page Content</div> }));
      vi.mock('./components/Login', () => ({ default: () => <div>Login Page Mock Content</div> }));

      render(
        <MemoryRouter initialEntries={['/app']}>
          <App />
        </MemoryRouter>
      );
      expect(await screen.findByText('Login Page Mock Content')).toBeInTheDocument();
    });
  });
}); 