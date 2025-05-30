// Import necessary functions from Vitest and React Testing Library
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // AppPage might use hooks from react-router

// Import the component to be tested
import AppPage from '../AppPage';

// --- Mocks ---

// Hoist the mockGetSession function definition using vi.hoisted
// This ensures it's defined before any vi.mock factory that needs it.
const mockGetSession = vi.hoisted(() => vi.fn());

// Mock the useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock Supabase
// We need to mock getSession specifically for the useEffect in AppPage
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession, // mockGetSession is now reliably hoisted and defined
    },
  },
}));

// Mock fetch (globally for this test file)
// We'll use vi.fn() and then specify individual mockResolvedValueOnce in tests
global.fetch = vi.fn();

// Test suite for the AppPage component
describe('AppPage Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockUseAuth.mockReset();
    mockGetSession.mockReset();
    global.fetch.mockReset();

    // Default mock for useAuth - can be overridden in specific tests
    mockUseAuth.mockReturnValue({
      user: { id: 'test-user', email: 'test@example.com' }, // Simulate a logged-in user
    });

    // Default mock for Supabase getSession - simulating a valid session with tokens
    // This is important for the initial useEffect run in AppPage
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          provider_token: 'spotify-access-token',
          provider_refresh_token: 'spotify-refresh-token',
          expires_at: Date.now() / 1000 + 3600, // Expires in 1 hour
          access_token: 'supabase-access-token',
        },
      },
      error: null,
    });

    // Default mock for fetch calls in useEffect (store-spotify-tokens and sync-spotify-shows)
    // These will be called by the useEffect on initial render.
    // First call: store-spotify-tokens
    global.fetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ({ message: 'Tokens stored' }) 
    });
    // Second call: sync-spotify-shows
    global.fetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ({ message: 'Shows synced' }) 
    });
  });

  // Test case: renders the main heading
  it('renders the main heading', async () => {
    // Arrange (mocks are set up in beforeEach)
    
    // Act: Render the AppPage component
    // Wrap in MemoryRouter if AppPage or its children use routing features
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Assert: Check if the main heading is present
    // Use findByRole for async rendering if anything in AppPage is async before heading appears,
    // but getByRole should be fine if heading is static and early.
    const heading = await screen.findByRole('heading', { name: /podcast transcript downloader/i });
    expect(heading).toBeInTheDocument();
  });

  // More tests will be added here for:
  // - Form submission (transcribe API call)
  // - Loading states
  // - Error states (from token sync, from transcribe)
  // - Behavior when there's no session or missing tokens
}); 