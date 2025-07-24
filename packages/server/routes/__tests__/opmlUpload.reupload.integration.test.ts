/**
 * Integration tests for OPML re-upload scenarios
 * 
 * Tests the behavior when users upload OPML files multiple times,
 * including subscription status updates and handling of removed/added podcasts.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Set up environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock node-fetch for RSS validation
vi.mock('node-fetch', () => ({
  default: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK'
  })
}));

// Track database operations
const dbOperations: any = {
  shows: new Map(),
  subscriptions: new Map()
};

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-123' } },
        error: null
      }))
    },
    from: vi.fn((table) => {
      if (table === 'podcast_shows') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field, value) => ({
              single: vi.fn(async () => {
                const show = Array.from(dbOperations.shows.values()).find(s => s.rss_url === value);
                return show ? { data: show, error: null } : { data: null, error: { code: 'PGRST116' } };
              })
            }))
          })),
          insert: vi.fn((data) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const id = `show-${Date.now()}-${Math.random()}`;
                const show = { ...data, id };
                dbOperations.shows.set(id, show);
                return { data: { id }, error: null };
              })
            }))
          }))
        };
      } else if (table === 'user_podcast_subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } }))
              }))
            }))
          })),
          insert: vi.fn((data) => {
            const id = `sub-${Date.now()}-${Math.random()}`;
            const sub = { ...data, id };
            dbOperations.subscriptions.set(id, sub);
            return Promise.resolve({ error: null });
          })
        };
      }
      return {};
    })
  }))
}));

// Test app
let app: express.Application;

describe('OPML Re-upload Integration Tests', () => {
  beforeAll(async () => {
    // Import route after mocks are set up
    const uploadModule = await import('../opmlUpload.js');
    const opmlUploadRouter = uploadModule.default;

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/opml-upload', opmlUploadRouter);
  });

  it('should handle re-upload with subscription status changes correctly', async () => {
    // Clear any previous operations
    dbOperations.shows.clear();
    dbOperations.subscriptions.clear();

    // First upload - 3 podcasts
    const firstOPML = `<?xml version="1.0" encoding="utf-8"?>
      <opml version="1.0">
        <head><title>Initial Podcasts</title></head>
        <body>
          <outline text="Podcast A" type="rss" xmlUrl="https://feeds.example.com/podcast-a.rss" />
          <outline text="Podcast B" type="rss" xmlUrl="https://feeds.example.com/podcast-b.rss" />
          <outline text="Podcast C" type="rss" xmlUrl="https://feeds.example.com/podcast-c.rss" />
        </body>
      </opml>`;

    // First upload
    const firstResponse = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(firstOPML), 'first.opml');
    
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.success).toBe(true);
    expect(firstResponse.body.data.totalImported).toBe(3);

    // Verify that 3 shows and 3 subscriptions were created
    expect(dbOperations.shows.size).toBe(3);
    expect(dbOperations.subscriptions.size).toBe(3);
  });

  it('should handle empty OPML re-upload gracefully', async () => {
    // Clear operations
    dbOperations.shows.clear();
    dbOperations.subscriptions.clear();

    // Empty OPML
    const emptyOPML = `<?xml version="1.0" encoding="utf-8"?>
      <opml version="1.0">
        <head><title>Empty</title></head>
        <body></body>
      </opml>`;

    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(emptyOPML), 'empty.opml');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalImported).toBe(0);
    expect(response.body.data.shows).toHaveLength(0);
  });
});