/**
 * Integration test for OPML Upload - Multiple podcasts
 * Tests behavior when importing OPML with multiple podcast feeds
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

// Track database calls
const dbCalls: any[] = [];

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => {
        return { data: { user: { id: 'test-user-123' } }, error: null };
      })
    },
    from: vi.fn((table) => {
      const call = { table, operations: [] };
      dbCalls.push(call);
      
      const queryBuilder = {
        select: vi.fn(() => {
          call.operations.push('select');
          return queryBuilder;
        }),
        eq: vi.fn(() => {
          call.operations.push('eq');
          return queryBuilder;
        }),
        single: vi.fn(async () => {
          call.operations.push('single');
          
          // Check if this is a query for Podcast 2 (which should exist)
          if (table === 'podcast_shows' && dbCalls.length > 2) {
            const previousCalls = dbCalls.slice(-3);
            const hasPodcast2Insert = previousCalls.some(c => 
              c.operations.includes('insert') && 
              c.table === 'podcast_shows'
            );
            
            if (hasPodcast2Insert) {
              return { 
                data: { id: 'show-2', title: 'Podcast 2' }, 
                error: null 
              };
            }
          }
          
          // Default: not found
          return { data: null, error: { code: 'PGRST116' } };
        }),
        insert: vi.fn((data) => {
          call.operations.push('insert');
          
          if (table === 'podcast_shows') {
            // Return different IDs for different podcasts
            const showId = data.title === 'Podcast 1' ? 'show-1' : 'show-2';
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ 
                  data: { id: showId }, 
                  error: null 
                }))
              }))
            };
          }
          
          // For subscriptions
          return Promise.resolve({ error: null });
        })
      };
      
      return queryBuilder;
    })
  }))
}));

// Import router after mocks
import opmlUploadRouter from '../opmlUpload.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/opml-upload', opmlUploadRouter);

describe('OPML Upload Multiple Podcasts Integration Test', () => {
  it('should handle multiple podcasts in OPML', async () => {
    const multipleOPML = `<?xml version="1.0"?>
      <opml version="1.0">
        <body>
          <outline type="rss" text="Podcast 1" xmlUrl="https://example.com/feed1.xml" />
          <outline type="rss" text="Podcast 2" xmlUrl="https://example.com/feed2.xml" />
          <outline type="rss" text="Invalid Podcast" xmlUrl="https://invalid.com/feed.xml" />
        </body>
      </opml>`;

    mockParseOPML.mockResolvedValueOnce({
      success: true,
      totalCount: 3,
      validCount: 2,
      podcasts: [
        { title: 'Podcast 1', rssUrl: 'https://example.com/feed1.xml', isValid: true },
        { title: 'Podcast 2', rssUrl: 'https://example.com/feed2.xml', isValid: true },
        { title: 'Invalid Podcast', rssUrl: 'https://invalid.com/feed.xml', isValid: false, validationError: 'Feed not reachable' }
      ]
    });

    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(multipleOPML), 'subscriptions.opml');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totalImported: 2,
      totalInFile: 3,
      validFeeds: 2,
      shows: expect.arrayContaining([
        { title: 'Podcast 1', rssUrl: 'https://example.com/feed1.xml', imported: true },
        { title: 'Podcast 2', rssUrl: 'https://example.com/feed2.xml', imported: true },
        { title: 'Invalid Podcast', rssUrl: 'https://invalid.com/feed.xml', imported: false, error: 'Feed not reachable' }
      ])
    });
  });
});