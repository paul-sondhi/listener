// Import necessary functions from Vitest and React Testing Library
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom'; // To mock useNavigate

// Import the component to be tested
import Login from '../Login';

// --- Mocks ---

// Mock react-router-dom
// This mock needs to be at the top level for Vitest hoisting
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useNavigate: () => mockNavigate, // Return our mock navigate function
  };
});

// Mock the useAuth hook
const mockSignIn = vi.fn();
const mockUseAuth = vi.fn(); // This will be configured in beforeEach

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth() // The return value will be set in beforeEach
}));


// Test suite for the Login component
describe('Login Component', () => {
  // Reset mocks before each test to ensure test isolation
  beforeEach(() => {
    mockSignIn.mockClear();
    mockNavigate.mockClear();
    // Reset useAuth to a default state or specific state per test group if needed
    // For now, individual tests will set its return value.
    mockUseAuth.mockReset(); // Clears mock history and resets implementation to a no-op
  });

  // Test case: renders the login button
  it('renders the login button', () => {
    // Arrange: Set up the mock return value for useAuth
    mockUseAuth.mockReturnValue({
      user: null, // Simulate no user logged in
      signIn: mockSignIn, // Provide the mock signIn function
    });

    // Act: Render the Login component within a MemoryRouter
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    // Assert: Check if the login button is present in the document
    const loginButton = screen.getByRole('button', { name: /log in with spotify/i });
    expect(loginButton).toBeInTheDocument();
  });

  // Test case: calls signIn on button click with correct parameters
  it('calls signIn when the login button is clicked', async () => {
    // Arrange
    mockUseAuth.mockReturnValue({
      user: null,
      signIn: mockSignIn,
    });
    // Simulate a successful sign-in (no error object returned)
    mockSignIn.mockResolvedValue({}); // Or { error: null } if Login.jsx specifically checks for null

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const loginButton = screen.getByRole('button', { name: /log in with spotify/i });

    // Act: Simulate a user clicking the login button
    // fireEvent.click is synchronous, but the underlying signIn and state updates might be async.
    // Wrapping in act and using await ensures all updates are processed.
    await act(async () => {
      fireEvent.click(loginButton);
    });

    // Assert: Check if the signIn function was called
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith({
      provider: 'spotify',
      options: {
        scopes: 'user-read-email user-library-read',
        redirectTo: expect.stringContaining('/app'), 
        queryParams: {
          show_dialog: 'true'
        }
      }
    });
  });

  // Test case: displays an error message when signIn returns an error
  it('displays an error message when signIn returns an error', async () => {
    // Arrange
    // Simulate an error state by having signIn return an error object
    const errorMessageContent = 'Test login error from signIn';
    mockSignIn.mockResolvedValue({ error: { message: errorMessageContent } });
    mockUseAuth.mockReturnValue({
      user: null,
      signIn: mockSignIn,
    });
    
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const loginButton = screen.getByRole('button', { name: /log in with spotify/i });

    // Act: Click the button, which should now lead to an error
    // Wrapping in act and using await for fireEvent if state updates are async
    await act(async () => {
      fireEvent.click(loginButton);
    });

    // Assert: Check for the error message
    // The Login component sets a specific error message 'Error during login. Please try again.'
    // when it catches an error from signIn.
    const errorMessage = await screen.findByText('Error during login. Please try again.');
    expect(errorMessage).toBeInTheDocument();
  });

  // Test case: navigates to /app if user is already logged in
  it('navigates to /app if user is already logged in on initial render', () => {
    // Arrange: Simulate a logged-in user
    mockUseAuth.mockReturnValue({
      user: { id: 'test-user-id', email: 'test@example.com' }, // Simulate an authenticated user
      signIn: mockSignIn, // signIn might not be needed here but good to provide full mock
    });
    
    // Act
    render(
      <MemoryRouter initialEntries={['/login']}> {/* Optionally set initial route */}
        <Login />
      </MemoryRouter>
    );

    // Assert
    // The navigation happens in a useEffect hook.
    // React Testing Library's render will execute useEffects.
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/app');
  });
}); 