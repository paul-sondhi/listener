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
  publisher: string;
  [key: string]: unknown;
}

// Interface for PodcastIndex feed
interface PodcastIndexFeed {
  id: number;
  title: string;
  url: string;
  description: string;
  author: string;
  ownerName: string;
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
    
    // Only log debug info when DEBUG_API is explicitly set
    if (process.env.DEBUG_API === 'true') {
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
 * Get enhanced metadata from a Spotify show URL including name, description, and publisher
 * @param {string} spotifyUrl - The Spotify show URL
 * @returns {Promise<{ name: string, description: string, publisher: string }>} The show name, description, and publisher
 * @throws {Error} If the URL is invalid or the show cannot be fetched
 */
async function getTitleSlug(spotifyUrl: string): Promise<{ name: string, description: string, publisher: string }> {
    // Use Spotify Web API to fetch the show name and description
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
    const { name, description, publisher } = showData;
    
    if (!name) {
      throw new Error('No show name returned from Spotify API');
    }
    
    // Normalize and slugify the show name
    const normalizedName = name
      .toLowerCase()
      .replace(/\|.*$/, '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .trim();
    
    // Use description if available, otherwise use empty string as fallback
    const normalizedDescription = description || '';
    
    // Basic normalization for publisher: trim whitespace and handle missing publisher
    const normalizedPublisher = publisher?.trim() || '';
    
    return {
      name: normalizedName,
      description: normalizedDescription,
      publisher: normalizedPublisher
    };
}

/**
 * Get the RSS feed URL for a podcast using enhanced matching with title, description, and publisher
 * @param {string | { name: string, description: string, publisher?: string }} metadata - The podcast metadata (name, description, and publisher) or just the slug
 * @returns {Promise<string | null>} The RSS feed URL or null if not found
 * @throws {Error} If the search fails
 */
async function getFeedUrl(metadata: string | { name: string, description: string, publisher?: string }): Promise<string | null> {
    // Handle both legacy string input and new metadata object
    const searchTerm = typeof metadata === 'string' ? metadata : metadata.name;
    const description = typeof metadata === 'string' ? '' : metadata.description;
    const publisher = typeof metadata === 'string' ? '' : (metadata.publisher || '');
    
    // Fetch feed URL for a given search term, using PodcastIndex with iTunes fallback
    const authHeaders: AuthHeaders = getAuthHeaders();
    const searchUrl: string = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(searchTerm)}`;
    
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
      // Enhanced matching: Use weighted scoring (40% title, 40% description, 20% publisher)
      let bestMatch: PodcastIndexFeed | null = null;
      let bestScore = 0;
      
      // Get configurable weights from environment variables with defaults
      const titleWeight = parseFloat(process.env.RSS_MATCH_TITLE_WEIGHT || '0.4');
      const descriptionWeight = parseFloat(process.env.RSS_MATCH_DESCRIPTION_WEIGHT || '0.4');
      const publisherWeight = parseFloat(process.env.RSS_MATCH_PUBLISHER_WEIGHT || '0.2');
      
      for (const feed of feeds) {
        // Calculate title similarity (40% weight by default)
        const titleSimilarity = jaccardSimilarity(feed.title.toLowerCase(), searchTerm);
        
        // Calculate description similarity (40% weight by default) if description is available
        let descriptionSimilarity = 0;
        if (description && feed.description) {
          descriptionSimilarity = jaccardSimilarity(feed.description.toLowerCase(), description.toLowerCase());
        }
        
        // Calculate publisher similarity (20% weight by default) if publisher is available
        let publisherSimilarity = 0;
        if (publisher && feed.author) {
          publisherSimilarity = jaccardSimilarity(feed.author.toLowerCase(), publisher.toLowerCase());
        }
        
        // Combined score with configurable weighting
        const combinedScore = (titleSimilarity * titleWeight) + 
                             (descriptionSimilarity * descriptionWeight) + 
                             (publisherSimilarity * publisherWeight);
        
        // Update best match if this score is higher
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestMatch = feed;
        }
      }
      
      // Get configurable threshold from environment variable with default
      const threshold = parseFloat(process.env.RSS_MATCH_THRESHOLD || '0.8');
      
      // Use best match if it meets the threshold
      if (bestMatch && bestScore >= threshold) {
        feedUrl = bestMatch.url;
      } else if (feeds[0]) {
        // Fallback to first result if no high-confidence match
        feedUrl = feeds[0].url;
      }
    }
    
    // Fallback to Apple iTunes Lookup
    if (!feedUrl) {
      const itunesRes: globalThis.Response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=podcast&limit=1`
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

/**
 * Verify that the Taddy API key is accessible from environment variables
 * @returns {boolean} True if the API key is accessible, false otherwise
 */
function verifyTaddyApiKey(): boolean {
    const taddyApiKey: string | undefined = process.env.TADDY_API_KEY;
    
    if (!taddyApiKey) {
        console.warn('TADDY_API_KEY is not set in environment variables');
        return false;
    }
    
    // Basic validation: should be a non-empty string that looks like an API key
    if (typeof taddyApiKey !== 'string' || taddyApiKey.length < 10) {
        console.warn('TADDY_API_KEY appears to be invalid (too short or wrong type)');
        return false;
    }
    
    // Log success when DEBUG_API is explicitly set
    if (process.env.DEBUG_API === 'true') {
        console.log('DEBUG: TADDY_API_KEY loaded successfully:', taddyApiKey.substring(0, 8) + '...');
    }
    
    return true;
}

export { getAuthHeaders, getTitleSlug, getFeedUrl, jaccardSimilarity, verifyTaddyApiKey }; 