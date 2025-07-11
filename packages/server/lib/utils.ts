import { getSpotifyAccessToken } from './spotify.js';
import { verifyLatestEpisodeMatch } from './episodeProbe.js';
import crypto from 'crypto';

// --------------------------------------------------------------
//  DEBUG LOGGING SUPPORT (shared by getFeedUrl & helpers)
//  When `DEBUG_RSS_MATCHING=true` is set, we emit structured
//  console logs so that Render captures them in the deployment
//  logs.  This makes it easy to audit matching decisions during
//  the daily subscription refresh job.
// --------------------------------------------------------------
const DEBUG_RSS_MATCHING = process.env.DEBUG_RSS_MATCHING === 'true';

function debugLog(...args: unknown[]): void {
  if (DEBUG_RSS_MATCHING) {
     
    console.log(...args);
  }
}

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
 * Get enhanced metadata from a Spotify show URL including name, description, publisher, spotifyShowId, and accessToken
 * @param {string} spotifyUrl - The Spotify show URL
 * @returns {Promise<{ name: string, description: string, publisher: string, spotifyShowId: string, accessToken: string }>} The show metadata with episode probe support
 * @throws {Error} If the URL is invalid or the show cannot be fetched
 */
async function getTitleSlug(spotifyUrl: string): Promise<{ name: string, description: string, publisher: string, spotifyShowId: string, accessToken: string }> {
    // Use Spotify Web API to fetch the show name and description
    const cleanUrl: string = spotifyUrl.split('?')[0]!;
    const { pathname } = new URL(cleanUrl);
    const [, type, id] = pathname.split('/');
    
    if (type !== 'show' || !id) {
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
      publisher: normalizedPublisher,
      spotifyShowId: id,
      accessToken: token
    };
}

/**
 * Get the RSS feed URL for a podcast using enhanced matching with title, description, publisher, and episode verification
 * @param {string | { name: string, description: string, publisher?: string, spotifyShowId?: string, accessToken?: string }} metadata - The podcast metadata or just the slug
 * @returns {Promise<string | null>} The RSS feed URL or null if not found
 * @throws {Error} If the search fails
 */
async function getFeedUrl(metadata: string | { name: string, description: string, publisher?: string, spotifyShowId?: string, accessToken?: string }): Promise<string | null> {
    // Handle both legacy string input and new metadata object
    const searchTerm = typeof metadata === 'string' ? metadata : metadata.name;
    const description = typeof metadata === 'string' ? '' : metadata.description;
    const publisher = typeof metadata === 'string' ? '' : (metadata.publisher || '');
    const spotifyShowId = typeof metadata === 'string' ? undefined : metadata.spotifyShowId;
    const accessToken = typeof metadata === 'string' ? undefined : metadata.accessToken;
    
    // Fetch feed URL for a given search term, using PodcastIndex with iTunes fallback
    const authHeaders: AuthHeaders = getAuthHeaders();
    
    // Try /search/bytitle first for more precise results
    let searchUrl: string = `https://api.podcastindex.org/api/1.0/search/bytitle?q=${encodeURIComponent(searchTerm)}`;
    
    debugLog('[getFeedUrl] Trying bytitle search first', { searchTerm, searchUrl });
    
    let searchRes: globalThis.Response = await fetch(searchUrl, {
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
    
    let searchData: PodcastIndexSearchResponse = await searchRes.json() as PodcastIndexSearchResponse;
    let { feeds } = searchData;
    
    // If bytitle returns no results, fallback to byterm search
    if (!feeds || feeds.length === 0) {
      debugLog('[getFeedUrl] No bytitle results, falling back to byterm search', { searchTerm });
      
      searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(searchTerm)}`;
      
      searchRes = await fetch(searchUrl, {
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
      
      searchData = await searchRes.json() as PodcastIndexSearchResponse;
      feeds = searchData.feeds;
    }
    
    debugLog('[getFeedUrl] PodcastIndex search completed', { searchTerm, feedCount: feeds?.length || 0, searchType: feeds?.length ? 'bytitle' : 'byterm' });
    let feedUrl: string | null = null;
    
    if (feeds && feeds.length > 0) {
      // Enhanced matching: Use weighted scoring (40% title, 40% description, 20% publisher)
      let bestMatch: PodcastIndexFeed | null = null;
      let bestScore = 0;
      
      // Get configurable weights from environment variables with defaults
      const titleWeight = parseFloat(process.env.RSS_MATCH_TITLE_WEIGHT || '0.4');
      const descriptionWeight = parseFloat(process.env.RSS_MATCH_DESCRIPTION_WEIGHT || '0.4');
      const publisherWeight = parseFloat(process.env.RSS_MATCH_PUBLISHER_WEIGHT || '0.2');
      
      // First pass: Calculate similarity scores for all feeds
      const scoredFeeds = feeds.map(feed => {
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
        
        return { feed, score: combinedScore };
      });
      
      // Sort by score (highest first)
      scoredFeeds.sort((a, b) => b.score - a.score);

      // Emit top scored feeds for observability
      debugLog('[getFeedUrl] Scored feeds (top 5)', scoredFeeds.slice(0, 5).map(({ feed, score }) => ({ url: feed.url, title: feed.title, score })));
      
      // Episode probe enhancement: Run probe on top 2-3 candidates if Spotify data is available
      if (spotifyShowId && accessToken && scoredFeeds.length > 0) {
        const topCandidates = scoredFeeds.slice(0, Math.min(3, scoredFeeds.length));
        
        // Run episode probes in parallel for top candidates
        const probePromises = topCandidates.map(async ({ feed, score }) => {
          try {
            const probeScore = await verifyLatestEpisodeMatch(spotifyShowId, feed.url, accessToken);
            
            // Adjust score based on episode match:
            // +0.15 if probe score >= 0.9 (high confidence match)
            // -0.25 if probe score <= 0.2 (likely mismatch)
            let adjustedScore = score;
            if (probeScore >= 0.9) {
              adjustedScore += 0.15;
            } else if (probeScore <= 0.2) {
              adjustedScore -= 0.25;
            }
            
            return { feed, score: adjustedScore, probeScore };
          } catch (error) {
            // If probe fails, return original score
            console.warn(`[getFeedUrl] Episode probe failed for ${feed.url}:`, (error as Error).message);
            return { feed, score, probeScore: 0.5 };
          }
        });
        
        const probeResults = await Promise.all(probePromises);

        // Emit probe result details
        debugLog('[getFeedUrl] Probe results', probeResults.map(r => ({ url: r.feed.url, probeScore: r.probeScore, adjustedScore: r.score })));
        
        // Find the best match after probe adjustment
        if (probeResults.length > 0) {
          let bestProbeResult = probeResults[0]!; // We know length > 0
          for (const result of probeResults) {
            if (result.score > bestProbeResult.score) {
              bestProbeResult = result;
            }
          }
          
          bestMatch = bestProbeResult.feed;
          bestScore = bestProbeResult.score;
        } else {
          // Fallback if no probe results
          bestMatch = scoredFeeds[0]?.feed || null;
          bestScore = scoredFeeds[0]?.score || 0;
        }
      } else {
        // No episode probe available, use highest similarity score
        bestMatch = scoredFeeds[0]?.feed || null;
        bestScore = scoredFeeds[0]?.score || 0;
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

      debugLog('[getFeedUrl] Final selection before iTunes fallback', {
        searchTerm,
        selectedFeed: feedUrl,
        bestScore,
        threshold,
        usedEpisodeProbe: Boolean(spotifyShowId && accessToken)
      });
    }
    
    // Fallback to Apple iTunes Lookup
    if (!feedUrl) {
      const itunesRes: globalThis.Response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=podcast&limit=1`
      );

      debugLog('[getFeedUrl] Falling back to iTunes lookup', { searchTerm });
      
      if (itunesRes.ok) {
        const itunesData: iTunesSearchResponse = await itunesRes.json() as iTunesSearchResponse;
        if (itunesData.results && itunesData.results.length > 0 && itunesData.results[0]?.feedUrl) {
          feedUrl = itunesData.results[0].feedUrl;
        }
      }
    }
    
    debugLog('[getFeedUrl] Returning feed URL', { searchTerm, feedUrl });

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