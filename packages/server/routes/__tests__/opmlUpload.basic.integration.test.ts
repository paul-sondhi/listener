/**
 * Basic integration tests for OPML Upload Route
 * Tests authentication and basic validation
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
      getUser: vi.fn(async (token) => {
        if (token === 'invalid-token') {
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }
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

describe('OPML Upload Basic Integration Tests', () => {
  const validOPMLContent = `<?xml version="1.0"?>
    <opml version="1.0">
      <body>
        <outline type="rss" text="Test Podcast" xmlUrl="https://example.com/feed.xml" />
      </body>
    </opml>`;

  it('should handle no file upload', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'No file uploaded. Please select an OPML file.'
    });
  });

  it('should handle no auth token', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .attach('opmlFile', Buffer.from(validOPMLContent), 'subscriptions.opml');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  });

  it('should handle invalid auth token', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer invalid-token')
      .attach('opmlFile', Buffer.from(validOPMLContent), 'subscriptions.opml');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: 'Invalid authentication token. Please log in again.'
    });
  });

  // NOTE: The successful import test has been moved to opmlUpload.success.integration.test.ts
  // to avoid singleton conflicts
});