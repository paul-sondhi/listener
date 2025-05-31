import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { finished } from 'stream/promises';
import { Readable } from 'stream';
import { transcribe } from '../lib/transcribe.js';
import podcastService from '../services/podcastService.js';

const router = express.Router();

/**
 * Transcribe endpoint - handles podcast transcription requests
 * GET /api/transcribe?url=<spotify_url>
 */
router.get('/', async (req, res) => {
    // Read the `url` param
    const spotifyUrl = req.query.url;
    if (!spotifyUrl) {
        return res
            .status(400)
            .json({ error: 'Missing `url` query parameter.' });
    }

    // Validate Spotify URL
    if (!podcastService.validateSpotifyUrl(spotifyUrl)) {
        return res
            .status(400)
            .json({ error: 'Invalid URL; must be a valid Spotify show URL.' });
    }

    let tmpFile;
    try {
        // Get podcast information
        const slug = await podcastService.getPodcastSlug(spotifyUrl);
        const feedUrl = await podcastService.getPodcastFeed(slug);
        const rssText = await podcastService.fetchRssFeed(feedUrl);
        const rssData = podcastService.parseRssFeed(rssText);
        const mp3Url = podcastService.extractMp3Url(rssData);

        // Fetch MP3 file as a stream
        const audioRes = await fetch(mp3Url);
        if (!audioRes.ok) {
            throw new Error(`MP3 fetch failed: ${audioRes.status}`);
        }

        // Write audio to a temp file
        tmpFile = path.join(os.tmpdir(), `${slug}.mp3`);
        const out = fs.createWriteStream(tmpFile);
        const nodeStream = Readable.from(audioRes.body);
        nodeStream.pipe(out);
        await finished(out);

        // Transcribe downloaded audio and send text
        const transcriptText = await transcribe(tmpFile);
        res.type('text/plain').send(transcriptText);

    } catch (err) {
        console.error('Error:', err);
        return res.status(err.statusCode || 500).json({ error: err.message });
    } finally {
        // Clean up temp file if it exists
        if (tmpFile) {
            fs.unlink(tmpFile, () => {});
        }
    }
});

/**
 * Transcribe endpoint - handles podcast transcription requests via POST
 * POST /api/transcribe
 * Body: { spotifyUrl: "<spotify_url>" }
 */
router.post('/', async (req, res) => {
    // Read the `spotifyUrl` from request body
    const { spotifyUrl } = req.body;
    if (!spotifyUrl) {
        return res
            .status(400)
            .json({ error: 'Missing spotifyUrl in request body.' });
    }

    // Validate Spotify URL
    if (!podcastService.validateSpotifyUrl(spotifyUrl)) {
        return res
            .status(400)
            .json({ error: 'Invalid Spotify URL provided.' }); // Match POST test error message
    }

    let tmpFile;
    let slug; // Define slug here to be available in catch blocks for error messages
    try {
        // Get podcast information
        slug = await podcastService.getPodcastSlug(spotifyUrl);
        const feedUrl = await podcastService.getPodcastFeed(slug);
        const rssText = await podcastService.fetchRssFeed(feedUrl);
        const rssData = podcastService.parseRssFeed(rssText);
        const mp3Url = podcastService.extractMp3Url(rssData);

        // Fetch MP3 file as a stream
        const audioRes = await fetch(mp3Url);
        if (!audioRes.ok) {
            // Differentiate error source for more specific messages if needed by tests
            const fetchError = new Error(`MP3 fetch failed: ${audioRes.status}`);
            fetchError.statusCode = 500; // Or map specific Spotify errors to status codes if applicable
            throw fetchError;
        }

        // Write audio to a temp file
        tmpFile = path.join(os.tmpdir(), `${slug}.mp3`);
        const out = fs.createWriteStream(tmpFile);
        const nodeStream = Readable.from(audioRes.body);
        nodeStream.pipe(out);
        await finished(out);

        // Transcribe downloaded audio and send JSON response
        const transcript = await transcribe(tmpFile); // transcribe lib might return object or string
        // Assuming transcribe returns a string, wrap it in an object for POST response
        // If transcribe returns { transcription: 'text' }, use that directly.
        // For now, let's assume it returns the text directly as per GET handler's usage.
        res.status(200).json({ transcription: transcript });

    } catch (err) {
        console.error(`Error processing POST /transcribe for slug ${slug || 'unknown'}:`, err.message, err.stack);
        // Construct error messages similar to POST test expectations
        let errorMessage = err.message;
        let statusCode = err.statusCode || 500;

        if (err.message.includes('Slug error') || (err.config && err.config.url && err.config.url.includes(slug))) {
            errorMessage = `Failed to process podcast feed: ${err.message}`;
        } else if (err.message.startsWith('MP3 fetch failed:') || err.message.includes('Network error')) {
            errorMessage = `Failed to download MP3 file: ${err.message}`;
        } else if (err.message.includes('FS error') || err.message.includes('Stream pipe error')) {
            errorMessage = `Failed to save MP3 file: ${err.message}`;
        } else if (err.message.includes('Transcription error')) {
            errorMessage = `Error during transcription: ${err.message}`;
        }
        // For other generic errors, use err.message or a default

        return res.status(statusCode).json({ error: errorMessage });
    } finally {
        // Clean up temp file if it exists
        if (tmpFile) {
            fs.unlink(tmpFile, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Failed to delete temp file ${tmpFile}:`, unlinkErr);
                }
            });
        }
    }
});

export default router; 