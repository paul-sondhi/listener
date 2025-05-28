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
            .json({ error: 'Invalid URL; must be a Spotify podcast show title.' });
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

export default router; 