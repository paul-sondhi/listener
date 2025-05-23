const express = require('express');
const router = express.Router();

// Import all route modules
const transcribeRouter = require('./transcribe');
const spotifyTokensRouter = require('./spotifyTokens');
const syncShowsRouter = require('./syncShows');

// Mount routes
router.use('/transcribe', transcribeRouter);
router.use('/store-spotify-tokens', spotifyTokensRouter);
router.use('/sync-spotify-shows', syncShowsRouter);

module.exports = router; 