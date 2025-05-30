// Import necessary functions from Vitest and React Testing Library
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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
  const originalCreateElement = document.createElement;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  // To store the mock anchor instance for assertion
  let mockAnchorElement;

  beforeEach(() => {
    mockUseAuth.mockReset();
    mockGetSession.mockReset();
    global.fetch.mockReset();

    mockUseAuth.mockReturnValue({
      user: { id: 'test-user', email: 'test@example.com' },
    });

    mockGetSession.mockResolvedValue({
      data: { /* ... session data ... */ }, error: null,
    });
    // Ensure session data is complete as in previous versions
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          provider_token: 'spotify-access-token',
          provider_refresh_token: 'spotify-refresh-token',
          expires_at: Date.now() / 1000 + 3600,
          access_token: 'supabase-access-token',
        },
      },
      error: null,
    });

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Tokens stored' }) });
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Shows synced' }) });

    URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-url');
    URL.revokeObjectURL = vi.fn();
    
    // Refined mock for document.createElement
    document.createElement = vi.fn((tag) => {
      if (tag.toLowerCase() === 'a') {
        // Create a real anchor element using the original function but then spy on its methods
        const actualAnchor = originalCreateElement.call(document, tag);
        actualAnchor.click = vi.fn(); // Spy on click
        actualAnchor.remove = vi.fn(); // Spy on remove
        // Store this instance to check its spies later
        mockAnchorElement = actualAnchor; 
        return actualAnchor;
      }
      return originalCreateElement.call(document, tag);
    });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  // Test case: renders the main heading
  it('renders the main heading', async () => {
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );
    const heading = await screen.findByRole('heading', { name: /podcast transcript downloader/i });
    expect(heading).toBeInTheDocument();
  });

  // Test case: handles successful form submission and download
  it('handles successful form submission and download', async () => {
    // Arrange
    const mockTranscriptText = 'This is a mock transcript.';
    const spotifyTestUrl = 'https://open.spotify.com/episode/testepisode';

    // Specific mock for the /api/transcribe fetch call
    // This needs to be set *after* the beforeEach clears global.fetch and sets up its initial mocks
    // So, we clear fetch again and set this specific one.
    global.fetch.mockReset(); // Clear initial useEffect mocks if they would interfere, or use specific instance
    // Re-apply useEffect mocks because they are consumed on render before this test-specific mock
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Tokens stored' }) });
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Shows synced' }) });
    // Now the transcribe mock
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => mockTranscriptText, // Simulate successful transcript response
    });

    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Wait for initial useEffect calls to complete if they affect UI before interaction
    // (e.g. if they changed an error message that we don't want to see here)
    // The findByRole for heading in the previous test handles this for initial render.

    const urlInput = screen.getByPlaceholderText(/enter spotify show url/i);
    const submitButton = screen.getByRole('button', { name: /download episode/i });

    // Act: Simulate user typing and submitting the form
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: spotifyTestUrl } });
    });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Assertions
    // 1. Check if the API was called correctly for transcription
    expect(global.fetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL}/api/transcribe?url=${encodeURIComponent(spotifyTestUrl)}`
    );

    // 2. Check button loading state (optional, but good to verify)
    // This requires the button text to change. We need to wait for this to happen.
    // expect(screen.getByRole('button', { name: /downloading.../i })).toBeInTheDocument(); // This would be immediate
    // Then wait for it to revert
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download episode/i })).toBeInTheDocument();
    });
    
    // 3. Check if input was cleared
    expect(urlInput.value).toBe('');

    // 4. Check if download functions were called
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    // Assert on the spies of the actual anchor element instance that was created
    expect(mockAnchorElement.click).toHaveBeenCalledTimes(1);
    expect(mockAnchorElement.remove).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  // Test case: handles failed form submission (API error)
  it('handles failed form submission and displays an error', async () => {
    // Arrange
    const spotifyTestUrl = 'https://open.spotify.com/episode/failtestepisode';
    const apiErrorMessage = 'Transcription failed: Invalid URL';

    // Specific mock for the /api/transcribe fetch call to simulate an error
    global.fetch.mockReset(); // Reset any existing fetch mocks from beforeEach or other tests
    // Re-apply useEffect mocks as they are consumed on initial render
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Tokens stored' }) });
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Shows synced' }) });
    // Now the transcribe mock for failure
    global.fetch.mockResolvedValueOnce({
      ok: false, // Simulate an HTTP error
      status: 400, // Example error status
      json: async () => ({ error: apiErrorMessage }), // API returns error in JSON body
    });

    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    const urlInput = screen.getByPlaceholderText(/enter spotify show url/i);
    const submitButton = screen.getByRole('button', { name: /download episode/i });

    // Act: Simulate user typing and submitting the form
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: spotifyTestUrl } });
    });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Assertions
    // 1. Check if the API was called correctly for transcription
    expect(global.fetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL}/api/transcribe?url=${encodeURIComponent(spotifyTestUrl)}`
    );

    // 2. Check for the error message displayed to the user
    // AppPage's handleSubmit catches the error and sets it. The error div should appear.
    const errorDiv = await screen.findByText(apiErrorMessage);
    expect(errorDiv).toBeInTheDocument();
    // Check class if specific styling is applied to error messages
    // expect(errorDiv).toHaveClass('error'); // Assuming AppPage adds a class like 'error'

    // 3. Check button state (should not be stuck on "Downloading...")
    // It should revert to "Download Episode" or similar
    expect(screen.getByRole('button', { name: /download episode/i })).toBeInTheDocument();

    // 4. Check if input was NOT cleared (user might want to correct it)
    expect(urlInput.value).toBe(spotifyTestUrl);

    // 5. Ensure download functions were NOT called
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    if (mockAnchorElement && mockAnchorElement.click) { // Check if mockAnchorElement was set from a previous call
        expect(mockAnchorElement.click).not.toHaveBeenCalled();
    }
  });

  // Test case: useEffect - handles error when supabase.auth.getSession() fails
  it('displays an error if fetching session fails on mount', async () => {
    // Arrange
    const sessionErrorMessage = 'Failed to fetch session';
    mockGetSession.mockReset(); // Clear any default mocks from beforeEach
    mockGetSession.mockResolvedValue({ 
      data: { session: null }, 
      error: { message: sessionErrorMessage }
    });

    // Ensure fetch is not called if getSession fails early
    global.fetch.mockReset(); 

    // Act
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Assert
    // Check that the error message from getSession is displayed
    const errorDiv = await screen.findByText(sessionErrorMessage);
    expect(errorDiv).toBeInTheDocument();

    // Check that no fetch calls were made for token storage or show sync
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // More tests will be added here for:
  // - Form submission (transcribe API call)
  // - Loading states
  // - Error states (from token sync, from transcribe)
  // - Behavior when there's no session or missing tokens
}); 