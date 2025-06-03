import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@listener/shared';

// Extended Request interface to include user information
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    [key: string]: unknown;
  };
}

// Initialize Supabase Admin client with proper typing
const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Authentication middleware for protecting routes
 * Skips auth check for login page, API routes, and static assets
 * Verifies the user's token from either cookie or Authorization header
 */
const authMiddleware = async (
    req: AuthenticatedRequest, 
    res: Response, 
    next: NextFunction
): Promise<void> => {
    try {
        // Skip auth check for login page, API routes, and static assets
        const skipAuthPaths: string[] = [
            '/login.html',
            '/styles.css',
            '/',
            '/app.html'
        ];
        
        const shouldSkipAuth: boolean = 
            skipAuthPaths.includes(req.path) ||
            req.path.startsWith('/api/') ||
            !req.path.endsWith('.html');
            
        if (shouldSkipAuth) {
            return next();
        }

        // Try to get the token from the cookie, or from the Authorization header
        let token: string | undefined = req.cookies['sb-access-token'] as string;
        
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            console.error('No access token found in cookie or Authorization header');
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        // Verify the user's token with Supabase
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error) {
            console.error('Auth error:', error.message);
            res.clearCookie('sb-access-token');
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
            return;
        }
        
        if (!user) {
            console.log('No user found for token');
            res.clearCookie('sb-access-token');
            res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
            return;
        }
        
        // Attach user information to the request object
        req.user = {
            id: user.id,
            email: user.email || '',
            ...user.user_metadata
        };
        
        console.log(`Authenticated user: ${user.email}`);
        next();
        
    } catch (error: unknown) {
        // Enhanced error handling with proper typing
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown authentication error';
        console.error('Auth error:', errorMessage);
        res.clearCookie('sb-access-token');
        res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    }
};

export default authMiddleware;
export type { AuthenticatedRequest }; 