import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import syncShowsRouter from '../syncShows.js';
import * as encryptedTokenHelpers from '../../lib/encryptedTokenHelpers.js';

// ----------------------
// Test set-up helpers
// ----------------------

const mockSupabaseToken = 'mock_sb_token';

// Supabase client mocks
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  upsert: mockUpsert,
  eq: mockEq,
  in: mockIn,
  select: mockSelect,
}));
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

  it('retries upsert when rss_url NOT NULL constraint error occurs and eventually succeeds', async () => {
    // 1st call: fail with rss_url error
    mockUpsert.mockResolvedValueOnce({ error: { message: 'null value in column "rss_url" of relation "podcast_shows" violates not-null constraint' } });
    // Retry call: succeed
    mockUpsert.mockResolvedValueOnce({ error: null, data: [{ id: 'show-row-1' }] });

    // No existing subscriptions
    mockEq.mockResolvedValueOnce({ data: [], error: null });
    mockIn.mockResolvedValueOnce({ error: null });

    const response = await request(app)
      .post('/sync-spotify-shows')
      .set('Cookie', `sb-access-token=${mockSupabaseToken}`);

    expect(response.status).toBe(200);
    // Upsert should have been called twice due to retry logic
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
}); 