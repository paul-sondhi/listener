const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Sync Spotify shows endpoint
 * POST /api/sync-spotify-shows
 * Syncs user's Spotify podcast subscriptions with the database
 */
router.post('/', async (req, res) => {
    // Get the authenticated user
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
        if (error || !user) {
            console.error('User authentication failed:', error);
            return res.status(401).json({ error: 'User authentication failed' });
        }
        const userId = user.id;

        // Retrieve the user's Spotify tokens from the users table
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

        // Call the Spotify API to fetch all podcast subscriptions (with pagination)
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

        // Upsert each show into podcast_subscriptions
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

        // Fetch all subscriptions and filter inactive in JS
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

        // Return a summary
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

module.exports = router; 