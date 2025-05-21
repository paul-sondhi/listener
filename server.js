require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { finished } = require('stream/promises');
const { Readable } = require('stream');
const { createClient } = require('@supabase/supabase-js');
const { transcribe } = require('./lib/transcribe');
const podcastService = require('./services/podcastService');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cookieParser());

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Auth middleware
const authMiddleware = async (req, res, next) => {
    // Log the incoming request path
    console.log(`Processing request for path: ${req.path}`);

    // Skip auth check for login page, API routes, and static assets
    if (req.path === '/login.html' || 
        req.path.startsWith('/api/') || 
        req.path.startsWith('/styles.css') ||
        req.path === '/' ||
        req.path === '/app.html' ||
        !req.path.endsWith('.html')) {
        console.log(`Skipping auth check for path: ${req.path}`);
        return next();
    }

    const token = req.cookies['sb-access-token'];
    
    if (!token) {
        console.log('No token found, serving login page');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error) {
            console.error('Auth error:', error);
            res.clearCookie('sb-access-token');
            return res.sendFile(path.join(__dirname, 'public', 'login.html'));
        }
        
        if (!user) {
            console.log('No user found for token');
            res.clearCookie('sb-access-token');
            return res.sendFile(path.join(__dirname, 'public', 'login.html'));
        }
        
        console.log(`Authenticated user: ${user.email}`);
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.clearCookie('sb-access-token');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
};

// Apply middleware
app.use(authMiddleware);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route redirects to login
app.get('/', (req, res) => {
    // If we have a valid token, redirect to app.html
    if (req.cookies['sb-access-token']) {
        return res.redirect('/app.html');
    }
    // Otherwise, serve login.html directly instead of redirecting
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle app.html route specifically
app.get('/app.html', async (req, res) => {
    const token = req.cookies['sb-access-token'];
    
    if (!token) {
        console.log('No token found for app.html, serving login page');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }

    try {
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error || !user) {
            console.log('Invalid token for app.html, serving login page');
            res.clearCookie('sb-access-token');
            return res.sendFile(path.join(__dirname, 'public', 'login.html'));
        }
        
        // If we have a valid user, serve app.html
        res.sendFile(path.join(__dirname, 'public', 'app.html'));
    } catch (error) {
        console.error('Error checking auth for app.html:', error);
        res.clearCookie('sb-access-token');
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/api/transcribe', async (req, res) => {
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
      const tmpFile = path.join(os.tmpdir(), `${slug}.mp3`);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});