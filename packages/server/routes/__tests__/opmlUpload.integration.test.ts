/**
 * Integration tests for OPML Upload Route
 * 
 * These tests are structured to work with the singleton pattern in the route.
 * All database operations are mocked in a single beforeAll setup to avoid
 * issues with the singleton Supabase client.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Set up environment variables
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Track all database operations for assertions
const dbOperations: any[] = [];

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

// Set up Supabase mock BEFORE importing the route
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const mockClient = {
      auth: {
        getUser: vi.fn(async (token) => {
          dbOperations.push({ operation: 'auth.getUser', token });
          
          // Return different responses based on token
          if (token === 'invalid-token') {
            return { data: { user: null }, error: { message: 'Invalid token' } };
          }
          
          return { data: { user: { id: 'test-user-123' } }, error: null };
        })
      },
      from: vi.fn((table) => {
        const currentOp = { table, operations: [] };
        dbOperations.push(currentOp);
        
        const queryBuilder = {
          select: vi.fn((fields) => {
            currentOp.operations.push({ method: 'select', fields });
            return queryBuilder;
          }),
          insert: vi.fn((data) => {
            currentOp.operations.push({ method: 'insert', data });
            
            // For podcast_shows insert, return object with select method
            if (table === 'podcast_shows') {
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    currentOp.operations.push({ method: 'single' });
                    return { data: { id: `show-${Date.now()}` }, error: null };
                  })
                }))
              };
            }
            
            // For subscriptions, just return success
            return Promise.resolve({ error: null });
          }),
          update: vi.fn((data) => {
            currentOp.operations.push({ method: 'update', data });
            return {
              eq: vi.fn((field, value) => {
                currentOp.operations.push({ method: 'eq', field, value });
                return Promise.resolve({ error: null });
              })
            };
          }),
          eq: vi.fn((field, value) => {
            currentOp.operations.push({ method: 'eq', field, value });
            return queryBuilder;
          }),
          single: vi.fn(async () => {
            currentOp.operations.push({ method: 'single' });
            
            // Determine response based on query pattern
            const selectOp = currentOp.operations.find(op => op.method === 'select');
            const eqOps = currentOp.operations.filter(op => op.method === 'eq');
            
            // Check for existing show by RSS URL
            if (table === 'podcast_shows' && selectOp?.fields?.includes('id')) {
              const rssUrlEq = eqOps.find(op => op.field === 'rss_url');
              if (rssUrlEq?.value === 'https://example.com/existing-feed.xml') {
                return { 
                  data: { id: 'existing-show-id', title: 'Existing Podcast' }, 
                  error: null 
                };
              }
              if (rssUrlEq?.value === 'https://example.com/reactivated-feed.xml') {
                return { 
                  data: { id: 'show-456', title: 'Reactivated Podcast' }, 
                  error: null 
                };
              }
              if (rssUrlEq?.value === 'https://example.com/feed2.xml') {
                return { 
                  data: { id: 'show-2', title: 'Podcast 2' }, 
                  error: null 
                };
              }
            }
            
            // Check for existing subscription
            if (table === 'user_podcast_subscriptions' && selectOp?.fields?.includes('id')) {
              const showIdEq = eqOps.find(op => op.field === 'show_id');
              if (showIdEq?.value === 'show-456') {
                return { 
                  data: { id: 'sub-789', status: 'inactive' }, 
                  error: null 
                };
              }
            }
            
            // Default: not found
            return { data: null, error: { code: 'PGRST116' } };
          })
        };
        
        return queryBuilder;
      })
    };
    
    return mockClient;
  })
}));

// Import router AFTER mocks are set up
import opmlUploadRouter from '../opmlUpload.js';

// Create app once for all tests
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/opml-upload', opmlUploadRouter);

describe('OPML Upload Route Integration', () => {
  beforeEach(() => {
    // Clear tracking arrays
    dbOperations.length = 0;
    
    // Reset parse mock
    mockParseOPML.mockReset();
  });

  describe('POST /api/opml-upload', () => {
    const validOPMLContent = `<?xml version="1.0"?>
      <opml version="1.0">
        <body>
          <outline type="rss" text="Test Podcast Integration" xmlUrl="https://example.com/test-feed.xml" />
        </body>
      </opml>`;

    it('should successfully import podcasts with full database flow', async () => {
      mockParseOPML.mockResolvedValueOnce({
        success: true,
        totalCount: 1,
        validCount: 1,
        podcasts: [{
          title: 'Test Podcast Integration',
          rssUrl: 'https://example.com/test-feed.xml',
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
            title: 'Test Podcast Integration',
            rssUrl: 'https://example.com/test-feed.xml',
            imported: true
          }]
        }
      });

      // Verify database operations
      const authOp = dbOperations.find(op => op.operation === 'auth.getUser');
      expect(authOp).toBeDefined();
      expect(authOp.token).toBe('test-token');

      const showOps = dbOperations.filter(op => op.table === 'podcast_shows');
      expect(showOps.length).toBeGreaterThan(0);
      
      const insertOp = showOps.find(op => 
        op.operations.some(o => o.method === 'insert')
      );
      expect(insertOp).toBeDefined();
    });

    // NOTE: The following tests have been moved to separate files to avoid singleton conflicts:
    // - opmlUpload.duplicates.integration.test.ts: Tests handling of existing shows
    // - opmlUpload.reactivate.integration.test.ts: Tests reactivating inactive subscriptions  
    // - opmlUpload.multiple.integration.test.ts: Tests handling multiple podcasts in OPML

    it('should handle auth errors with 401', async () => {
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
  });
});