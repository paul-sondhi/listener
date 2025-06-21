import { EpisodeWithShow } from '../../../shared/src/types/supabase.js';
import { createLogger, Logger } from '../logger.js';
import { TaddyFreeClient, TranscriptResult } from '../clients/taddyFreeClient.js';

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
  private taddyClient: TaddyFreeClient | null;
  private podcastIdCache: Map<string, string> = new Map(); // In-memory cache for podcast IDs

  constructor() {
    this.logger = createLogger();
    
    // Initialize Taddy Free client if API key is available
    const taddyApiKey = process.env.TADDY_API_KEY;
    if (taddyApiKey) {
      this.taddyClient = new TaddyFreeClient({ apiKey: taddyApiKey });
      this.logger.debug('system', 'Taddy Free client initialized', {
        metadata: { hasApiKey: true }
      });
    } else {
      this.logger.warn('system', 'TADDY_API_KEY not found - Taddy Free lookup disabled', {
        metadata: { hasApiKey: false }
      });
             // No client available - will skip Taddy lookup
       this.taddyClient = null;
    }
  }
  /**
   * Retrieve transcript for an episode by ID
   * 
   * @param episodeId - UUID of the episode
   * @returns Promise resolving to TranscriptResult discriminated union
   */
  async getTranscript(episodeId: string): Promise<TranscriptResult>;

  /**
   * Retrieve transcript for an episode object
   * 
   * @param episode - Full episode row from database with show info
   * @returns Promise resolving to TranscriptResult discriminated union
   */
  async getTranscript(episode: EpisodeWithShow): Promise<TranscriptResult>;

  /**
   * Implementation signature - handles both overloads
   * @param arg - Either episode ID string or episode row object
   * @returns Promise resolving to TranscriptResult discriminated union
   */
  async getTranscript(arg: string | EpisodeWithShow): Promise<TranscriptResult> {
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
      // Short-circuit: return error for ineligible episodes
      return { kind: 'error', message: 'Episode is not eligible for transcript processing' };
    }
    
    // Try Taddy Free lookup if client is available
    if (this.taddyClient && episode.show?.rss_url && episode.guid) {
      this.logger.debug('system', 'Attempting Taddy Free transcript lookup', {
        metadata: { 
          episode_id: episode.id,
          rss_url: episode.show.rss_url,
          guid: episode.guid
        }
      });
      
      try {
        const result = await this.taddyClient.fetchTranscript(episode.show.rss_url, episode.guid);
        
        this.logger.info('system', 'Taddy Free lookup completed', {
          metadata: { 
            episode_id: episode.id,
            result_kind: result.kind,
            has_text: 'text' in result && result.text.length > 0
          }
        });
        
        return result;
      } catch (error) {
        this.logger.error('system', 'Taddy Free lookup failed', {
          metadata: { 
            episode_id: episode.id,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        
        return { 
          kind: 'error', 
          message: `Taddy lookup failed: ${error instanceof Error ? error.message : String(error)}` 
        };
      }
    }
    
    // No Taddy client available or missing required data
    this.logger.debug('system', 'Taddy Free lookup skipped', {
      metadata: { 
        episode_id: episode.id,
        has_client: !!this.taddyClient,
        has_rss_url: !!episode.show?.rss_url,
        has_guid: !!episode.guid,
        reason: !this.taddyClient ? 'no_client' : !episode.show?.rss_url ? 'no_rss_url' : 'no_guid'
      }
    });
    
    return { kind: 'not_found' };
  }

  /**
   * Private helper to check if an episode is eligible for transcript processing
   * @param episode - The episode row with show info to check
   * @returns true if episode is eligible, false otherwise
   * @private
   */
  private isEpisodeEligible(episode: EpisodeWithShow): boolean {
    // Episode is ineligible if it has been deleted
    if (episode.deleted_at) {
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
      deleted_at: undefined, // Not deleted
      // Show information needed for transcript service logic
      show: {
        rss_url: 'https://example.com/feed.xml', // Stubbed RSS URL
      }
    };
  }
} 