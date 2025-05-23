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

    // Skip auth check for login page, API routes, and static assets
    if (req.path === '/login.html' || 
        req.path.startsWith('/api/') || 
        req.path.startsWith('/styles.css') ||
        req.path === '/' ||
        req.path === '/app.html' ||
        !req.path.endsWith('.html')) {
        return next();
    }

    // Try to get the token from the cookie, or from the Authorization header
    let token = req.cookies['sb-access-token'];
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        console.error('No access token found in cookie or Authorization header');
        return res.status(401).json({ error: 'Not authenticated' });
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

// Add body parsing middleware for JSON
app.use(express.json());

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

// Endpoint to store Spotify tokens in the users table
app.post('/api/store-spotify-tokens', async (req, res) => {
    // Try to get the token from the cookie, or from the Authorization header
    let token = req.cookies['sb-access-token'];
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        console.error('No access token found in cookie or Authorization header');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        // Get the authenticated user
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            console.error('User authentication failed:', error);
            return res.status(401).json({ error: 'User authentication failed' });
        }
        // 2. Parse tokens from request body
        const { access_token, refresh_token, expires_at } = req.body;
        if (!access_token || !refresh_token || !expires_at) {
            console.error('Missing one or more required token fields');
            return res.status(400).json({ error: 'Missing token fields' });
        }
        // 3. Update the users table for the authenticated user (by UUID)
        // Convert expires_at (seconds since epoch) to ISO timestamp
        const expiresAtIso = new Date(expires_at * 1000).toISOString();
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                spotify_access_token: access_token,
                spotify_refresh_token: refresh_token,
                spotify_token_expires_at: expiresAtIso
            })
            .eq('id', user.id);
        if (updateError) {
            console.error('Error updating user tokens:', updateError);
            return res.status(500).json({ error: 'Failed to update user tokens' });
        }
        // 4. Success
        return res.status(200).json({ success: true });
    } catch (err) {
        // 5. Log unexpected errors
        console.error('Unexpected error in /api/store-spotify-tokens:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to sync Spotify podcast subscriptions for the authenticated user
app.post('/api/sync-spotify-shows', async (req, res) => {
    // 1. Authenticate the user using the sb-access-token cookie or Authorization header
    let token = req.cookies['sb-access-token'];
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        console.error('No access token found in cookie or Authorization header');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        // Get the authenticated user
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            console.error('User authentication failed:', error);
            return res.status(401).json({ error: 'User authentication failed' });
        }
        const userId = user.id;

        // 2. Retrieve the user's Spotify tokens from the users table
        const { data: userRow, error: userRowError } = await supabaseAdmin
            .from('users')
            .select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at')
            .eq('id', userId)
            .single();
        if (userRowError || !userRow) {
            console.error('Could not retrieve user Spotify tokens:', userRowError);
            return res.status(400).json({ error: 'Could not retrieve user Spotify tokens' });
        }
        const spotifyAccessToken = userRow.spotify_access_token;
        if (!spotifyAccessToken) {
            console.error('No Spotify access token found for user');
            return res.status(400).json({ error: 'No Spotify access token found for user' });
        }

        // 3. Call the Spotify API to fetch all podcast subscriptions (with pagination)
        let shows = [];
        let nextUrl = 'https://api.spotify.com/v1/me/shows?limit=50';
        let retries = 0;
        const maxRetries = 3;
        while (nextUrl) {
            try {
                const response = await fetch(nextUrl, {
                    headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                });
                if (!response.ok) {
                    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (Array.isArray(data.items)) {
                    shows = shows.concat(data.items);
                }
                nextUrl = data.next;
            } catch (err) {
                if (retries < maxRetries) {
                    retries++;
                    console.warn(`Retrying Spotify API call (${retries}/${maxRetries}) due to error:`, err.message);
                    await new Promise(r => setTimeout(r, 500 * retries)); // Exponential backoff
                    continue;
                } else {
                    console.error('Failed to fetch shows from Spotify after retries:', err);
                    return res.status(502).json({ error: 'Failed to fetch shows from Spotify' });
                }
            }
        }

        // 4. Upsert each show into podcast_subscriptions
        const now = new Date().toISOString();
        const podcastUrls = [];
        for (const showObj of shows) {
            const show = showObj.show;
            const podcastUrl = `https://open.spotify.com/show/${show.id}`;
            podcastUrls.push(podcastUrl);
            // Upsert: INSERT ... ON CONFLICT (user_id, podcast_url) DO UPDATE
            const { error: upsertError } = await supabaseAdmin
                .from('podcast_subscriptions')
                .upsert([
                    {
                        user_id: userId,
                        podcast_url: podcastUrl,
                        status: 'active',
                        updated_at: now
                    }
                ], { onConflict: ['user_id', 'podcast_url'] });
            if (upsertError) {
                console.error('Error upserting podcast subscription:', upsertError);
            }
        }

        // 5. Fetch all subscriptions and filter inactive in JS
        const { data: allSubs, error: allSubsError } = await supabaseAdmin
          .from('podcast_subscriptions')
          .select('id,podcast_url')
          .eq('user_id', userId);
        if (allSubsError) {
          console.error('Error fetching subscriptions:', allSubsError);
        }
        // Filter out active URLs
        const subsToInactivate = (allSubs || []).filter(s => !podcastUrls.includes(s.podcast_url));
        const inactiveIds = subsToInactivate.map(s => s.id);
        console.log('Subscriptions to inactivate IDs:', inactiveIds);

        let inactiveCount = 0;
        if (inactiveIds.length > 0) {
            // Update status and use JS count
            const { error: updateInactiveError } = await supabaseAdmin
              .from('podcast_subscriptions')
              .update({ status: 'inactive', updated_at: now })
              .in('id', inactiveIds);
            if (updateInactiveError) {
              console.error('Error marking missing shows as inactive:', updateInactiveError);
            }
            inactiveCount = inactiveIds.length;
        }

        // 6. Return a summary
        return res.status(200).json({
            success: true,
            active_count: podcastUrls.length,
            inactive_count: inactiveCount || 0
        });
    } catch (err) {
        console.error('Unexpected error in /api/sync-spotify-shows:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});