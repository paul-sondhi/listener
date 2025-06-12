import express, { Router } from 'express';

// Import all route modules
import transcribeRouter from './transcribe.js';
import spotifyTokensRouter from './spotifyTokens.js';
import syncShowsRouter from './syncShows.js';
import healthRouter from './health.js';
import adminRouter from './admin.js';

// Create router with proper typing
const router: Router = express.Router();

// Mount routes with descriptive comments
router.use('/transcribe', transcribeRouter);           // Audio transcription endpoints
router.use('/store-spotify-tokens', spotifyTokensRouter); // Spotify token management
router.use('/sync-spotify-shows', syncShowsRouter);    // Spotify show synchronization
router.use('/healthz', healthRouter);                 // Health check endpoints
router.use('/admin', adminRouter);                    // Admin and monitoring endpoints

export default router; 