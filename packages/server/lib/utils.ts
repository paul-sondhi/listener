import { getSpotifyAccessToken } from './spotify.js';
import crypto from 'crypto';

// Interface for PodcastIndex API authentication headers
interface AuthHeaders {
  'X-Auth-Key': string;
  'X-Auth-Date': string;
  'Authorization': string;
}

// Interface for Spotify show response
interface SpotifyShow {
  id: string;
  name: string;
  description: string;
  [key: string]: unknown;
}

// Interface for PodcastIndex feed
interface PodcastIndexFeed {
  id: number;
  title: string;
  url: string;
  description: string;
  [key: string]: unknown;
}

// Interface for PodcastIndex search response
interface PodcastIndexSearchResponse {
  status: string;
  feeds: PodcastIndexFeed[];
  count: number;
  [key: string]: unknown;
}

// Interface for iTunes search result
interface iTunesResult {
  feedUrl: string;
  trackName: string;
  artistName: string;
  [key: string]: unknown;
}

// Interface for iTunes search response
interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesResult[];
}

/**
 * Generate authentication headers for PodcastIndex API
 * @returns {AuthHeaders} The authentication headers
 * @throws {Error} If API credentials are missing
 */
function getAuthHeaders(): AuthHeaders {
    const apiKey: string | undefined = process.env.PODCASTINDEX_KEY;
    const apiSecret: string | undefined = process.env.PODCASTINDEX_SECRET;
    
    // console.log('DEBUG: PodcastIndex credentials check:');
    // console.log('DEBUG: PODCASTINDEX_KEY loaded:', apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING');
    // console.log('DEBUG: PODCASTINDEX_SECRET loaded:', apiSecret ? `${apiSecret.substring(0, 8)}...` : 'MISSING');
    // console.log('DEBUG: USER_AGENT:', process.env.USER_AGENT || 'MISSING');
    
    if (!apiKey || !apiSecret) {
        throw new Error('PodcastIndex API Key/Secret is missing. Please check environment variables.');
    }

    const apiHeaderTime: number = Math.floor(Date.now() / 1000);
    // SHA-1 hash of (key + secret + date) as required by PodcastIndex API
    // This creates the proper SHA-1 signature as required by PodcastIndex API
    const signature: string = crypto
      .createHash('sha1')
      .update(apiKey + apiSecret + apiHeaderTime.toString())
      .digest('hex');
    
    // Only log debug info in development or when DEBUG_API is set
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_API === 'true') {
      console.log('DEBUG: Generated signature for timestamp:', apiHeaderTime);
      console.log('DEBUG: Signature preview:', signature.substring(0, 10) + '...');
    }
    
    // Return the three required headers
    return {
      'X-Auth-Key': apiKey,
      'X-Auth-Date': apiHeaderTime.toString(),
      'Authorization': signature
    };
}

/**
 * Get a slugified title from a Spotify show URL
 * @param {string} spotifyUrl - The Spotify show URL
 * @returns {Promise<string>} The slugified show title
 * @throws {Error} If the URL is invalid or the show cannot be fetched
 */
async function getTitleSlug(spotifyUrl: string): Promise<string> {
    // Use Spotify Web API to fetch the show name and slugify it
    const cleanUrl: string = spotifyUrl.split('?')[0]!;
    const { pathname } = new URL(cleanUrl);
    const [, type, id] = pathname.split('/');
    
    if (type !== 'show') {
      throw new Error('getTitleSlug: URL is not a Spotify show link');
    }
    
    // Get an access token
    const token: string = await getSpotifyAccessToken();
    
    // Fetch show metadata from Spotify API
    const apiRes: globalThis.Response = await fetch(`https://api.spotify.com/v1/shows/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!apiRes.ok) {
      throw new Error('Failed to fetch show from Spotify API');
    }
    
    const showData: SpotifyShow = await apiRes.json() as SpotifyShow;
    const { name } = showData;
    
    if (!name) {
      throw new Error('No show name returned from Spotify API');
    }
    
    // Normalize and slugify the show name
    return name
      .toLowerCase()
      .replace(/\|.*$/, '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .trim();
}

/**
 * Get the RSS feed URL for a podcast by searching PodcastIndex and iTunes
 * @param {string} slug - The podcast slug/title to search for
 * @returns {Promise<string | null>} The RSS feed URL or null if not found
 * @throws {Error} If the search fails
 */
async function getFeedUrl(slug: string): Promise<string | null> {
    // Fetch feed URL for a given slug, using PodcastIndex with iTunes fallback
    const authHeaders: AuthHeaders = getAuthHeaders();
    const searchUrl: string = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(slug)}`;
    
    const searchRes: globalThis.Response = await fetch(searchUrl, {
      headers: {
        ...authHeaders,
        'User-Agent': process.env.USER_AGENT || 'Listener-App/1.0'
      }
    });
    
    if (!searchRes.ok) {
      const errorText: string = await searchRes.text().catch(() => 'Could not read response');
      console.error('PodcastIndex API Error Response:', errorText);
      throw new Error(`PodcastIndex search failed with status ${searchRes.status}`);
    }
    
    const searchData: PodcastIndexSearchResponse = await searchRes.json() as PodcastIndexSearchResponse;
    const { feeds } = searchData;
    let feedUrl: string | null = null;
    
    if (feeds && feeds.length > 0) {
      // Look for exact match first
      for (const feed of feeds) {
        if (jaccardSimilarity(feed.title.toLowerCase(), slug) >= 0.8) {
          feedUrl = feed.url;
          break;
        }
      }
      // If no exact match, use the first result
      if (!feedUrl && feeds[0]) {
        feedUrl = feeds[0].url;
      }
    }
    
    // Fallback to Apple iTunes Lookup
    if (!feedUrl) {
      const itunesRes: globalThis.Response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(slug)}&media=podcast&limit=1`
      );
      
      if (itunesRes.ok) {
        const itunesData: iTunesSearchResponse = await itunesRes.json() as iTunesSearchResponse;
        if (itunesData.results && itunesData.results.length > 0 && itunesData.results[0]?.feedUrl) {
          feedUrl = itunesData.results[0].feedUrl;
        }
      }
    }
    
    return feedUrl;
}

/**
 * Compute Jaccard similarity between two strings (by word overlap)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function jaccardSimilarity(a: string, b: string): number {
    const setA: Set<string> = new Set(a.split(/\s+/));
    const setB: Set<string> = new Set(b.split(/\s+/));
    const intersection: number = [...setA].filter(x => setB.has(x)).length;
    const union: number = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

export { getAuthHeaders, getTitleSlug, getFeedUrl, jaccardSimilarity }; 