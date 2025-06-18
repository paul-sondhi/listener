/**
 * Episode Sync Service
 * Purpose: Automatically sync new podcast episodes for subscribed shows
 * 
 * This service:
 * 1. Queries shows that have active subscriptions
 * 2. Fetches RSS feeds for each show
 * 3. Parses episodes and filters by publish date (>= 2025-06-15)
 * 4. Upserts episodes into podcast_episodes table
 * 5. Updates show metadata (last_checked_episodes, etag, last_modified)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { Database } from '@listener/shared';

// Episode cutoff date - only sync episodes published on or after this date
const EPISODE_CUTOFF_DATE = new Date('2025-06-15T00:00:00Z');

// Interface for RSS feed episode item
interface RssEpisodeItem {
  title?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { '#text': string };
  enclosure?: {
    '@_url'?: string;
    '@_type'?: string;
    '@_length'?: string;
  };
  'itunes:duration'?: string;
  [key: string]: unknown;
}

// Interface for RSS feed channel
interface RssChannel {
  title?: string;
  description?: string;
  item?: RssEpisodeItem | RssEpisodeItem[];
  [key: string]: unknown;
}

// Interface for complete RSS feed
interface RssFeed {
  rss?: {
    channel?: RssChannel;
  };
  [key: string]: unknown;
}

// Interface for podcast show from database
interface PodcastShow {
  id: string;
  spotify_url: string;
  title: string | null;
  rss_url: string;
  etag: string | null;
  last_modified: string | null;
  last_checked_episodes: string | null;
}

// Interface for episode data to upsert
interface EpisodeData {
  show_id: string;
  guid: string;
  episode_url: string;
  title: string | null;
  description: string | null;
  pub_date: string | null;
  duration_sec: number | null;
}

// Interface for sync result
interface ShowSyncResult {
  success: boolean;
  showId: string;
  showTitle: string | null;
  episodesFound: number;
  episodesUpserted: number;
  error?: string;
}

// Interface for overall sync result
interface SyncAllResult {
  success: boolean;
  totalShows: number;
  successfulShows: number;
  failedShows: number;
  totalEpisodesUpserted: number;
  errors: Array<{
    showId: string;
    showTitle: string | null;
    error: string;
  }>;
  duration: number;
}

// Simple logger interface for dependency injection in tests
interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => void;
}

// Default console logger
const defaultLogger: Logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[EpisodeSync] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[EpisodeSync] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  },
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
    console.error(`[EpisodeSync] ${message}`, error?.message || '', meta ? JSON.stringify(meta, null, 2) : '');
    if (error?.stack) console.error(error.stack);
  }
};

/**
 * Episode Sync Service Class
 */
export class EpisodeSyncService {
  private supabase: SupabaseClient<Database>;
  private logger: Logger;

  constructor(supabaseUrl?: string, supabaseKey?: string, logger?: Logger) {
    // Use provided credentials or fall back to environment variables
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Supabase URL and service role key are required');
    }

    this.supabase = createClient<Database>(url, key);
    this.logger = logger || defaultLogger;
  }

  /**
   * Sync episodes for all shows that have active subscriptions
   * @returns Promise<SyncAllResult> - Result summary
   */
  async syncAllShows(): Promise<SyncAllResult> {
    const startTime = Date.now();
    this.logger.info('Starting episode sync for all shows with active subscriptions');

    const result: SyncAllResult = {
      success: false,
      totalShows: 0,
      successfulShows: 0,
      failedShows: 0,
      totalEpisodesUpserted: 0,
      errors: [],
      duration: 0
    };

    try {
      // Get all shows that have at least one active subscription
      const shows = await this.getShowsWithActiveSubscriptions();
      result.totalShows = shows.length;

      this.logger.info(`Found ${shows.length} shows with active subscriptions`);

      if (shows.length === 0) {
        result.success = true;
        result.duration = Date.now() - startTime;
        this.logger.info('No shows to sync');
        return result;
      }

      // Sync each show
      for (const show of shows) {
        try {
          const showResult = await this.syncShow(show);
          
          if (showResult.success) {
            result.successfulShows++;
            result.totalEpisodesUpserted += showResult.episodesUpserted;
          } else {
            result.failedShows++;
            result.errors.push({
              showId: show.id,
              showTitle: show.title,
              error: showResult.error || 'Unknown error'
            });
          }
        } catch (error) {
          result.failedShows++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            showId: show.id,
            showTitle: show.title,
            error: errorMessage
          });
          this.logger.error(`Exception syncing show: ${show.title}`, error as Error, {
            showId: show.id
          });
        }

        // Small delay between shows to avoid overwhelming RSS hosts
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      result.success = result.failedShows === 0;
      result.duration = Date.now() - startTime;

      this.logger.info('Episode sync completed', {
        totalShows: result.totalShows,
        successfulShows: result.successfulShows,
        failedShows: result.failedShows,
        totalEpisodesUpserted: result.totalEpisodesUpserted,
        duration: result.duration
      });

    } catch (error) {
      result.duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Episode sync failed with exception', error as Error);
      throw new Error(`Episode sync failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Sync episodes for a single show
   * @param show - The podcast show to sync
   * @returns Promise<ShowSyncResult> - Result for this show
   */
  async syncShow(show: PodcastShow): Promise<ShowSyncResult> {
    const result: ShowSyncResult = {
      success: false,
      showId: show.id,
      showTitle: show.title,
      episodesFound: 0,
      episodesUpserted: 0
    };

    try {
      this.logger.info(`Syncing show: ${show.title}`, { showId: show.id, rssUrl: show.rss_url });

      // Fetch RSS feed with conditional headers for efficiency
      const { rssText, etag, lastModified, notModified } = await this.fetchRssFeed(show);

      if (notModified) {
        this.logger.info(`Show not modified since last check: ${show.title}`, { showId: show.id });
        await this.updateShowCheckTimestamp(show.id);
        result.success = true;
        return result;
      }

      // Parse RSS feed
      const episodes = await this.parseEpisodes(rssText, show.id);
      result.episodesFound = episodes.length;

      this.logger.info(`Found ${episodes.length} episodes for show: ${show.title}`, { showId: show.id });

      // Upsert episodes to database
      if (episodes.length > 0) {
        const upsertedCount = await this.upsertEpisodes(episodes);
        result.episodesUpserted = upsertedCount;
      }

      // Update show metadata
      await this.updateShowMetadata(show.id, etag, lastModified);

      result.success = true;
      this.logger.info(`Successfully synced show: ${show.title}`, {
        showId: show.id,
        episodesFound: result.episodesFound,
        episodesUpserted: result.episodesUpserted
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.error = errorMessage;
      this.logger.error(`Failed to sync show: ${show.title}`, error as Error, { showId: show.id });

      // Try to update check timestamp even on failure
      try {
        await this.updateShowCheckTimestamp(show.id);
      } catch (_updateError) {
        this.logger.warn(`Failed to update check timestamp for show: ${show.title}`, { showId: show.id });
      }
    }

    return result;
  }

  /**
   * Get all shows that have at least one active subscription
   * @returns Promise<PodcastShow[]> - Array of shows to sync
   */
  private async getShowsWithActiveSubscriptions(): Promise<PodcastShow[]> {
    const { data, error } = await this.supabase
      .from('podcast_shows')
      .select(`
        id,
        spotify_url,
        title,
        rss_url,
        etag,
        last_modified,
        last_checked_episodes,
        user_podcast_subscriptions!inner(status)
      `)
      .not('rss_url', 'is', null)
      .eq('user_podcast_subscriptions.status', 'active');

    if (error) {
      throw new Error(`Failed to query shows with subscriptions: ${error.message}`);
    }

    // Transform the data to remove the subscription join
    return (data || []).map(show => ({
      id: show.id,
      spotify_url: show.spotify_url,
      title: show.title,
      rss_url: show.rss_url!,
      etag: show.etag,
      last_modified: show.last_modified,
      last_checked_episodes: show.last_checked_episodes
    }));
  }

  /**
   * Fetch RSS feed with conditional headers and retry logic
   * @param show - The podcast show
   * @returns Promise with RSS text and metadata
   */
  private async fetchRssFeed(show: PodcastShow): Promise<{
    rssText: string;
    etag: string | null;
    lastModified: string | null;
    notModified: boolean;
  }> {
    const headers: Record<string, string> = {
      'User-Agent': process.env.USER_AGENT || 'Listener-App/1.0'
    };

    // Add conditional headers if available
    if (show.etag) {
      headers['If-None-Match'] = show.etag;
    }
    if (show.last_modified) {
      headers['If-Modified-Since'] = show.last_modified;
    }

    let lastError: Error | null = null;

    // Retry logic: try twice
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(show.rss_url, { headers });

        // Handle 304 Not Modified
        if (response.status === 304) {
          return {
            rssText: '',
            etag: show.etag,
            lastModified: show.last_modified,
            notModified: true
          };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const rssText = await response.text();
        const etag = response.headers.get('etag');
        const lastModified = response.headers.get('last-modified');

        return {
          rssText,
          etag,
          lastModified,
          notModified: false
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Fetch attempt ${attempt} failed for show: ${show.title}`, {
          showId: show.id,
          error: lastError.message
        });

        if (attempt < 2) {
          // Wait 1 second before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`Failed to fetch RSS feed after 2 attempts: ${lastError?.message}`);
  }

  /**
   * Parse RSS feed and extract episodes published >= cutoff date
   * @param rssText - Raw RSS XML content
   * @param showId - The show ID for the episodes
   * @returns Promise<EpisodeData[]> - Array of episode data
   */
  private async parseEpisodes(rssText: string, showId: string): Promise<EpisodeData[]> {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const rssData = parser.parse(rssText) as RssFeed;

      if (!rssData.rss?.channel) {
        throw new Error('Invalid RSS feed structure');
      }

      const items = rssData.rss.channel.item;
      if (!items) {
        return [];
      }

      // Ensure items is an array
      const itemArray = Array.isArray(items) ? items : [items];
      const episodes: EpisodeData[] = [];

      for (const item of itemArray) {
        try {
          const episodeData = this.parseEpisodeItem(item, showId);
          if (episodeData) {
            episodes.push(episodeData);
          }
        } catch (_error) {
          this.logger.warn('Failed to parse episode item', { error: (_error as Error).message, item });
        }
      }

      return episodes;
    } catch (error) {
      throw new Error(`Failed to parse RSS feed: ${(error as Error).message}`);
    }
  }

  /**
   * Parse a single RSS episode item
   * @param item - RSS episode item
   * @param showId - The show ID
   * @returns EpisodeData | null - Parsed episode data or null if invalid/too old
   */
  private parseEpisodeItem(item: RssEpisodeItem, showId: string): EpisodeData | null {
    // Extract GUID
    let guid: string;
    if (typeof item.guid === 'string') {
      guid = item.guid;
    } else if (item.guid && typeof item.guid === 'object' && '#text' in item.guid) {
      guid = item.guid['#text'];
    } else {
      // Fallback to title if no GUID
      guid = item.title || `episode-${Date.now()}`;
    }

    // Extract publication date
    const pubDateStr = item.pubDate;
    let pubDate: Date | null = null;
    if (pubDateStr) {
      pubDate = new Date(pubDateStr);
      if (isNaN(pubDate.getTime())) {
        pubDate = null;
      }
    }

    // Filter by cutoff date
    if (pubDate && pubDate < EPISODE_CUTOFF_DATE) {
      return null; // Skip episodes older than cutoff
    }

    // Extract episode URL from enclosure
    const episodeUrl = item.enclosure?.['@_url'];
    if (!episodeUrl) {
      throw new Error('No episode URL found in enclosure');
    }

    // Parse duration
    let durationSec: number | null = null;
    if (item['itunes:duration']) {
      durationSec = this.parseDuration(item['itunes:duration']);
    }

    return {
      show_id: showId,
      guid,
      episode_url: episodeUrl,
      title: item.title || null,
      description: item.description || null,
      pub_date: pubDate?.toISOString() || null,
      duration_sec: durationSec
    };
  }

  /**
   * Parse duration string to seconds
   * @param duration - Duration string (e.g., "1:23:45" or "3600")
   * @returns number | null - Duration in seconds or null if invalid
   */
  private parseDuration(duration: string): number | null {
    try {
      // Handle formats like "1:23:45" or "23:45" or "3600"
      if (duration.includes(':')) {
        const parts = duration.split(':').map(p => parseInt(p, 10));
        if (parts.length === 3) {
          // HH:MM:SS
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          // MM:SS
          return parts[0] * 60 + parts[1];
        }
      } else {
        // Assume seconds
        const seconds = parseInt(duration, 10);
        if (!isNaN(seconds)) {
          return seconds;
        }
      }
    } catch (_error) {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Upsert episodes to the database
   * @param episodes - Array of episode data to upsert
   * @returns Promise<number> - Number of episodes upserted
   */
  private async upsertEpisodes(episodes: EpisodeData[]): Promise<number> {
    if (episodes.length === 0) {
      return 0;
    }

    const { error } = await this.supabase
      .from('podcast_episodes')
      .upsert(episodes, {
        onConflict: 'show_id,guid',
        ignoreDuplicates: false // Update existing records if metadata changed
      });

    if (error) {
      throw new Error(`Failed to upsert episodes: ${error.message}`);
    }

    return episodes.length;
  }

  /**
   * Update show metadata after successful sync
   * @param showId - The show ID
   * @param etag - New ETag value
   * @param lastModified - New Last-Modified value
   */
  private async updateShowMetadata(showId: string, etag: string | null, lastModified: string | null): Promise<void> {
    const updateData: Record<string, unknown> = {
      last_checked_episodes: new Date().toISOString(),
      last_fetched: new Date().toISOString()
    };

    if (etag) updateData.etag = etag;
    if (lastModified) updateData.last_modified = lastModified;

    const { error } = await this.supabase
      .from('podcast_shows')
      .update(updateData)
      .eq('id', showId);

    if (error) {
      throw new Error(`Failed to update show metadata: ${error.message}`);
    }
  }

  /**
   * Update only the last_checked_episodes timestamp
   * @param showId - The show ID
   */
  private async updateShowCheckTimestamp(showId: string): Promise<void> {
    const { error } = await this.supabase
      .from('podcast_shows')
      .update({ last_checked_episodes: new Date().toISOString() })
      .eq('id', showId);

    if (error) {
      throw new Error(`Failed to update show check timestamp: ${error.message}`);
    }
  }
} 