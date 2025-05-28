import express from 'express';
const router = express.Router();

// Import all route modules
import transcribeRouter from './transcribe.js';
import spotifyTokensRouter from './spotifyTokens.js';
import syncShowsRouter from './syncShows.js';
import healthRouter from './health.js';

// Mount routes
router.use('/transcribe', transcribeRouter);
router.use('/store-spotify-tokens', spotifyTokensRouter);
router.use('/sync-spotify-shows', syncShowsRouter);
router.use('/healthz', healthRouter);

export default router; 