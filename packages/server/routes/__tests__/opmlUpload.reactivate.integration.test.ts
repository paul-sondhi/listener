/**
 * Integration test for OPML Upload - Reactivating inactive subscriptions
 * Tests behavior when user re-imports previously unsubscribed shows
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Set up environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock the OPMLParserService
const mockParseOPML = vi.fn();

vi.mock('../../services/opmlParserService.js', () => {
  return {
    OPMLParserService: vi.fn().mockImplementation(() => {
      return {
        parseOPML: mockParseOPML
      };
    })
  };
});

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => {
        return { data: { user: { id: 'test-user-123' } }, error: null };
      })
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => {
            // When checking for existing show, return it exists
            if (table === 'podcast_shows') {
              return { 
                data: { id: 'show-456', title: 'Reactivated Podcast' }, 
                error: null 
              };
            }
            // When checking for existing subscription, return inactive one
            if (table === 'user_podcast_subscriptions') {
              return { 
                data: { id: 'sub-789', status: 'inactive' }, 
                error: null 
              };
            }
            return { data: null, error: { code: 'PGRST116' } };
          }),
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ 
              data: { id: 'sub-789', status: 'inactive' }, 
              error: null 
            }))
          }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  }))
}));

// Import router after mocks
import opmlUploadRouter from '../opmlUpload.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/opml-upload', opmlUploadRouter);

describe('OPML Upload Reactivate Subscriptions Integration Test', () => {
  it('should reactivate inactive subscriptions', async () => {
    const reactivateOPML = `<?xml version="1.0"?>
      <opml version="1.0">
        <body>
          <outline type="rss" text="Reactivated Podcast" xmlUrl="https://example.com/reactivated-feed.xml" />
        </body>
      </opml>`;

    mockParseOPML.mockResolvedValueOnce({
      success: true,
      totalCount: 1,
      validCount: 1,
      podcasts: [{
        title: 'Reactivated Podcast',
        rssUrl: 'https://example.com/reactivated-feed.xml',
        isValid: true
      }]
    });

    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(reactivateOPML), 'subscriptions.opml');

    expect(response.status).toBe(200);
    expect(response.body.data.totalImported).toBe(1);
    expect(response.body.data.shows[0]).toMatchObject({
      title: 'Reactivated Podcast',
      rssUrl: 'https://example.com/reactivated-feed.xml',
      imported: true
    });
  });
});