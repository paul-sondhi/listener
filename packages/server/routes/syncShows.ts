import express, { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database, ApiResponse, SpotifyShow, SpotifyUserShows } from '@listener/shared';

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

// Interface for sync response
interface SyncShowsResponse {
    success: boolean;
    active_count: number;
    inactive_count: number;
}

// Interface for user Spotify tokens
interface UserSpotifyTokens {
    spotify_access_token: string | null;
    spotify_refresh_token: string | null;
    spotify_token_expires_at: string | null;
}

/**
 * Sync Spotify shows endpoint
 * POST /api/sync-spotify-shows
 * Syncs user's Spotify podcast subscriptions with the database
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
    try {
        // Get the authenticated user
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

        const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
        if (error || !user) {
            console.error('User authentication failed:', error?.message);
            res.status(401).json({ 
                success: false, 
                error: 'User authentication failed' 
            } as ApiResponse);
            return;
        }
        
        const userId: string = user.id;

        // Retrieve the user's Spotify tokens from the users table
        const { data: userRow, error: userRowError } = await getSupabaseAdmin()
            .from('users')
            .select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at')
            .eq('id', userId)
            .single();
            
        if (userRowError || !userRow) {
            console.error('Could not retrieve user Spotify tokens:', userRowError?.message);
            res.status(400).json({ 
                success: false, 
                error: 'Could not retrieve user Spotify tokens' 
            } as ApiResponse);
            return;
        }
        
        const userTokens = userRow as UserSpotifyTokens;
        const spotifyAccessToken: string | null = userTokens.spotify_access_token;
        
        if (!spotifyAccessToken) {
            console.error('No Spotify access token found for user');
            res.status(400).json({ 
                success: false, 
                error: 'No Spotify access token found for user' 
            } as ApiResponse);
            return;
        }

        // All database operations related to shows will be wrapped in a try-catch
        try {
            // Call the Spotify API to fetch all podcast subscriptions (with pagination)
            const shows: Array<{ show: SpotifyShow }> = [];
            let nextUrl: string | null = 'https://api.spotify.com/v1/me/shows?limit=50';
            let retries: number = 0;
            const maxRetries: number = 3;
            
            while (nextUrl) {
                try {
                    const response: globalThis.Response = await fetch(nextUrl, {
                        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
                    }
                    
                    const data: unknown = await response.json();
                    const spotifyData = data as SpotifyUserShows;
                    if (Array.isArray(spotifyData.items)) {
                        shows.push(...spotifyData.items);
                    }
                    nextUrl = spotifyData.next || null;
                    
                } catch (error: unknown) {
                    const err = error as Error;
                    if (retries < maxRetries) {
                        retries++;
                        console.warn(`Retrying Spotify API call (${retries}/${maxRetries}) due to error:`, err.message);
                        await new Promise(resolve => setTimeout(resolve, 500 * retries)); // Exponential backoff
                        continue;
                    } else {
                        console.error('Failed to fetch shows from Spotify after retries:', err);
                        res.status(502).json({ 
                            success: false, 
                            error: 'Failed to fetch shows from Spotify' 
                        } as ApiResponse);
                        return;
                    }
                }
            }

            // Upsert each show into podcast_subscriptions
            const now: string = new Date().toISOString();
            const podcastUrls: string[] = [];
            
            for (const showObj of shows) {
                const show: SpotifyShow = showObj.show;
                const podcastUrl: string = `https://open.spotify.com/show/${show.id}`;
                podcastUrls.push(podcastUrl);
                
                const { error: upsertError } = await getSupabaseAdmin()
                    .from('podcast_subscriptions')
                    .upsert([
                        {
                            user_id: userId,
                            podcast_url: podcastUrl,
                            status: 'active',
                            updated_at: now
                        }
                    ], { onConflict: 'user_id,podcast_url' });
                    
                if (upsertError) {
                    console.error('Error upserting podcast subscription:', upsertError.message);
                    throw new Error('Error saving shows to database: Upsert failed for one or more shows.');
                }
            }

            // Fetch all subscriptions and filter inactive in JS
            const { data: allSubs, error: allSubsError } = await getSupabaseAdmin()
                .from('podcast_subscriptions')
                .select('id,podcast_url')
                .eq('user_id', userId);
                
            if (allSubsError) {
                console.error('Error fetching subscriptions:', allSubsError.message);
                throw new Error('Error saving shows to database: Failed to fetch existing subscriptions.');
            }
            
            const subsToInactivate = (allSubs || []).filter(s => !podcastUrls.includes(s.podcast_url));
            const inactiveIds: string[] = subsToInactivate.map(s => s.id);
            console.log('Subscriptions to inactivate IDs:', inactiveIds);

            let inactiveCount: number = 0;
            if (inactiveIds.length > 0) {
                const { error: updateInactiveError } = await getSupabaseAdmin()
                    .from('podcast_subscriptions')
                    .update({ status: 'inactive', updated_at: now })
                    .in('id', inactiveIds);
                    
                if (updateInactiveError) {
                    console.error('Error marking missing shows as inactive:', updateInactiveError.message);
                    throw new Error('Error updating inactive shows: Database operation failed.');
                }
                inactiveCount = inactiveIds.length;
            }

            // If all succeeds, return summary
            const syncResponse: SyncShowsResponse = {
                success: true,
                active_count: podcastUrls.length,
                inactive_count: inactiveCount || 0
            };
            
            res.status(200).json(syncResponse);

        } catch (dbOrSpotifyError: unknown) {
            // Log the error and attempt to return its message.
            const err = dbOrSpotifyError as Error;
            console.error('Error during Spotify sync or DB operations:', err.message, err.stack);
            
            // Default to a generic message if the error somehow has no message property
            const errorMessage: string = err.message || 'A database or Spotify API operation failed.';
            res.status(500).json({ 
                success: false, 
                error: errorMessage 
            } as ApiResponse);
        }
    } catch (error: unknown) {
        // This outer catch now primarily handles errors from auth, token retrieval, or truly unexpected issues.
        const err = error as Error;
        console.error('Unexpected error in /api/sync-spotify-shows:', err.message, err.stack);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        } as ApiResponse);
    }
});

export default router; 