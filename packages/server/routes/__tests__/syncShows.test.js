import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import syncShowsRouter from '../syncShows'; // Adjust path

// --- Supabase Client Mock (Table-Differentiated Strategy) ---
const mockSupabaseAuthGetUser = vi.fn();

// Mocks for 'users' table operations
const mockUsersSelectEqSingle = vi.fn(); // For from('users').select(...).eq(...).single()

// Mocks for 'podcast_subscriptions' table operations
const mockSubsSelectEq = vi.fn();      // For from('podcast_subscriptions').select(...).eq(...)
const mockSubsUpdateIn = vi.fn();    // For from('podcast_subscriptions').update(...).in(...)
const mockSubsUpsert = vi.fn();        // For from('podcast_subscriptions').upsert(...)

const mockSupabaseFrom = vi.fn().mockImplementation((tableName) => {
  if (tableName === 'users') {
    return { 
      select: vi.fn().mockReturnValue({ 
        eq: vi.fn().mockReturnValue({ 
          single: mockUsersSelectEqSingle 
        }) 
      }) 
    };
  } else if (tableName === 'podcast_subscriptions') {
    return { 
      select: vi.fn().mockReturnValue({ 
        eq: mockSubsSelectEq 
      }),
      update: vi.fn().mockReturnValue({ 
        in: mockSubsUpdateIn 
      }),
      upsert: mockSubsUpsert 
    };
  }
  // Default fallback, should ideally not be reached if table names are correct
  console.warn(`Supabase mock: Unhandled table name in from(): ${tableName}`);
  return { 
    select: vi.fn().mockReturnThis(), 
    update: vi.fn().mockReturnThis(), 
    upsert: vi.fn().mockReturnThis(), 
    eq: vi.fn().mockReturnThis(), 
    in: vi.fn().mockReturnThis(), 
    single: vi.fn().mockResolvedValue({ data: null, error: new Error('Unhandled table select') }) 
  };
});

const mockSupabaseClient = {
  auth: { getUser: mockSupabaseAuthGetUser },
  from: mockSupabaseFrom,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// --- Mock global fetch (used for Spotify API calls) ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);


// --- Test App Setup ---
const app = express();
app.use(cookieParser());
app.use(express.json());

// Simplified test middleware. The route handler itself performs the critical getUser call.
app.use(async (req, res, next) => {
  // const token = req.cookies['sb-access-token'] || req.headers.authorization?.split(' ')[1];
  // We don't need to call mockSupabaseAuthGetUser here or set req.user,
  // as the route /api/sync-spotify-shows handles its own user authentication via getSupabaseAdmin().auth.getUser().
  // This mock middleware in tests is primarily to ensure the express app setup is complete.
  next();
});
app.use('/api/sync-spotify-shows', syncShowsRouter);

// --- Tests ---
describe('POST /sync-spotify-shows', () => {
  const mockSupabaseToken = 'user_supabase_token';
  const mockUser = { id: 'user-id-123', email: 'test@example.com' };
  const spotifyShowsResponsePage1 = {
    items: [{ show: { id: 'show1', name: 'Show 1', publisher: 'Pub1' } }, { show: { id: 'show2', name: 'Show 2', publisher: 'Pub2' } }],
    next: 'http://spotify.com/page2',
  };
  const spotifyShowsResponsePage2 = {
    items: [{ show: { id: 'show3', name: 'Show 3', publisher: 'Pub3' } }],
    next: null,
  };

  beforeEach(() => {
    // Reset all primary mocks to clear any per-test configurations
    mockFetch.mockReset();
    mockSupabaseAuthGetUser.mockReset();
    mockUsersSelectEqSingle.mockReset();
    mockSubsSelectEq.mockReset();
    mockSubsUpdateIn.mockReset();
    mockSubsUpsert.mockReset();
    // Note: mockSupabaseFrom is a vi.fn().mockImplementation(...) and its internal structure
    // relies on the other mocks (mockUsersSelectEqSingle, etc.). Resetting the underlying mocks
    // effectively resets the paths through mockSupabaseFrom. No need to reset mockSupabaseFrom itself
    // unless its core implementation needs to change between tests (which it doesn't here).

    // Setup mockFetch for typical two-page success
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => spotifyShowsResponsePage1, headers: new Map() })
      .mockResolvedValueOnce({ ok: true, json: async () => spotifyShowsResponsePage2, headers: new Map() });

    // Default Supabase Auth mock
    mockSupabaseAuthGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    // Default mocks for Supabase operations (successful path)
    mockUsersSelectEqSingle.mockResolvedValue({ data: { user_id: mockUser.id, spotify_access_token: 'spotify_token', spotify_refresh_token: 'refresh', spotify_token_expires_at: 'date' }, error: null });
    mockSubsSelectEq.mockResolvedValue({ data: [], error: null }); // No existing subscriptions to mark inactive by default
    mockSubsUpdateIn.mockResolvedValue({ error: null });
    mockSubsUpsert.mockResolvedValue({ error: null });
  });

  it('should successfully sync shows when user is authenticated and has Spotify token', async () => {
    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.active_count).toBe(3); 
    expect(response.body.inactive_count).toBe(0);
    expect(mockSupabaseAuthGetUser).toHaveBeenCalledWith(mockSupabaseToken);
    expect(mockSupabaseFrom).toHaveBeenCalledWith('users'); // Check from('users') was called
    expect(mockUsersSelectEqSingle).toHaveBeenCalled();    // Check the specific chain for users was called
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api.spotify.com/v1/me/shows'), expect.any(Object));
    expect(mockSupabaseFrom).toHaveBeenCalledWith('podcast_subscriptions'); // Check from('podcast_subscriptions')
    expect(mockSubsUpsert).toHaveBeenCalledTimes(3); 
  });

  it('should handle pagination from Spotify API', async () => {
    // Override mockFetch for this specific test to ensure clarity
    const localPage1Data = { items: [{ show: { id: 'p1s1', name: 'Page 1 Show 1' } }], next: 'http://spotify.com/page2' };
    const localPage2Data = { items: [{ show: { id: 'p2s1', name: 'Page 2 Show 1' } }], next: null };
    
    mockFetch.mockReset(); // Clear any beforeEach or other test setups for mockFetch
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => localPage1Data, headers: new Map() })
      .mockResolvedValueOnce({ ok: true, json: async () => localPage2Data, headers: new Map() });

    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(200);
    // With 1 item from page 1, and 1 item from page 2, total active_count should be 2.
    expect(response.body.active_count).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2); 
  });

  it('should mark shows as inactive if not present in Spotify response', async () => {
    // Existing shows in DB: show_old_1, show_old_2, show1 (from Spotify)
    // Spotify fetch returns: show1, show2, show3
    // Result: show_old_1, show_old_2 should be inactive.
    mockSubsSelectEq.mockResolvedValueOnce({ data: [{ id: 'subid_old1', podcast_url: 'https://open.spotify.com/show/show_old_1' }, { id: 'subid_old2', podcast_url: 'https://open.spotify.com/show/show_old_2' }, { id: 'subid1', podcast_url: 'https://open.spotify.com/show/show1' }], error: null });

    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.active_count).toBe(3); 
    expect(response.body.inactive_count).toBe(2); 
    expect(mockSubsUpdateIn).toHaveBeenCalledWith('id', ['subid_old1', 'subid_old2']);
    expect(mockSubsUpdateIn).toHaveBeenCalledTimes(1);
  });

  it('should return 401 if no auth token', async () => {
    mockSupabaseAuthGetUser.mockImplementationOnce(async (token) => {
        if (!token) return {data: {user:null}, error: {message: 'No token'}};
        return { data: { user: mockUser }, error: null };
    });
    const response = await request(app).post('/api/sync-spotify-shows');
    expect(response.status).toBe(401);
  });

  it('should return 401 if Supabase getUser fails', async () => {
    // mockSupabaseAuthGetUser is reset in beforeEach to a successful mock.
    // For this test, we specifically want it to simulate a getUser failure.
    mockSupabaseAuthGetUser.mockResolvedValueOnce({ data: {user: null}, error: { message: 'Auth error' } });

    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', 'sb-access-token=bad_token');
    expect(response.status).toBe(401);
    // No need to restore a spy, as we directly manipulated the mock for this one call.
    // The next call in another test will get the default beforeEach behavior due to mockReset.
  });

  it('should return 400 if user has no Spotify token in DB (userRow is null)', async () => {
    // mockSupabaseAuthGetUser is already set in beforeEach to resolve successfully.
    // We only need to mock the user token fetch to simulate no token row.
    mockUsersSelectEqSingle.mockResolvedValueOnce({ data: null, error: null }); // Simulate user not found or no token row
    
    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Could not retrieve user Spotify tokens');
  });
  
  it('should return 400 if user row has no spotify_access_token field', async () => {
    // mockSupabaseAuthGetUser is already set in beforeEach to resolve successfully.
    // We only need to mock the user token fetch to simulate a row without the access token.
    mockUsersSelectEqSingle.mockResolvedValueOnce({ data: { user_id: mockUser.id /* no access token */ }, error: null });
    
    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No Spotify access token found for user');
  });

  it('should return 502 if Spotify API call fails after retries', async () => {
    // Auth and user token retrieval are successfully mocked by default in beforeEach.

    // For this test, we need mockFetch to consistently fail.
    // The beforeEach sets up two successful mockFetch calls initially. We must clear these
    // and then set mockFetch to always return a failure for the duration of this test.
    mockFetch.mockReset(); 
    mockFetch.mockResolvedValue({ ok: false, status: 503, headers: new Map(), statusText: 'Service Unavailable' }); 
    
    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Failed to fetch shows from Spotify');
    // The route attempts 1 initial call + 3 retries = 4 calls in total upon persistent failure.
    expect(mockFetch).toHaveBeenCalledTimes(4); 
  });

  it('should handle errors during Supabase upsert', async () => {
    mockSubsUpsert.mockResolvedValueOnce({ error: { message: 'DB upsert error' } });
    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500); 
    expect(response.body.error).toMatch(/Error saving shows to database: Upsert failed/i);
  });

  it('should handle errors during Supabase select for existing subscriptions', async () => {
    mockSubsSelectEq.mockResolvedValueOnce({ error: { message: 'DB select error for subs' } });
    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Error saving shows to database: Failed to fetch existing subscriptions/i);
  });

  it('should handle errors during Supabase update (for inactivation)', async () => {
    // Ensure some shows are fetched from Spotify, and some existing subs are present to attempt inactivation
    mockSubsSelectEq.mockResolvedValueOnce({ data: [{ id: 'sub_to_inactivate', podcast_url: 'spotify:show:oldShowNotOnSpotify' }], error: null });
    mockSubsUpdateIn.mockResolvedValueOnce({ error: { message: 'DB update error during inactivation' } }); 
    
    const response = await request(app)
      .post('/api/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Error updating inactive shows: Database operation failed/i);
  });

  it('should return 500 for unexpected errors (e.g. getUser throws)', async () => {
    mockSupabaseAuthGetUser.mockRejectedValueOnce(new Error('Unexpected Auth Crash!'));
    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });

  it('should return 500 for unexpected errors (e.g. users.select.eq.single throws)', async () => {
    mockUsersSelectEqSingle.mockRejectedValueOnce(new Error('Unexpected DB Crash during user token fetch!'));
    const response = await request(app).post('/api/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });
}); 