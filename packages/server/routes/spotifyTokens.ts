import express, { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, ApiResponse } from '@listener/shared';
import { storeUserSecret, SpotifyTokenData } from '../lib/encryptedTokenHelpers.js';

// Create router with proper typing
const router: Router = express.Router();

// Initialize Supabase Admin client lazily with proper typing
let supabaseAdmin: SupabaseClient<Database> | null = null;

function getSupabaseAdmin(): SupabaseClient<Database> {
    if (!supabaseAdmin) {
        supabaseAdmin = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }
    return supabaseAdmin;
}

// Interface for the request body
interface StoreTokensRequest {
    access_token: string;
    refresh_token: string;
    expires_at: number; // Unix timestamp in seconds
}

/**
 * Store Spotify tokens endpoint
 * POST /api/store-spotify-tokens
 * Body: { access_token, refresh_token, expires_at }
 * Now uses encrypted column storage for secure token storage
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        // If Supabase environment variables are not set (common in local/unit-test environments)
        // we cannot perform the usual Supabase authentication flow. In these scenarios we
        // treat the request as unauthenticated so that the route responds with a 401 rather
        // than bubbling up an exception which becomes a 500. This keeps our behaviour
        // consistent with production (where an invalid token also yields 401) while allowing
        // tests that purposefully omit these variables to exercise the unauthenticated path.
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            res.status(401).json({
                success: false,
                error: 'User authentication failed'
            } as ApiResponse);
            return;
        }

        // Try to get the token from the cookie, or from the Authorization header
        let token: string | undefined = req.cookies['sb-access-token'] as string;
        
        if (!token && req.headers.authorization?.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            console.error('No access token found in cookie or Authorization header');
            res.status(401).json({ 
                success: false, 
                error: 'Not authenticated' 
            } as ApiResponse);
            return;
        }

        // DEBUG: Log first/last 6 chars of token to help diagnose auth failures (safe to log)
        console.debug(`[STORE_TOKENS] Received JWT: ${token.substring(0, 6)}…${token.substring(token.length - 6)}`);

        // Get the authenticated user
        const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
        if (error || !user) {
            console.error('[STORE_TOKENS] Supabase getUser failed:', error?.message);
            res.status(401).json({ 
                success: false, 
                error: 'User authentication failed' 
            } as ApiResponse);
            return;
        }

        // Parse tokens from request body with proper typing
        const { access_token, refresh_token, expires_at }: StoreTokensRequest = req.body;
        
        if (!access_token || !refresh_token || !expires_at) {
            console.error('Missing one or more required token fields');
            res.status(400).json({ 
                success: false, 
                error: 'Missing token fields' 
            } as ApiResponse);
            return;
        }

        // Prepare token data for encrypted storage
        const tokenData: SpotifyTokenData = {
            access_token,
            refresh_token,
            expires_at, // Already in Unix timestamp format
            token_type: 'Bearer',
            scope: 'user-read-email user-library-read' // Default scopes
        };

        // Store tokens in encrypted storage
        const encryptedResult = await storeUserSecret(user.id, tokenData);
        
        if (!encryptedResult.success) {
            console.error('Failed to store tokens in encrypted storage:', encryptedResult.error);
            // Add more detailed logging for production debugging
            console.error(`ENCRYPTED_TOKEN_ERROR_DETAIL: User ID: ${user.id}, Error: ${encryptedResult.error}, Elapsed: ${encryptedResult.elapsed_ms}ms`);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to store tokens securely' 
            } as ApiResponse);
            return;
        }

        // Update user record to ensure it exists and clear reauth flag
        const { error: upsertError } = await getSupabaseAdmin()
            .from('users')
            .upsert({
                id: user.id,
                email: user.email || '',
                spotify_reauth_required: false,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'id'
            })
            .select();

        if (upsertError) {
            console.error('Error updating user record:', upsertError.message);
            // Don't fail the request since encrypted storage succeeded
            console.warn('Encrypted storage succeeded but user record update failed');
        }

        console.log(`Successfully stored tokens in encrypted storage for user: ${user.email} (${encryptedResult.elapsed_ms}ms)`);
        
        // Success response
        res.status(200).json({ 
            success: true, 
            message: 'Tokens stored securely',
            encrypted_token_latency_ms: encryptedResult.elapsed_ms
        } as ApiResponse);
        
    } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Unexpected error in /api/store-spotify-tokens:', errorMessage);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        } as ApiResponse);
    }
});

export default router; 