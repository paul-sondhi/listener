import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase Admin client lazily
let supabaseAdmin = null;

function getSupabaseAdmin() {
    if (!supabaseAdmin) {
        supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return supabaseAdmin;
}

/**
 * Store Spotify tokens endpoint
 * POST /api/store-spotify-tokens
 * Body: { access_token, refresh_token, expires_at }
 */
router.post('/', async (req, res) => {
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
        const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
        if (error || !user) {
            console.error('User authentication failed:', error);
            return res.status(401).json({ error: 'User authentication failed' });
        }

        // Parse tokens from request body
        const { access_token, refresh_token, expires_at } = req.body;
        if (!access_token || !refresh_token || !expires_at) {
            console.error('Missing one or more required token fields');
            return res.status(400).json({ error: 'Missing token fields' });
        }

        // Update the users table for the authenticated user (by UUID)
        // Convert expires_at (seconds since epoch) to ISO timestamp
        const expiresAtIso = new Date(expires_at * 1000).toISOString();
        const { error: updateError } = await getSupabaseAdmin()
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

        // Success
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Unexpected error in /api/store-spotify-tokens:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router; 