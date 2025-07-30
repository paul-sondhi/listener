/**
 * Database queries for the Newsletter Edition Worker
 * 
 * These functions handle querying users with active subscriptions and their episode notes
 * that need to be included in newsletter editions.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';
import { debugDatabase } from '../debugLogger';

// Type definition for episode notes with episode and show info
export interface EpisodeNoteWithEpisode {
  id: string;
  episode_id: string;
  notes: string;
  status: string;
  created_at: string;
  episode?: {
    id: string;
    show_id: string;
    title?: string;
    description?: string;
    pub_date?: string;
    podcast_shows?: {
      id: string;
      title: string;
      rss_url: string;
      spotify_url?: string;
    };
  };
}

// Type definition for user with their subscriptions
export interface UserWithSubscriptions {
  id: string;
  email: string;
  subscriptions: {
    id: string;
    show_id: string;
    status: string;
    podcast_shows?: {
      id: string;
      title: string;
      rss_url: string;
      spotify_url?: string;
    };
  }[];
}

/**
 * Query users with active podcast subscriptions
 * 
 * @param supabase - Supabase client instance
 * @returns Array of users with their active subscriptions
 */
export async function queryUsersWithActiveSubscriptions(
  supabase: SupabaseClient<Database>
): Promise<UserWithSubscriptions[]> {
  debugDatabase('Starting user subscription query');

  try {
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        user_podcast_subscriptions!inner (
          id,
          show_id,
          status,
          podcast_shows!inner (
            id,
            title,
            rss_url,
            spotify_url
          )
        )
      `)
      .eq('user_podcast_subscriptions.status', 'active')
      .is('user_podcast_subscriptions.deleted_at', null)
      .order('id', { ascending: true });

    debugDatabase('User subscription query completed', {
      error: !!queryError,
      dataLength: users?.length || 0,
      errorMessage: queryError?.message || 'none'
    });

    if (queryError) {
      throw new Error(`Failed to query users with subscriptions: ${queryError.message}`);
    }

    if (!users || users.length === 0) {
      debugDatabase('No users with active subscriptions found');
      return [];
    }

    // Transform to our expected format
    return users.map((user): UserWithSubscriptions => {
      const subscriptionsJoin: any = user.user_podcast_subscriptions;
      
      let subscriptions: UserWithSubscriptions['subscriptions'] = [];
      if (Array.isArray(subscriptionsJoin)) {
        subscriptions = subscriptionsJoin.map((sub: any) => {
          const showJoin: any = sub.podcast_shows;
          
          let show: { id: string; title: string; rss_url: string; spotify_url: string } | undefined;
          if (Array.isArray(showJoin) && showJoin.length > 0) {
            show = {
              id: showJoin[0].id,
              title: showJoin[0].title,
              rss_url: showJoin[0].rss_url,
              spotify_url: showJoin[0].spotify_url
            };
          } else if (showJoin && typeof showJoin === 'object') {
            show = {
              id: showJoin.id,
              title: showJoin.title,
              rss_url: showJoin.rss_url,
              spotify_url: showJoin.spotify_url
            };
          }
          
          return {
            id: sub.id,
            show_id: sub.show_id,
            status: sub.status,
            podcast_shows: show
          };
        });
      } else if (subscriptionsJoin && typeof subscriptionsJoin === 'object') {
        const showJoin: any = subscriptionsJoin.podcast_shows;
        
        let show: { id: string; title: string; rss_url: string; spotify_url: string } | undefined;
        if (Array.isArray(showJoin) && showJoin.length > 0) {
          show = {
            id: showJoin[0].id,
            title: showJoin[0].title,
            rss_url: showJoin[0].rss_url,
            spotify_url: showJoin[0].spotify_url
          };
        } else if (showJoin && typeof showJoin === 'object') {
          show = {
            id: showJoin.id,
            title: showJoin.title,
            rss_url: showJoin.rss_url,
            spotify_url: showJoin.spotify_url
          };
        }
        
        subscriptions = [{
          id: subscriptionsJoin.id,
          show_id: subscriptionsJoin.show_id,
          status: subscriptionsJoin.status,
          podcast_shows: show
        }];
      }

      return {
        id: user.id,
        email: user.email || '',
        subscriptions
      };
    });

  } catch (error) {
    console.error('ERROR: Failed to query users with subscriptions:', error);
    throw error;
  }
}

/**
 * Query episode notes for a specific user within the lookback window
 * 
 * @param supabase - Supabase client instance
 * @param userId - User ID to query notes for
 * @param lookbackHours - Hours to look back for episode notes
 * @param nowOverride - Optional timestamp for testability
 * @returns Array of episode notes with episode and show information
 */
export async function queryEpisodeNotesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  lookbackHours: number,
  nowOverride?: number // Optional for testability
): Promise<EpisodeNoteWithEpisode[]> {
  const now = nowOverride ?? Date.now();
  const startTime = now;
  
  debugDatabase('Starting episode notes query for user', {
    userId,
    lookbackHours,
    lookbackDate: new Date(now - lookbackHours * 60 * 60 * 1000).toISOString()
  });

  try {
    // Step 1: Get the user's subscribed show IDs
    const { data: userSubscriptions, error: subscriptionError } = await supabase
      .from('user_podcast_subscriptions')
      .select('show_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (subscriptionError) {
      throw new Error(`Failed to query user subscriptions: ${subscriptionError.message}`);
    }

    if (!userSubscriptions || userSubscriptions.length === 0) {
      debugDatabase('User has no active subscriptions');
      return [];
    }

    const subscribedShowIds = userSubscriptions.map(sub => sub.show_id);

    // Step 2: Query episode notes for episodes from subscribed shows
    const cutoffTime = new Date(now - lookbackHours * 60 * 60 * 1000).toISOString();
    
    const { data: episodeNotes, error: notesError } = await supabase
      .from('episode_transcript_notes')
      .select(`
        id,
        episode_id,
        notes,
        status,
        created_at,
        podcast_episodes!inner (
          id,
          show_id,
          title,
          description,
          pub_date,
          podcast_shows!inner (
            id,
            title,
            rss_url,
            spotify_url
          )
        )
      `)
      .in('podcast_episodes.show_id', subscribedShowIds)
      .gte('created_at', cutoffTime)
      .eq('status', 'done')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    debugDatabase('Episode notes query completed', {
      error: !!notesError,
      dataLength: episodeNotes?.length || 0,
      errorMessage: notesError?.message || 'none',
      subscribedShowCount: subscribedShowIds.length,
      cutoffTime
    });

    if (notesError) {
      throw new Error(`Failed to query episode notes: ${notesError.message}`);
    }

    if (!episodeNotes || episodeNotes.length === 0) {
      debugDatabase('No episode notes found for user in time window');
      return [];
    }

    const elapsedMs = Date.now() - startTime;
    
    debugDatabase('Episode notes query completed successfully', {
      totalNotes: episodeNotes.length,
      elapsedMs
    });

    // Transform to our expected format
    return episodeNotes.map((note): EpisodeNoteWithEpisode => {
      const episodeJoin: any = note.podcast_episodes;
      
      let episode: EpisodeNoteWithEpisode['episode'] | undefined;
      if (Array.isArray(episodeJoin)) {
        if (episodeJoin.length > 0) {
          const ep = episodeJoin[0];
          const showJoin: any = ep.podcast_shows;
          
          let show: { id: string; title: string; rss_url: string; spotify_url: string } | undefined;
          if (Array.isArray(showJoin) && showJoin.length > 0) {
            show = {
              id: showJoin[0].id,
              title: showJoin[0].title,
              rss_url: showJoin[0].rss_url,
              spotify_url: showJoin[0].spotify_url
            };
          } else if (showJoin && typeof showJoin === 'object') {
            show = {
              id: showJoin.id,
              title: showJoin.title,
              rss_url: showJoin.rss_url,
              spotify_url: showJoin.spotify_url
            };
          }
          
          episode = {
            id: ep.id,
            show_id: ep.show_id,
            title: ep.title,
            description: ep.description,
            pub_date: ep.pub_date,
            podcast_shows: show
          };
        }
      } else if (episodeJoin && typeof episodeJoin === 'object') {
        const showJoin: any = episodeJoin.podcast_shows;
        
        let show: { id: string; title: string; rss_url: string; spotify_url: string } | undefined;
        if (Array.isArray(showJoin) && showJoin.length > 0) {
          show = {
            id: showJoin[0].id,
            title: showJoin[0].title,
            rss_url: showJoin[0].rss_url,
            spotify_url: showJoin[0].spotify_url
          };
        } else if (showJoin && typeof showJoin === 'object') {
          show = {
            id: showJoin.id,
            title: showJoin.title,
            rss_url: showJoin.rss_url,
            spotify_url: showJoin.spotify_url
          };
        }
        
        episode = {
          id: episodeJoin.id,
          show_id: episodeJoin.show_id,
          title: episodeJoin.title,
          description: episodeJoin.description,
          pub_date: episodeJoin.pub_date,
          podcast_shows: show
        };
      }

      return {
        id: note.id,
        episode_id: note.episode_id,
        notes: note.notes || '',
        status: note.status,
        created_at: note.created_at,
        episode
      };
    });

  } catch (error) {
    console.error('ERROR: Failed to query episode notes for user:', error);
    throw error;
  }
}

/**
 * Query the last N newsletter editions for L10 test mode
 * 
 * @param supabase - Supabase client instance
 * @param count - Number of editions to query (default: 3)
 * @returns Array of newsletter edition IDs to overwrite
 */
export async function queryLastNewsletterEditions(
  supabase: SupabaseClient<Database>,
  count: number = 3
): Promise<string[]> {
  debugDatabase('Starting L10 newsletter editions query');

  try {
    const { data: editions, error: queryError } = await supabase
      .from('newsletter_editions')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(count);

    debugDatabase('L10 newsletter editions query completed', {
      error: !!queryError,
      dataLength: editions?.length || 0,
      errorMessage: queryError?.message || 'none'
    });

    if (queryError) {
      throw new Error(`Failed to query last ${count} newsletter editions: ${queryError.message}`);
    }

    if (!editions || editions.length === 0) {
      debugDatabase('No newsletter editions found for L10 mode');
      return [];
    }

    const editionIds = editions.map(edition => edition.id);
    
    debugDatabase('L10 mode - found editions to overwrite', {
      count: editionIds.length,
      editionIds
    });

    return editionIds;

  } catch (error) {
    console.error(`ERROR: Failed to query last ${count} newsletter editions:`, error);
    throw error;
  }
}

/**
 * Query the last N newsletter editions with full details for L10 test mode updates
 * 
 * @param supabase - Supabase client instance
 * @param count - Number of editions to query (default: 3)
 * @returns Array of newsletter editions with user_id and edition_date for updating
 */
export async function queryLastNewsletterEditionsForUpdate(
  supabase: SupabaseClient<Database>,
  count: number = 3
): Promise<Array<{ id: string; user_id: string; edition_date: string; user_email: string }>> {
  debugDatabase('Starting L10 newsletter editions query for updates');

  try {
    const { data: editions, error: queryError } = await supabase
      .from('newsletter_editions')
      .select('id, user_id, edition_date, user_email')
      .order('created_at', { ascending: false })
      .limit(count);

    debugDatabase('L10 newsletter editions query for updates completed', {
      error: !!queryError,
      dataLength: editions?.length || 0,
      errorMessage: queryError?.message || 'none'
    });

    if (queryError) {
      throw new Error(`Failed to query last ${count} newsletter editions for updates: ${queryError.message}`);
    }

    if (!editions || editions.length === 0) {
      debugDatabase('No newsletter editions found for L10 mode updates');
      return [];
    }

    debugDatabase('L10 mode - found editions to update', {
      count: editions.length,
      editions: editions.map(e => ({ id: e.id, user_id: e.user_id, edition_date: e.edition_date, user_email: e.user_email }))
    });

    return editions;

  } catch (error) {
    console.error(`ERROR: Failed to query last ${count} newsletter editions for updates:`, error);
    throw error;
  }
}

// Backwards compatibility exports
export const queryLast3NewsletterEditions = queryLastNewsletterEditions;
export const queryLast3NewsletterEditionsForUpdate = queryLastNewsletterEditionsForUpdate;

/**
 * Query newsletter editions for subject line test mode
 * Returns editions with their HTML content for subject line generation or regeneration
 * Note: This will return ALL editions with content, allowing overwriting of existing subject lines
 * 
 * @param supabase - Initialized Supabase client
 * @param count - Number of editions to fetch
 * @returns Array of editions for subject line testing
 */
export async function queryNewsletterEditionsForSubjectLineTest(
  supabase: SupabaseClient<Database>,
  count: number = 5
): Promise<Array<{ 
  id: string; 
  user_id: string; 
  edition_date: string; 
  user_email: string; 
  content: string;
  subject_line: string | null;
}>> {
  debugDatabase('Starting subject line test editions query');
  
  try {
    const { data: editions, error: queryError } = await supabase
      .from('newsletter_editions')
      .select('id, user_id, edition_date, user_email, content, subject_line')
      .not('content', 'is', null)
      .eq('status', 'generated')
      .order('created_at', { ascending: false })
      .limit(count);

    debugDatabase('Subject line test editions query completed', {
      error: !!queryError,
      dataLength: editions?.length || 0,
      errorMessage: queryError?.message || 'none'
    });

    if (queryError) {
      throw new Error(`Failed to query editions for subject line test: ${queryError.message}`);
    }

    if (!editions || editions.length === 0) {
      debugDatabase('No editions found for subject line testing');
      return [];
    }

    return editions;
  } catch (error) {
    debugDatabase('Failed to query editions for subject line test', { error });
    throw error;
  }
}