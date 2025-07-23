/**
 * Integration test for OPML Upload - Duplicate handling
 * Tests behavior when shows already exist
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
            // Return existing show when checking podcast_shows
            if (table === 'podcast_shows') {
              return { 
                data: { id: 'existing-show-id', title: 'Existing Podcast' }, 
                error: null 
              };
            }
            // Return no subscription exists
            return { data: null, error: { code: 'PGRST116' } };
          }),
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } }))
          }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }))
}));

// Import router after mocks
import opmlUploadRouter from '../opmlUpload.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/opml-upload', opmlUploadRouter);

describe('OPML Upload Duplicate Handling Integration Test', () => {
  it('should handle existing shows without creating duplicates', async () => {
    const existingOPML = `<?xml version="1.0"?>
      <opml version="1.0">
        <body>
          <outline type="rss" text="Existing Podcast" xmlUrl="https://example.com/existing-feed.xml" />
        </body>
      </opml>`;

    mockParseOPML.mockResolvedValueOnce({
      success: true,
      totalCount: 1,
      validCount: 1,
      podcasts: [{
        title: 'Existing Podcast',
        rssUrl: 'https://example.com/existing-feed.xml',
        isValid: true
      }]
    });

    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(existingOPML), 'subscriptions.opml');

    expect(response.status).toBe(200);
    expect(response.body.data.totalImported).toBe(1);
    expect(response.body.data.shows[0]).toMatchObject({
      title: 'Existing Podcast',
      rssUrl: 'https://example.com/existing-feed.xml',
      imported: true
    });
  });
});