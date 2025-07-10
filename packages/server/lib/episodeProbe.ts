import { XMLParser } from 'fast-xml-parser';
import { jaccardSimilarity } from './utils.js';

// --------------------------------------------------------------
//  DEBUG LOGGING SUPPORT
//  When `DEBUG_RSS_MATCHING=true` is set in the environment we
//  emit detailed console logs that Render will pick up.  These
//  logs help us understand how the episode probe is behaving
//  in production without affecting normal operation.
// --------------------------------------------------------------
const DEBUG_RSS_MATCHING = process.env.DEBUG_RSS_MATCHING === 'true';

function debugLog(...args: unknown[]): void {
  if (DEBUG_RSS_MATCHING) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
// Cache for probe results to avoid duplicate work
const probeCache = new Map<string, { result: number; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Interface for Spotify episode response
interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
}

// Interface for RSS episode item
interface RssEpisodeItem {
  title?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { '#text': string };
  [key: string]: unknown;
}

// Interface for RSS feed structure
interface RssFeed {
  rss: {
    channel: {
      item: RssEpisodeItem | RssEpisodeItem[];
      [key: string]: unknown;
    };
  };
}

/**
 * Compute Levenshtein distance between two strings
 * @param a - First string
 * @param b - Second string
 * @returns Number of character edits needed to transform a into b
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first row and column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Compute similarity score based on Levenshtein distance
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score between 0 and 1 (1 = identical)
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1; // Both strings are empty
  
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / maxLength);
}

/**
 * Normalize episode title for comparison
 * @param title - Episode title
 * @returns Normalized title
 */
function normalizeEpisodeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Parse publication date from various formats
 * @param dateStr - Date string
 * @returns Date object or null if invalid
 */
function parsePublicationDate(dateStr: string): Date | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest episode from a Spotify show
 * @param spotifyShowId - Spotify show ID
 * @param accessToken - Spotify access token
 * @returns Latest episode data or null if not found
 */
async function fetchLatestSpotifyEpisode(
  spotifyShowId: string, 
  accessToken: string
): Promise<SpotifyEpisode | null> {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/shows/${spotifyShowId}/episodes?limit=1&market=US`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.warn(`[EpisodeProbe] Spotify API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0] as SpotifyEpisode;
    }

    return null;
  } catch (error) {
    console.warn(`[EpisodeProbe] Error fetching Spotify episode:`, (error as Error).message);
    return null;
  }
}

/**
 * Fetch the latest episode from an RSS feed with partial content optimization
 * @param feedUrl - RSS feed URL
 * @returns Latest episode data or null if not found
 */
async function fetchLatestRssEpisode(feedUrl: string): Promise<RssEpisodeItem | null> {
  try {
    // Use Range header to fetch only first 25KB for performance
    const response = await fetch(feedUrl, {
      headers: {
        'Range': 'bytes=0-25000',
        'User-Agent': 'Mozilla/5.0 (compatible; PodcastMatcher/1.0)'
      }
    });

    if (!response.ok && response.status !== 206) { // 206 = Partial Content
      console.warn(`[EpisodeProbe] RSS fetch error: ${response.status} ${response.statusText}`);
      return null;
    }

    const rssText = await response.text();
    
    // Parse RSS XML
    const parser = new XMLParser({ ignoreAttributes: false });
    const rssData = parser.parse(rssText) as RssFeed;

    if (!rssData.rss?.channel?.item) {
      return null;
    }

    // Get first episode (most recent)
    const items = Array.isArray(rssData.rss.channel.item) 
      ? rssData.rss.channel.item 
      : [rssData.rss.channel.item];

    return items[0] || null;
  } catch (error) {
    console.warn(`[EpisodeProbe] Error fetching RSS episode:`, (error as Error).message);
    return null;
  }
}

/**
 * Verify if the latest episodes from Spotify and RSS feed match
 * @param spotifyShowId - Spotify show ID
 * @param candidateFeedUrl - RSS feed URL to verify
 * @param accessToken - Spotify access token (optional, will skip Spotify fetch if not provided)
 * @returns Match score between 0 and 1 (1 = perfect match)
 */
export async function verifyLatestEpisodeMatch(
  spotifyShowId: string,
  candidateFeedUrl: string,
  accessToken?: string
): Promise<number> {
  // Create cache key
  const cacheKey = `${spotifyShowId}:${candidateFeedUrl}`;
  
  // Check cache
  const cached = probeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    // Fetch both episodes in parallel
    const [spotifyEpisode, rssEpisode] = await Promise.all([
      accessToken ? fetchLatestSpotifyEpisode(spotifyShowId, accessToken) : null,
      fetchLatestRssEpisode(candidateFeedUrl)
    ]);

    // Emit a quick overview of the data we were able to fetch
    debugLog('[EpisodeProbe] Data fetch', {
      spotifyShowId,
      candidateFeedUrl,
      spotifyEpisodeAvailable: !!spotifyEpisode,
      rssEpisodeAvailable: !!rssEpisode
    });

    // If we can't fetch either episode, return neutral score
    if (!spotifyEpisode || !rssEpisode) {
      const result = 0.5; // Neutral score when data is unavailable

      debugLog('[EpisodeProbe] Missing episode data – returning neutral score', {
        spotifyShowId,
        candidateFeedUrl,
        spotifyEpisodeAvailable: !!spotifyEpisode,
        rssEpisodeAvailable: !!rssEpisode,
        result
      });
      probeCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    // Compare episode titles
    const spotifyTitle = normalizeEpisodeTitle(spotifyEpisode.name);
    const rssTitle = normalizeEpisodeTitle(rssEpisode.title || '');
    
    // Use both Jaccard and Levenshtein similarity for robustness
    const jaccardScore = jaccardSimilarity(spotifyTitle, rssTitle);
    const levenshteinScore = levenshteinSimilarity(spotifyTitle, rssTitle);
    
    // Weighted average: Jaccard is better for word-level similarity, Levenshtein for character-level
    const titleScore = (jaccardScore * 0.7) + (levenshteinScore * 0.3);

    // Compare publication dates (if available)
    let dateScore = 0.5; // Default neutral score
    if (spotifyEpisode.release_date && rssEpisode.pubDate) {
      const spotifyDate = parsePublicationDate(spotifyEpisode.release_date);
      const rssDate = parsePublicationDate(rssEpisode.pubDate);
      
      if (spotifyDate && rssDate) {
        const timeDiffMs = Math.abs(spotifyDate.getTime() - rssDate.getTime());
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
        
        // Perfect match if within 2 hours, degrading linearly to 0 at 48 hours
        if (timeDiffHours <= 2) {
          dateScore = 1.0;
        } else if (timeDiffHours <= 48) {
          dateScore = Math.max(0, 1 - ((timeDiffHours - 2) / 46));
        } else {
          dateScore = 0;
        }
      }
    }

    // Combine title and date scores (title is more important)
    const finalScore = (titleScore * 0.8) + (dateScore * 0.2);

    debugLog('[EpisodeProbe] Scoring details', {
      spotifyShowId,
      candidateFeedUrl,
      jaccardScore,
      levenshteinScore,
      titleScore,
      dateScore,
      finalScore
    });

    // Cache the result
    probeCache.set(cacheKey, { result: finalScore, timestamp: Date.now() });

    return finalScore;
  } catch (error) {
    console.warn(`[EpisodeProbe] Error during episode verification:`, (error as Error).message);
    const result = 0.5; // Neutral score on error
    probeCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }
}

/**
 * Clear expired entries from the probe cache
 */
export function clearExpiredProbeCache(): void {
  const now = Date.now();
  for (const [key, value] of probeCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL_MS) {
      probeCache.delete(key);
    }
  }
}

/**
 * Clear all entries from the probe cache (for testing)
 */
export function clearAllProbeCache(): void {
  probeCache.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getProbeCacheStats(): { size: number; ttlMs: number } {
  return {
    size: probeCache.size,
    ttlMs: CACHE_TTL_MS
  };
} 