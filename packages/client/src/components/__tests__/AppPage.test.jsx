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

  // Test case: useEffect - handles null session from supabase.auth.getSession() (no user, no error object)
  it('does not make API calls or show errors if getSession returns a null session (no user, no error object)', async () => {
    // Arrange
    // Mock getSession to return a null session and no error
    mockGetSession.mockReset(); 
    mockGetSession.mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    });

    // Reset fetch mock to ensure it's not called
    global.fetch.mockReset();
    
    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Act
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Assertions
    // Wait for any potential async operations to settle, though none are expected here.
    // Using a short waitFor with a check that shouldn't pass if APIs were called.
    await waitFor(() => {
      // 1. Assert that fetch was not called for token storage or show syncing
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // 2. Assert that no error message is displayed in the UI
    // AppPage currently console.warns in this scenario, so we check for absence of a visible error.
    // We look for a common error container role or text pattern if one exists,
    // or ensure a specific error message isn't present.
    const errorMessages = screen.queryAllByRole('alert'); // Or a more specific query
    expect(errorMessages.length).toBe(0);
    // Or, if errors are just divs with text:
    // expect(screen.queryByText(/error/i)).not.toBeInTheDocument(); // General check
    // More specifically, if AppPage has a known error display mechanism:
    // const errorContainer = screen.queryByTestId('error-message-container');
    // expect(errorContainer).not.toBeInTheDocument();

    // 3. Assert that console.warn was called (as per current AppPage behavior)
    // This part depends on whether AppPage actually calls console.warn.
    // If it does, we can check:
    // await waitFor(() => { // console.warn might be in an async callback
    //  expect(consoleWarnSpy).toHaveBeenCalledWith('Session is null and no error, but no action needed based on current logic for token sync.');
    // });
    // If AppPage is updated to not warn, this can be removed or changed to .not.toHaveBeenCalled()

    // For now, let's assume we primarily care about no API calls and no UI error.
    // The console.warn is an implementation detail that might change.

    // Cleanup spy
    consoleWarnSpy.mockRestore();
  });

  // Test case: useEffect - store-spotify-tokens API call fails
  it('displays an error and does not call sync-shows if store-spotify-tokens API fails', async () => {
    // Arrange
    const storeTokensErrorMessage = 'Failed to store Spotify tokens';
    // Mock getSession to return a valid session with tokens
    mockGetSession.mockReset();
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

    // Mock fetch: first call (store-spotify-tokens) fails, second call (sync-spotify-shows) should not happen
    global.fetch.mockReset();
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: storeTokensErrorMessage }), // Simulate API error response
    });
    // No mock for a second fetch call, as it shouldn't be made.

    // Act
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Assertions
    // 1. Check that the error message from the failed API call is displayed
    const errorDiv = await screen.findByText(storeTokensErrorMessage);
    expect(errorDiv).toBeInTheDocument();

    // 2. Check that the first fetch (store-spotify-tokens) was called
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL}/api/store-spotify-tokens`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer supabase-access-token`
        },
        body: expect.stringMatching(
          /^\{"access_token":"spotify-access-token","refresh_token":"spotify-refresh-token","expires_at":\d+(\.\d+)?\}$/
        ),
      })
    );

    // 3. Assert that the second fetch call (sync-spotify-shows) was NOT made
    // Since we only mocked one response for fetch and checked for calledTimes(1),
    // this implicitly confirms sync-spotify-shows wasn't called.
    // For explicitness, if there was a general succeeding mock for fetch, 
    // we would check it wasn't called with sync-spotify-shows path.
  });

  // Test case: useEffect - sync-spotify-shows API call fails
  it('displays an error if sync-spotify-shows API fails after a successful store-tokens call', async () => {
    // Arrange
    const syncShowsErrorMessage = 'Failed to sync Spotify shows';
    // Mock getSession to return a valid session with tokens
    mockGetSession.mockReset();
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

    // Mock fetch: 
    // First call (store-spotify-tokens) succeeds.
    // Second call (sync-spotify-shows) fails.
    global.fetch.mockReset();
    global.fetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ({ message: 'Tokens stored successfully' }) 
    });
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: syncShowsErrorMessage }), // Simulate API error response
    });

    // Act
    render(
      <MemoryRouter>
        <AppPage />
      </MemoryRouter>
    );

    // Assertions
    // 1. Check that the error message from the failed sync-shows API call is displayed
    const errorDiv = await screen.findByText(syncShowsErrorMessage);
    expect(errorDiv).toBeInTheDocument();

    // 2. Check that both fetch calls were made
    expect(global.fetch).toHaveBeenCalledTimes(2);
    
    // 3. Check the first call (store-spotify-tokens)
    expect(global.fetch).toHaveBeenNthCalledWith(1,
      `${import.meta.env.VITE_API_BASE_URL}/api/store-spotify-tokens`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer supabase-access-token`
        },
        body: expect.stringMatching(
          /^\{"access_token":"spotify-access-token","refresh_token":"spotify-refresh-token","expires_at":\d+(\.\d+)?\}$/
        ),
      })
    );

    // 4. Check the second call (sync-spotify-shows)
    expect(global.fetch).toHaveBeenNthCalledWith(2,
      `${import.meta.env.VITE_API_BASE_URL}/api/sync-spotify-shows`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': `Bearer supabase-access-token`
        },
        // No body is sent for this request, so no body assertion here.
      })
    );
  });

  // More tests will be added here for:
  // - Form submission (transcribe API call)
  // - Loading states
  // - Error states (from token sync, from transcribe)
  // - Behavior when there's no session or missing tokens
}); 