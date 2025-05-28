import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Authentication middleware for protecting routes
 * Skips auth check for login page, API routes, and static assets
 * Verifies the user's token from either cookie or Authorization header
 */
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
            return res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
        
        if (!user) {
            console.log('No user found for token');
            res.clearCookie('sb-access-token');
            return res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
        }
        
        console.log(`Authenticated user: ${user.email}`);
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.clearCookie('sb-access-token');
        return res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    }
};

export default authMiddleware; 