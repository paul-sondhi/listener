import { EpisodeWithShow, TranscriptResult, ExtendedTranscriptResult } from '../../../shared/src/types/index.js';
import { createLogger, Logger } from '../logger.js';
import { TaddyFreeClient } from '../clients/taddyFreeClient.js';
import { TaddyBusinessClient, BusinessTranscriptResult } from '../clients/taddyBusinessClient.js';
import { getTranscriptWorkerConfig } from '../../config/transcriptWorkerConfig.js';

/**
 * TranscriptService - Central service for all transcript-related operations
 * 
 * This service routes transcript requests to the appropriate Taddy client based on
 * the TRANSCRIPT_TIER environment variable:
 * - 'free': Uses TaddyFreeClient for read-only access to existing transcripts
 * - 'business': Uses TaddyBusinessClient for transcript generation and enhanced features
 * 
 * @todo Ticket #8: Add on-demand Taddy jobs (async queue, costs credits)
 * @todo Ticket #9: Add fallback ASR providers (Deepgram/Rev AI, direct cost)
 * @todo Ticket #7: Add cost tracking and provenance metadata
 */
export class TranscriptService {
  private logger: Logger;
  private taddyFreeClient: TaddyFreeClient | null;
  private taddyBusinessClient: TaddyBusinessClient | null;
  private tier: 'free' | 'business';
  private podcastIdCache: Map<string, string> = new Map(); // In-memory cache for podcast IDs

  constructor() {
    this.logger = createLogger();
    
    // Get tier configuration from environment
    const config = getTranscriptWorkerConfig();
    this.tier = config.tier;
    
    // Initialize appropriate Taddy client based on tier
    const taddyApiKey = process.env.TADDY_API_KEY;
    
    if (!taddyApiKey) {
      this.logger.warn('system', 'TADDY_API_KEY not found - Taddy lookup disabled', {
        metadata: { hasApiKey: false, tier: this.tier }
      });
      this.taddyFreeClient = null;
      this.taddyBusinessClient = null;
      return;
    }

    if (this.tier === 'business') {
      // Initialize Business client for enhanced features
      this.taddyBusinessClient = new TaddyBusinessClient({ apiKey: taddyApiKey });
      this.taddyFreeClient = null;
      
      this.logger.debug('system', 'Taddy Business client initialized', {
        metadata: { hasApiKey: true, tier: this.tier }
      });
    } else {
      // Initialize Free client for basic lookup
      this.taddyFreeClient = new TaddyFreeClient({ apiKey: taddyApiKey });
      this.taddyBusinessClient = null;
      
      this.logger.debug('system', 'Taddy Free client initialized', {
        metadata: { hasApiKey: true, tier: this.tier }
      });
    }
  }

  /**
   * Retrieve transcript for an episode by ID
   * 
   * @param episodeId - UUID of the episode
   * @returns Promise resolving to ExtendedTranscriptResult with metadata
   */
  async getTranscript(episodeId: string): Promise<ExtendedTranscriptResult>;

  /**
   * Retrieve transcript for an episode object
   * 
   * @param episode - Full episode row from database with show info
   * @returns Promise resolving to ExtendedTranscriptResult with metadata
   */
  async getTranscript(episode: EpisodeWithShow): Promise<ExtendedTranscriptResult>;

  /**
   * Implementation signature - handles both overloads
   * @param arg - Either episode ID string or episode row object
   * @returns Promise resolving to ExtendedTranscriptResult with metadata
   */
  async getTranscript(arg: string | EpisodeWithShow): Promise<ExtendedTranscriptResult> {
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
      return { 
        kind: 'error', 
        message: 'Episode is not eligible for transcript processing',
        source: 'taddy' as const,
        creditsConsumed: 0
      };
    }
    
    // Route to appropriate client based on tier
    if (this.tier === 'business' && this.taddyBusinessClient) {
      return this.getTranscriptFromBusiness(episode);
    } else if (this.tier === 'free' && this.taddyFreeClient) {
      return this.getTranscriptFromFree(episode);
    }
    
    // No client available
    this.logger.debug('system', 'Taddy lookup skipped - no client available', {
      metadata: { 
        episode_id: episode.id,
        tier: this.tier,
        has_business_client: !!this.taddyBusinessClient,
        has_free_client: !!this.taddyFreeClient,
        reason: 'no_client'
      }
    });
    
    return { 
      kind: 'not_found',
      source: 'taddy' as const,
      creditsConsumed: 0
    };
  }

  /**
   * Get transcript using Business tier client
   * @private
   */
  private async getTranscriptFromBusiness(episode: EpisodeWithShow): Promise<ExtendedTranscriptResult> {
    if (!this.taddyBusinessClient || !episode.show?.rss_url || !episode.guid) {
      this.logger.debug('system', 'Business tier lookup skipped - missing requirements', {
        metadata: { 
          episode_id: episode.id,
          has_client: !!this.taddyBusinessClient,
          has_rss_url: !!episode.show?.rss_url,
          has_guid: !!episode.guid,
                  reason: !this.taddyBusinessClient ? 'no_client' : !episode.show?.rss_url ? 'no_rss_url' : 'no_guid'
      }
    });
    return { 
      kind: 'not_found',
      source: 'taddy' as const,
      creditsConsumed: 0
    };
    }

    this.logger.debug('system', 'Attempting Taddy Business transcript lookup', {
      metadata: { 
        episode_id: episode.id,
        rss_url: episode.show.rss_url,
        guid: episode.guid,
        tier: 'business'
      }
    });
    
    try {
      const businessResult = await this.taddyBusinessClient.fetchTranscript(episode.show.rss_url, episode.guid);
      
      // Map BusinessTranscriptResult to TranscriptResult
      const mappedResult = this.mapBusinessToTranscriptResult(businessResult);
      
      this.logger.info('system', 'Taddy Business lookup completed', {
        metadata: { 
          episode_id: episode.id,
          result_kind: mappedResult.kind,
          business_result_kind: businessResult.kind,
          credits_consumed: businessResult.creditsConsumed,
          has_text: 'text' in mappedResult && mappedResult.text.length > 0,
          tier: 'business'
        }
      });
      
      return mappedResult;
    } catch (error) {
      this.logger.error('system', 'Taddy Business lookup failed', {
        metadata: { 
          episode_id: episode.id,
          error: error instanceof Error ? error.message : String(error),
          tier: 'business'
        }
      });
      
      return { 
        kind: 'error', 
        message: `Taddy Business lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'taddy' as const,
        creditsConsumed: 0
      };
    }
  }

  /**
   * Get transcript using Free tier client
   * @private
   */
  private async getTranscriptFromFree(episode: EpisodeWithShow): Promise<ExtendedTranscriptResult> {
    if (!this.taddyFreeClient || !episode.show?.rss_url || !episode.guid) {
      this.logger.debug('system', 'Free tier lookup skipped - missing requirements', {
        metadata: { 
          episode_id: episode.id,
          has_client: !!this.taddyFreeClient,
          has_rss_url: !!episode.show?.rss_url,
          has_guid: !!episode.guid,
                  reason: !this.taddyFreeClient ? 'no_client' : !episode.show?.rss_url ? 'no_rss_url' : 'no_guid'
      }
    });
    return { 
      kind: 'not_found',
      source: 'taddy' as const,
      creditsConsumed: 0
    };
    }

    this.logger.debug('system', 'Attempting Taddy Free transcript lookup', {
      metadata: { 
        episode_id: episode.id,
        rss_url: episode.show.rss_url,
        guid: episode.guid,
        tier: 'free'
      }
    });
    
    try {
      const result = await this.taddyFreeClient.fetchTranscript(episode.show.rss_url, episode.guid);
      
      this.logger.info('system', 'Taddy Free lookup completed', {
        metadata: { 
          episode_id: episode.id,
          result_kind: result.kind,
          has_text: 'text' in result && result.text.length > 0,
          tier: 'free'
        }
      });
      
      // Convert TranscriptResult to ExtendedTranscriptResult with Free tier metadata
      return {
        ...result,
        source: 'taddy' as const,
        creditsConsumed: 0 // Free tier doesn't consume credits
      };
    } catch (error) {
      this.logger.error('system', 'Taddy Free lookup failed', {
        metadata: { 
          episode_id: episode.id,
          error: error instanceof Error ? error.message : String(error),
          tier: 'free'
        }
      });
      
      return { 
        kind: 'error', 
        message: `Taddy Free lookup failed: ${error instanceof Error ? error.message : String(error)}`,
        source: 'taddy' as const,
        creditsConsumed: 0
      };
    }
  }

  /**
   * Maps BusinessTranscriptResult to ExtendedTranscriptResult
   * Handles all Business tier response variants including 'processing'
   * Preserves source and credit consumption metadata for cost tracking
   * @private
   */
  private mapBusinessToTranscriptResult(businessResult: BusinessTranscriptResult): ExtendedTranscriptResult {
    // Log source and credit consumption for all results (for future cost tracking)
    this.logger.debug('system', 'Business tier result with metadata', {
      metadata: { 
        kind: businessResult.kind,
        source: businessResult.source || 'taddy',
        credits_consumed: businessResult.creditsConsumed,
        has_text: 'text' in businessResult && businessResult.text ? businessResult.text.length > 0 : false
      }
    });

    // Create base metadata that will be included in all results
    const metadata = {
      source: businessResult.source || 'taddy' as const,
      creditsConsumed: businessResult.creditsConsumed
    };

    switch (businessResult.kind) {
      case 'full':
        return {
          kind: 'full',
          text: businessResult.text,
          wordCount: businessResult.wordCount,
          ...metadata
        };
      
      case 'partial':
        return {
          kind: 'partial',
          text: businessResult.text,
          wordCount: businessResult.wordCount,
          ...metadata
        };
      
      case 'processing':
        return { 
          kind: 'processing',
          ...metadata
        };
      
      case 'not_found':
        return { 
          kind: 'not_found',
          ...metadata
        };
      
      case 'no_match':
        return { 
          kind: 'no_match',
          ...metadata
        };
      
      case 'error':
        return {
          kind: 'error',
          message: businessResult.message,
          ...metadata
        };
      
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = businessResult;
        throw new Error(`Unhandled business result kind: ${JSON.stringify(businessResult)}`);
    }
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
        tier: this.tier,
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