import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// import mainApiRouter from '../index'; // REMOVED static import

// Define mock routers at the very top
const mockTranscribeRouter = vi.fn((_req, _res, next) => next());
const mockSpotifyTokensRouter = vi.fn((_req, _res, next) => next());
const mockSyncShowsRouter = vi.fn((_req, _res, next) => next());
const mockHealthRouter = vi.fn((_req, _res, next) => next());

// Mock the sub-routers that mainApiRouter depends on
vi.mock('../transcribe.js', () => ({ default: mockTranscribeRouter }));
vi.mock('../spotifyTokens.js', () => ({ default: mockSpotifyTokensRouter }));
vi.mock('../syncShows.js', () => ({ default: mockSyncShowsRouter }));
vi.mock('../health.js', () => ({ default: mockHealthRouter }));

let app; // Declare app here to be accessible in tests

describe('Main API Router (routes/index.js)', () => {
  beforeAll(async () => {
    // Dynamically import the mainApiRouter AFTER mocks are set up
    const mainApiRouterModule = await import('../index.js');
    const mainApiRouter = mainApiRouterModule.default;

    // Initialize Express app and use the dynamically imported router
    app = express(); 
    app.use('/api', mainApiRouter);
  });

  it('should mount transcribeRouter at /transcribe', async () => {
    mockTranscribeRouter.mockClear(); 
    await request(app).get('/api/transcribe/somepath');
    expect(mockTranscribeRouter).toHaveBeenCalled();
  });

  it('should mount spotifyTokensRouter at /store-spotify-tokens', async () => {
    mockSpotifyTokensRouter.mockClear();
    await request(app).post('/api/store-spotify-tokens'); 
    expect(mockSpotifyTokensRouter).toHaveBeenCalled();
  });

  it('should mount syncShowsRouter at /sync-spotify-shows', async () => {
    mockSyncShowsRouter.mockClear();
    await request(app).post('/api/sync-spotify-shows');
    expect(mockSyncShowsRouter).toHaveBeenCalled();
  });

  it('should mount healthRouter at /healthz', async () => {
    mockHealthRouter.mockClear();
    await request(app).get('/api/healthz');
    expect(mockHealthRouter).toHaveBeenCalled();
  });

  it('should return 404 for non-existent routes under /api', async () => {
    const response = await request(app).get('/api/nonexistentroute');
    expect(response.status).toBe(404);
  });
}); 