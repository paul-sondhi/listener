/**
 * Integration test for OPML Upload - Successful import
 * Tests the happy path of importing a new podcast
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
    from: vi.fn((_table) => {
      const queryBuilder = {
        select: vi.fn(() => queryBuilder),
        eq: vi.fn(() => queryBuilder),
        single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'new-show-id' }, error: null }))
          }))
        }))
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

describe('OPML Upload Success Integration Test', () => {
  it('should successfully import a new podcast', async () => {
    const validOPMLContent = `<?xml version="1.0"?>
      <opml version="1.0">
        <body>
          <outline type="rss" text="Test Podcast" xmlUrl="https://example.com/feed.xml" />
        </body>
      </opml>`;

    mockParseOPML.mockResolvedValueOnce({
      success: true,
      totalCount: 1,
      validCount: 1,
      podcasts: [{
        title: 'Test Podcast',
        rssUrl: 'https://example.com/feed.xml',
        isValid: true
      }]
    });

    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token')
      .attach('opmlFile', Buffer.from(validOPMLContent), 'subscriptions.opml');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        totalImported: 1,
        totalInFile: 1,
        validFeeds: 1,
        shows: [{
          title: 'Test Podcast',
          rssUrl: 'https://example.com/feed.xml',
          imported: true
        }]
      }
    });
  });
});