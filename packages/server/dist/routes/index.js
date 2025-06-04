import express from 'express';
// Import all route modules
import transcribeRouter from './transcribe.js';
import spotifyTokensRouter from './spotifyTokens.js';
import syncShowsRouter from './syncShows.js';
import healthRouter from './health.js';
// Import background jobs for manual triggering
import { runJob } from '../services/backgroundJobs.js';
// Create router with proper typing
const router = express.Router();
// Mount routes with descriptive comments
router.use('/transcribe', transcribeRouter); // Audio transcription endpoints
router.use('/store-spotify-tokens', spotifyTokensRouter); // Spotify token management
router.use('/sync-spotify-shows', syncShowsRouter); // Spotify show synchronization
router.use('/healthz', healthRouter); // Health check endpoints
// Manual job trigger endpoints (for testing and emergency use)
router.post('/admin/jobs/vault-cleanup', async (_req, res) => {
    try {
        console.log('ADMIN: Manually triggering vault cleanup job');
        await runJob('vault_cleanup');
        res.status(200).json({
            success: true,
            message: 'Vault cleanup job completed successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('ADMIN: Vault cleanup job failed:', errorMessage);
        res.status(500).json({
            success: false,
            error: `Vault cleanup job failed: ${errorMessage}`
        });
    }
});
router.post('/admin/jobs/key-rotation', async (_req, res) => {
    try {
        console.log('ADMIN: Manually triggering key rotation job');
        await runJob('key_rotation');
        res.status(200).json({
            success: true,
            message: 'Key rotation job completed successfully'
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('ADMIN: Key rotation job failed:', errorMessage);
        res.status(500).json({
            success: false,
            error: `Key rotation job failed: ${errorMessage}`
        });
    }
});
export default router;
