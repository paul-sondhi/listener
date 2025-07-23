/**
 * Unit tests for OPML Upload Route
 * 
 * Note: Due to the singleton pattern in the route's Supabase client initialization,
 * comprehensive route testing is done in opmlUpload.integration.test.ts
 * These tests focus on validating the route setup and basic request handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// Test that the route module exports properly
describe('OPML Upload Route Module', () => {
  it('should export a router', async () => {
    const module = await import('../opmlUpload.js');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });
});

// Basic route tests that don't require auth
describe('OPML Upload Route Basic Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    // Set up required environment variables
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-for-testing';
    
    // Import the router
    const { default: opmlUploadRouter } = await import('../opmlUpload.js');
    
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/opml-upload', opmlUploadRouter);
  });

  it('should return 400 if no file is uploaded', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer fake-token');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'No file uploaded. Please select an OPML file.'
    });
  });

  it('should return 401 if no auth token is provided', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .attach('opmlFile', Buffer.from('<opml></opml>'), 'test.opml');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: 'Authentication required. Please log in.'
    });
  });

  it('should handle file upload with invalid extension', async () => {
    const response = await request(app)
      .post('/api/opml-upload')
      .set('Authorization', 'Bearer fake-token')
      .attach('opmlFile', Buffer.from('not xml'), 'file.txt');

    // Multer should reject this before it reaches our handler
    // The exact response depends on multer's file filter
    expect(response.status).toBe(500); // Multer errors often result in 500
  });
});

// Note: For comprehensive testing including auth flow, database operations,
// and OPML parsing, see opmlUpload.integration.test.ts