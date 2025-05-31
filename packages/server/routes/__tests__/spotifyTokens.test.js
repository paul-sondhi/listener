import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser'; // Added to parse cookies
import spotifyTokensRouter from '../spotifyTokens'; // Adjust path

// More complete mock for Supabase client methods used by the route
const mockSupabaseAuthGetUser = vi.fn();
const mockSupabaseFrom = vi.fn();
const mockSupabaseUpdate = vi.fn();
const mockSupabaseEq = vi.fn(); // This will resolve the promise for the update operation

const mockSupabaseClient = {
  auth: {
    getUser: mockSupabaseAuthGetUser,
  },
  from: mockSupabaseFrom,
};

// Setup chaining for the mock client
mockSupabaseFrom.mockImplementation(() => ({ // from() returns an object with update
  update: mockSupabaseUpdate,
}));
mockSupabaseUpdate.mockImplementation(() => ({ // update() returns an object with eq
  eq: mockSupabaseEq,
}));
// eq will be set to mockResolvedValue in individual tests or beforeEach

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Create a test app
const app = express();
app.use(cookieParser()); // Use cookie-parser middleware
app.use(express.json()); // To parse JSON request bodies

// Apply a simplified auth mock. 
// The actual route calls getSupabaseAdmin().auth.getUser() itself, so this middleware
// doesn't need to call it. It's more about ensuring the token is present for the route to pick up.
app.use(async (req, res, next) => {
  const token = req.cookies['sb-access-token'] || req.headers.authorization?.split(' ')[1];
  // Simulate that if a token exists, auth might have run. For these tests, 
  // the route handler itself does the critical getUser call which is what we mock and test.
  // We don't need to set req.user here as spotifyTokens.js doesn't use it.
  // Just ensuring the token extraction logic is covered implicitly by tests requiring a token.
  if (!token) {
    // This case is handled by the route itself if no token leads to an error there.
    // Or, specific tests for "no token" don't set one.
  }
  next();
});

app.use('/spotify-tokens', spotifyTokensRouter); // Mount the router

describe('POST /spotify-tokens', () => {
  const mockUser = { id: 'user-uuid-123', email: 'test@example.com' };
  const mockTokens = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
  };

  beforeEach(() => {
    // Clear mocks before each test, but keep implementations
    vi.clearAllMocks();

    // Default successful getUser mock
    mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });
    // Default successful update mock
    mockSupabaseEq.mockResolvedValue({ error: null }); // .eq is the last in the chain
  });

  it('should store tokens successfully with valid token in cookie and valid body', async () => {
    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith('user_supabase_token');
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users');
    expect(mockSupabaseUpdate).toHaveBeenCalledWith({
      spotify_access_token: mockTokens.access_token,
      spotify_refresh_token: mockTokens.refresh_token,
      spotify_token_expires_at: new Date(mockTokens.expires_at * 1000).toISOString(),
    });
    expect(mockSupabaseEq).toHaveBeenCalledWith('id', mockUser.id);
  });

  it('should store tokens successfully with valid token in Authorization header', async () => {
    const response = await request(app)
      .post('/spotify-tokens')
      .set('Authorization', 'Bearer user_supabase_token')
      .send(mockTokens);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith('user_supabase_token');
  });

  it('should return 401 if no auth token is provided', async () => {
    const response = await request(app)
      .post('/spotify-tokens')
      .send(mockTokens);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Not authenticated' });
  });

  it('should return 401 if Supabase getUser fails or returns no user', async () => {
    mockSupabaseAuthGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Auth error' } });

    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=invalid_user_token')
      .send(mockTokens);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'User authentication failed' });
  });

  it('should return 400 if token fields are missing in the request body', async () => {
    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send({ access_token: 'test' }); // Missing refresh_token and expires_at

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing token fields' });
  });

  it('should return 500 if Supabase update fails', async () => {
    mockSupabaseEq.mockResolvedValueOnce({ error: { message: 'DB update error' } });

    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to update user tokens' });
  });

  it('should return 500 for unexpected errors during Supabase getUser', async () => {
    mockSupabaseAuthGetUser.mockRejectedValueOnce(new Error('Unexpected Supabase error'));

    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  it('should return 500 for unexpected errors during Supabase update', async () => {
    // This mock specifically makes the .eq call fail unexpectedly, not just return an error object
    mockSupabaseEq.mockRejectedValueOnce(new Error('Unexpected DB error'));

    const response = await request(app)
      .post('/spotify-tokens')
      .set('Cookie', 'sb-access-token=user_supabase_token')
      .send(mockTokens);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
}); 