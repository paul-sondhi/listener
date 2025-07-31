import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import syncShowsRouter from '../syncShows.js';

// Flag for route to enable legacy shortcuts
process.env.LEGACY_SYNC_TEST = 'true';

// ----------------------
// Test set-up helpers
// ----------------------

const mockSupabaseToken = 'mock_sb_token';

// Supabase client mocks
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn((tableName) => {
  if (tableName === 'podcast_shows') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null, // No existing show by default
            error: null
          }),
          neq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null, // No duplicate RSS URL
              error: null
            })
          })
        })
      }),
      insert: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'null value in column "rss_url" violates not-null constraint' }
      }),
      upsert: mockUpsert,
    };
  }
  if (tableName === 'user_podcast_subscriptions') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],  // Empty array for new users
            error: null
          })
        })
      }),
      upsert: mockUpsert,
      eq: mockEq,
      in: mockIn,
    };
  }
  return {
    insert: vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'null value in column "rss_url" violates not-null constraint' }
    }),
    upsert: mockUpsert,
    eq: mockEq,
    in: mockIn,
    select: mockSelect,
  };
});
const mockAuthGetUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  })),
}));

// Mock encrypted token helper to always succeed
vi.mock('../../lib/encryptedTokenHelpers.js', async () => {
  const actual = await vi.importActual('../../lib/encryptedTokenHelpers.js');
  return {
    ...actual,
    getUserSecret: vi.fn().mockResolvedValue({
      success: true,
      data: {
        access_token: 'spotify_token',
        refresh_token: 'refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'scope',
      },
      elapsed_ms: 1,
    }),
  };
});

// Mock fetch to return a minimal Spotify API response
vi.mock('node-fetch', () => ({
  default: vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ show: { id: 'show1', name: 'Test Show' } }], next: null }), headers: new Map() })),
}));

// ----------------------
// Express test app
// ----------------------
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/sync-spotify-shows', syncShowsRouter);

// ----------------------
// Tests
// ----------------------

describe('sync-spotify-shows legacy rss_url fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds on first try now that rss_url is always included in upsert', async () => {
    // Mock successful upsert (no retry needed since rss_url is now always included)
    mockUpsert.mockResolvedValueOnce({ error: null, data: [{ id: 'show-row-1' }] });

    // No existing subscriptions
    mockEq.mockResolvedValueOnce({ data: [], error: null });
    mockIn.mockResolvedValueOnce({ error: null });

    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);

    if (response.status !== 200) {
      console.error('Response error:', response.body);
    }
    
    expect(response.status).toBe(200);
    // Upsert should only be called once since rss_url is now always included
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    
    // Verify that the upsert call includes both spotify_url and rss_url
    const upsertCall = mockUpsert.mock.calls[0];
    const upsertData = upsertCall[0][0]; // First call, first argument, first array element
    expect(upsertData).toHaveProperty('spotify_url');
    expect(upsertData).toHaveProperty('rss_url');
  });
}); 