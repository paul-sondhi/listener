import { DatabaseRow, EpisodeWithShow } from '../../../shared/src/types/supabase.js';
import { Logger } from '../logger.js';

// Use the database row type for podcast episodes
type PodcastEpisodeRow = DatabaseRow<'podcast_episodes'>;

/**
 * TranscriptService - Central service for all transcript-related operations
 * 
 * This is currently a stub implementation that always returns null.
 * Future tickets will add provider integrations in this priority order:
 * 
 * @todo Ticket #4: Add Taddy Free lookup integration (GraphQL, no cost)
 * @todo Ticket #6: Add Taddy Business pregenerated retrieval (existing transcripts)
 * @todo Ticket #8: Add on-demand Taddy jobs (async queue, costs credits)
 * @todo Ticket #9: Add fallback ASR providers (Deepgram/Rev AI, direct cost)
 * @todo Ticket #7: Add cost tracking and provenance metadata
 */
export class TranscriptService {
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
  }
  /**
   * Retrieve transcript for an episode by ID
   * Currently returns null (stub implementation)
   * 
   * @param episodeId - UUID of the episode
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(episodeId: string): Promise<null>;

  /**
   * Retrieve transcript for an episode object
   * Currently returns null (stub implementation)
   * 
   * @param episode - Full episode row from database with show info
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(episode: EpisodeWithShow): Promise<null>;

  /**
   * Implementation signature - handles both overloads
   * @param arg - Either episode ID string or episode row object
   * @returns Promise resolving to null (stub)
   */
  async getTranscript(arg: string | EpisodeWithShow): Promise<null> {
    // If caller passed an episode ID string, we need to fetch the episode row first
    if (typeof arg === 'string') {
      const episodeId = arg;
      
      // TODO: Replace with actual database fetch
      // For now, create a stubbed episode row to delegate to overload (2)
      const stubbedEpisode = await this.fetchEpisodeById(episodeId);
      
      // Delegate to the episode object overload
      return this.getTranscript(stubbedEpisode);
    }
    
    // If we reach here, arg is a PodcastEpisodeRow object
    const episode = arg;
    
    // Check if episode is eligible for transcript processing
    if (!this.isEpisodeEligible(episode)) {
      // Short-circuit: return null for ineligible episodes
      return null;
    }
    
    // STUB BEHAVIOR: Always return null for now (for eligible episodes)
    // TODO: Future provider logic will be implemented here in the following order:
    // 1. Check if transcript already exists in database
    // 2. Try Taddy Free lookup (no cost)
    // 3. Try Taddy Business pregenerated retrieval (if available)
    // 4. Fall back to on-demand ASR providers (Deepgram/Rev AI)
    // 5. Store result in database with cost/provenance metadata
    return null;
  }

  /**
   * Private helper to check if an episode is eligible for transcript processing
   * @param episode - The episode row with show info to check
   * @returns true if episode is eligible, false otherwise
   * @private
   */
  private isEpisodeEligible(episode: EpisodeWithShow): boolean {
    // Episode is ineligible if it has been deleted
    if (episode.deleted_at !== null) {
      this.logger.debug('system', 'Episode ineligible for transcript processing: deleted', {
        metadata: { 
          episode_id: episode.id, 
          deleted_at: episode.deleted_at,
          reason: 'episode_deleted'
        }
      });
      return false;
    }

    // Episode is ineligible if it doesn't have an RSS URL from its show
    if (!episode.show?.rss_url || episode.show.rss_url.trim() === '') {
      this.logger.debug('system', 'Episode ineligible for transcript processing: missing RSS URL', {
        metadata: { 
          episode_id: episode.id, 
          show_id: episode.show_id,
          rss_url: episode.show?.rss_url,
          reason: 'missing_rss_url'
        }
      });
      return false;
    }

    // Episode is eligible if it passes all checks
    this.logger.debug('system', 'Episode eligible for transcript processing', {
      metadata: { 
        episode_id: episode.id,
        show_id: episode.show_id,
        rss_url: episode.show?.rss_url,
        status: 'eligible'
      }
    });
    return true;
  }

  /**
   * Private helper to fetch episode by ID with show info (stubbed implementation)
   * @param episodeId - UUID of the episode to fetch
   * @returns Promise resolving to a stubbed episode row with show info
   * @private
   */
  private async fetchEpisodeById(episodeId: string): Promise<EpisodeWithShow> {
    // TODO: Replace with actual Supabase database query that joins with podcast_shows
    // For now, return a minimal stubbed episode object with all required fields
    return {
      id: episodeId,
      show_id: 'stub-show-id',
      guid: 'stub-guid-' + episodeId,
      episode_url: 'https://example.com/audio.mp3',
      title: 'Stubbed Episode Title',
      description: 'Stubbed episode description',
      pub_date: new Date().toISOString(),
      duration_sec: 3600, // 1 hour in seconds
      created_at: new Date().toISOString(),
      deleted_at: null, // Not deleted
      // Show information needed for transcript service logic
      show: {
        rss_url: 'https://example.com/feed.xml', // Stubbed RSS URL
      }
    };
  }
} 