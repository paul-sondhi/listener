import express from 'express';
const router = express.Router();

// Import all route modules
import transcribeRouter from './transcribe.js';
import spotifyTokensRouter from './spotifyTokens.js';
import syncShowsRouter from './syncShows.js';

// Mount routes
router.use('/transcribe', transcribeRouter);
router.use('/store-spotify-tokens', spotifyTokensRouter);
router.use('/sync-spotify-shows', syncShowsRouter);

export default router; 