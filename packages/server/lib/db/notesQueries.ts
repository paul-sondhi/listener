/**
 * Database queries for the Episode Notes Worker
 * 
 * These functions handle querying transcripts that need episode notes generated,
 * following the same patterns as the TranscriptWorker but targeting the transcripts table.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../../shared/src/types/supabase.js';

// Type definition for transcript with episode and show info
export interface TranscriptWithEpisode {
  id: string;
  episode_id: string;
  storage_path: string;
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
    };
  };
}

/**
 * Query transcripts that need episode notes generated
 * 
 * Normal mode: Returns transcripts created within lookback window that don't have notes yet
 * L10 mode: Returns the 10 most recent transcripts (regardless of existing notes)
 * 
 * @param supabase - Supabase client instance
 * @param lookbackHours - Hours to look back for new transcripts (ignored in L10 mode)
 * @param last10Mode - If true, return last 10 transcripts; if false, use normal lookback logic
 * @param nowOverride - Optional timestamp for testability
 * @returns Array of transcripts with episode and show information
 */
export async function queryTranscriptsNeedingNotes(
  supabase: SupabaseClient<Database>,
  lookbackHours: number,
  last10Mode: boolean,
  nowOverride?: number // Optional for testability
): Promise<TranscriptWithEpisode[]> {
  const now = nowOverride ?? Date.now();
  const startTime = now;
  
  console.log('DEBUG: Starting transcript notes query', {
    lookbackHours,
    last10Mode,
    lookbackDate: last10Mode ? 'N/A' : new Date(now - lookbackHours * 60 * 60 * 1000).toISOString()
  });

  try {
    // Step 1: Query transcripts based on mode
    let baseQuery = supabase
      .from('transcripts')
      .select(`
        id,
        episode_id,
        storage_path,
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
            rss_url
          )
        )
      `)
      .not('storage_path', 'is', null) // Must have a storage path
      .not('storage_path', 'eq', '') // Storage path must not be empty
      .is('deleted_at', null) // Only active transcripts
      .order('created_at', { ascending: false }); // Most recent first

    // Apply time-based filter only in normal mode
    if (!last10Mode) {
      const cutoffTime = new Date(now - lookbackHours * 60 * 60 * 1000).toISOString();
      baseQuery = baseQuery.gte('created_at', cutoffTime);
    }

    // Limit results - more in L10 mode, reasonable limit in normal mode
    const limit = last10Mode ? 10 : 1000;
    baseQuery = baseQuery.limit(limit);

    const { data: rawTranscripts, error: queryError } = await baseQuery;

    console.log('DEBUG: Transcript query completed', {
      error: !!queryError,
      dataLength: rawTranscripts?.length || 0,
      errorMessage: queryError?.message || 'none'
    });

    if (queryError) {
      throw new Error(`Failed to query transcripts: ${queryError.message}`);
    }

    if (!rawTranscripts || rawTranscripts.length === 0) {
      console.log('DEBUG: No transcripts found in time window');
      return [];
    }

    // Step 2: Filter out transcripts that already have notes (only in normal mode)
    let candidateTranscripts = rawTranscripts;
    
    if (!last10Mode) {
      // Query existing notes to exclude transcripts that already have them
      const transcriptIds = rawTranscripts.map(t => t.id);
      
      const { data: existingNotes, error: notesError } = await supabase
        .from('episode_transcript_notes')
        .select('transcript_id')
        .in('transcript_id', transcriptIds)
        .is('deleted_at', null); // Only active notes

      if (notesError) {
        throw new Error(`Failed to query existing notes: ${notesError.message}`);
      }

      // Create set of transcript IDs that already have notes
      const transcriptsWithNotes = new Set(
        (existingNotes || []).map(n => n.transcript_id)
      );

      // Filter out transcripts that already have notes
      candidateTranscripts = rawTranscripts.filter(transcript => 
        !transcriptsWithNotes.has(transcript.id)
      );

      console.log('DEBUG: Filtered transcripts', {
        totalTranscripts: rawTranscripts.length,
        transcriptsWithNotes: transcriptsWithNotes.size,
        candidatesRemaining: candidateTranscripts.length
      });
    } else {
      console.log('DEBUG: L10 mode - including all transcripts regardless of existing notes');
    }

    const elapsedMs = Date.now() - startTime;
    
    console.log('DEBUG: Query completed successfully', {
      totalCandidates: candidateTranscripts.length,
      elapsedMs,
      mode: last10Mode ? 'L10' : 'normal'
    });

    // Transform to our expected format
    return candidateTranscripts.map((transcript): TranscriptWithEpisode => {
      const episodeJoin: any = transcript.podcast_episodes;
      
      let episode: TranscriptWithEpisode['episode'] | undefined;
      if (Array.isArray(episodeJoin)) {
        if (episodeJoin.length > 0) {
          const ep = episodeJoin[0];
          const showJoin: any = ep.podcast_shows;
          
          let show: { id: string; title: string; rss_url: string } | undefined;
          if (Array.isArray(showJoin) && showJoin.length > 0) {
            show = {
              id: showJoin[0].id,
              title: showJoin[0].title,
              rss_url: showJoin[0].rss_url
            };
          } else if (showJoin && typeof showJoin === 'object') {
            show = {
              id: showJoin.id,
              title: showJoin.title,
              rss_url: showJoin.rss_url
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
        
        let show: { id: string; title: string; rss_url: string } | undefined;
        if (Array.isArray(showJoin) && showJoin.length > 0) {
          show = {
            id: showJoin[0].id,
            title: showJoin[0].title,
            rss_url: showJoin[0].rss_url
          };
        } else if (showJoin && typeof showJoin === 'object') {
          show = {
            id: showJoin.id,
            title: showJoin.title,
            rss_url: showJoin.rss_url
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
        id: transcript.id,
        episode_id: transcript.episode_id,
        storage_path: transcript.storage_path,
        created_at: transcript.created_at,
        episode
      };
    });

  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error('DEBUG: Query failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsedMs
    });
    throw error;
  }
}

/**
 * Delete existing notes for the last N transcripts (used in L10 mode)
 * This ensures we can overwrite existing notes when testing
 * 
 * @param supabase - Supabase client instance
 * @param transcriptIds - Array of transcript IDs to clear notes for
 */
export async function clearExistingNotesForTranscripts(
  supabase: SupabaseClient<Database>,
  transcriptIds: string[]
): Promise<void> {
  if (transcriptIds.length === 0) {
    return;
  }

  console.log('DEBUG: Clearing existing notes for transcripts', {
    transcriptCount: transcriptIds.length,
    transcriptIds: transcriptIds.slice(0, 3) // Log first 3 for debugging
  });

  // Soft delete existing notes by setting deleted_at timestamp
  const { error } = await supabase
    .from('episode_transcript_notes')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('transcript_id', transcriptIds)
    .is('deleted_at', null); // Only update active notes

  if (error) {
    throw new Error(`Failed to clear existing notes: ${error.message}`);
  }

  console.log('DEBUG: Successfully cleared existing notes');
} 