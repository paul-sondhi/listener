import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import syncShowsRouter from '../syncShows'; // Adjust path
import * as vaultHelpers from '../../lib/vaultHelpers.js';

// Set up required environment variables for testing
// These need to be present for the getSupabaseAdmin() function to work
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-testing'

// --- Mock Supabase client and operations ---
let mockSupabaseAuthGetUser = vi.fn();

// Mock Supabase table operations
let mockUpsert = vi.fn();
let mockSelect = vi.fn();
let mockUpdate = vi.fn();
let mockEq = vi.fn();
let mockIn = vi.fn();

// Mock the Supabase table reference
// This function returns an object with the table operation methods
// The implementation will be set up in beforeEach
let mockSupabaseFrom = vi.fn().mockImplementation((tableName) => {
  if (tableName === 'podcast_subscriptions') {
    // Always return a fresh object with current mock functions
    return {
      // Direct upsert call
      upsert: mockUpsert,
      // Select chain
      select: vi.fn().mockReturnValue({
        eq: mockEq
      }),
      // Update chain  
      update: vi.fn().mockReturnValue({
        in: mockIn
      })
    };
  }
  // Fallback for any other table
  return {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null })
    }),
    update: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null })
    })
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockSupabaseAuthGetUser },
    from: mockSupabaseFrom,
  })),
}));

// Import the mocked createClient for use in beforeEach
import { createClient } from '@supabase/supabase-js';

// --- Mock vault helpers ---
vi.mock('../../lib/vaultHelpers', () => ({
  getUserSecret: vi.fn()
}));

// --- Mock global fetch (used for Spotify API calls) ---
let mockFetch = vi.fn();
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
app.use('/sync-spotify-shows', syncShowsRouter);

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
    // Clear all mocks first
    vi.clearAllMocks();
    
    // Completely re-establish all mocks from scratch
    mockFetch = vi.fn();
    mockSupabaseAuthGetUser = vi.fn();
    mockUpsert = vi.fn();
    mockSelect = vi.fn();
    mockUpdate = vi.fn();
    mockEq = vi.fn();
    mockIn = vi.fn();
    
    // Re-establish the complete mock chain structure
    mockSupabaseFrom = vi.fn(() => ({
      upsert: mockUpsert,
      select: mockSelect,
      update: mockUpdate,
    }));
    
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    
    mockUpdate.mockReturnValue({
      in: mockIn,
    });
    
    // Re-establish the createClient mock completely
    vi.mocked(createClient).mockImplementation(() => ({
      auth: { getUser: mockSupabaseAuthGetUser },
      from: mockSupabaseFrom,
    }));
    
    // Re-establish global fetch mock
    global.fetch = mockFetch;
    
    // Re-establish vault helpers mock
    vi.mocked(vaultHelpers.getUserSecret).mockImplementation(() => Promise.resolve(null));
    
    // Set up default successful responses for all mocks
    mockSupabaseAuthGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    
    mockUpsert.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ data: [], error: null });
    mockIn.mockResolvedValue({ error: null });
  });

  it('should successfully sync shows when user is authenticated and has Spotify token', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return successful Spotify response
    const spotifyResponse = {
      items: [{ show: { id: 'show1', name: 'Test Show' } }],
      next: null
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => spotifyResponse, headers: new Map() });
    
    // Ensure upsert operations succeed
    mockUpsert.mockResolvedValue({ error: null });
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.active_count).toBe(1);
    expect(response.body.inactive_count).toBe(0);
  });

  it('should handle pagination from Spotify API', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return paginated Spotify responses
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => spotifyShowsResponsePage1, headers: new Map() })
      .mockResolvedValueOnce({ ok: true, json: async () => spotifyShowsResponsePage2, headers: new Map() });
    
    // Ensure upsert operations succeed
    mockUpsert.mockResolvedValue({ error: null });
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(200);
    // With 2 items from page 1, and 1 item from page 2, total active_count should be 3.
    expect(response.body.active_count).toBe(3);
    expect(response.body.inactive_count).toBe(0);
  });

  it('should mark shows as inactive if not present in Spotify response', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return Spotify response with 3 shows
    const spotifyResponse = {
      items: [
        { show: { id: 'show1', name: 'Show 1' } },
        { show: { id: 'show2', name: 'Show 2' } },
        { show: { id: 'show3', name: 'Show 3' } }
      ],
      next: null
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => spotifyResponse, headers: new Map() });
    
    // Set up existing subscriptions data (5 existing, 3 from Spotify = 2 should be inactive)
    const existingSubscriptions = [
      { id: 'subid_old1', podcast_url: 'https://open.spotify.com/show/show_old_1' },
      { id: 'subid_old2', podcast_url: 'https://open.spotify.com/show/show_old_2' },
      { id: 'subid1', podcast_url: 'https://open.spotify.com/show/show1' },
      { id: 'subid2', podcast_url: 'https://open.spotify.com/show/show2' },
      { id: 'subid3', podcast_url: 'https://open.spotify.com/show/show3' }
    ];
    
    // Ensure all operations succeed
    mockUpsert.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ data: existingSubscriptions, error: null });
    mockIn.mockResolvedValue({ error: null });
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.active_count).toBe(3); 
    expect(response.body.inactive_count).toBe(2); 
  });

  it('should return 401 if no auth token', async () => {
    mockSupabaseAuthGetUser.mockImplementationOnce(async (token) => {
        if (!token) return {data: {user:null}, error: {message: 'No token'}};
        return { data: { user: mockUser }, error: null };
    });
    const response = await request(app).post('/sync-spotify-shows');
    expect(response.status).toBe(401);
  });

  it('should return 401 if Supabase getUser fails', async () => {
    // mockSupabaseAuthGetUser is reset in beforeEach to a successful mock.
    // For this test, we specifically want it to simulate a getUser failure.
    mockSupabaseAuthGetUser.mockResolvedValueOnce({ data: {user: null}, error: { message: 'Auth error' } });

    const response = await request(app).post('/sync-spotify-shows').set('Cookie', 'sb-access-token=bad_token');
    expect(response.status).toBe(401);
    // No need to restore a spy, as we directly manipulated the mock for this one call.
    // The next call in another test will get the default beforeEach behavior due to mockReset.
  });

  it('should return 400 if user has no Spotify token in DB (userRow is null)', async () => {
    // Mock vault getUserSecret to simulate failure to retrieve tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValueOnce({
      success: false,
      error: 'No vault secret found',
      elapsed_ms: 50
    });
    
    const response = await request(app).post('/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Could not retrieve user Spotify tokens');
  });
  
  it('should return 400 if user row has no spotify_access_token field', async () => {
    // Mock vault getUserSecret to return data without access_token
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValueOnce({
      success: true,
      data: {
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
        // Missing access_token
      },
      elapsed_ms: 50
    });
    
    const response = await request(app).post('/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No Spotify access token found for user');
  });

  it('should return 502 if Spotify API call fails after retries', async () => {
    // Set up vault to return valid Spotify tokens first
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });

    // For this test, we need mockFetch to consistently fail.
    // The beforeEach sets up two successful mockFetch calls initially. We must clear these
    // and then set mockFetch to always return a failure for the duration of this test.
    mockFetch.mockReset(); 
    mockFetch.mockResolvedValue({ ok: false, status: 503, headers: new Map(), statusText: 'Service Unavailable' }); 
    
    const response = await request(app).post('/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    
    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Failed to fetch shows from Spotify');
    // The route attempts 1 initial call + 3 retries = 4 calls in total upon persistent failure.
    expect(mockFetch).toHaveBeenCalledTimes(4); 
  });

  it('should handle errors during Supabase upsert', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return successful Spotify response
    const spotifyResponse = {
      items: [{ show: { id: 'show1', name: 'Test Show' } }],
      next: null
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => spotifyResponse, headers: new Map() });
    
    // Mock the upsert to return an error for the first call
    mockUpsert.mockResolvedValueOnce({ error: { message: 'DB upsert error' } });
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500); 
    expect(response.body.error).toMatch(/Error saving shows to database: Upsert failed/i);
  });

  it('should handle errors during Supabase select for existing subscriptions', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return successful Spotify response
    const spotifyResponse = {
      items: [{ show: { id: 'show1', name: 'Test Show' } }],
      next: null
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => spotifyResponse, headers: new Map() });
    
    // Ensure upsert operations succeed first (3 shows from default Spotify response)
    mockUpsert.mockResolvedValue({ error: null }); // All upserts should succeed
    
    // Then make the select operation fail
    mockEq.mockResolvedValueOnce({ error: { message: 'DB select error for subs' } });
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Error saving shows to database: Failed to fetch existing subscriptions/i);
  });

  it('should handle errors during Supabase update (for inactivation)', async () => {
    // Set up vault to return valid Spotify tokens
    vi.mocked(vaultHelpers.getUserSecret).mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      },
      elapsed_ms: 100
    });
    
    // Set up fetch to return successful Spotify response
    const spotifyResponse = {
      items: [{ show: { id: 'show1', name: 'Test Show' } }],
      next: null
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => spotifyResponse, headers: new Map() });
    
    // Ensure upsert operations succeed first (3 shows from default Spotify response)
    mockUpsert.mockResolvedValue({ error: null }); // All upserts should succeed
    
    // Ensure some shows are fetched from Spotify, and some existing subs are present to attempt inactivation
    mockEq.mockResolvedValueOnce({ data: [{ id: 'sub_to_inactivate', podcast_url: 'spotify:show:oldShowNotOnSpotify' }], error: null });
    
    // Then make the update operation fail
    mockIn.mockResolvedValueOnce({ error: { message: 'DB update error during inactivation' } }); 
    
    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/Error updating inactive shows: Database operation failed/i);
  });

  it('should return 500 for unexpected errors (e.g. getUser throws)', async () => {
    mockSupabaseAuthGetUser.mockRejectedValueOnce(new Error('Unexpected Auth Crash!'));
    const response = await request(app).post('/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });

  it('should return 500 for unexpected errors (e.g. users.select.eq.single throws)', async () => {
    vi.mocked(vaultHelpers.getUserSecret).mockRejectedValueOnce(new Error('Unexpected vault error during token fetch!'));
    const response = await request(app).post('/sync-spotify-shows').set('Cookie', `sb-access-token=${mockSupabaseToken}`);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Internal server error');
  });
}); 