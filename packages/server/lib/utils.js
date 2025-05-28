import { getSpotifyAccessToken } from './spotify.js';
import crypto from 'crypto';
import _nf from 'node-fetch';
const fetch = _nf.default || _nf;

function getAuthHeaders() {
    // Read key/secret
    const key = process.env.PODCASTINDEX_KEY;
    const secret = process.env.PODCASTINDEX_SECRET;
    // Unix timestamp in seconds
    const date = Math.floor(Date.now() / 1000).toString();
    // HMAC-SHA1 of (key + secret + date)
    const signature = crypto
      .createHash('sha1')
      .update(key + secret + date)
      .digest('hex');
    // Return the three required headers
    return {
      'X-Auth-Key': key,
      'X-Auth-Date': date,
      'Authorization': signature
    };
};

async function getTitleSlug(spotifyUrl) {
    // Use Spotify Web API to fetch the show name and slugify it
    const cleanUrl = spotifyUrl.split('?')[0];
    const { pathname } = new URL(cleanUrl);
    const [, type, id] = pathname.split('/');
    if (type !== 'show') {
      throw new Error('getTitleSlug: URL is not a Spotify show link');
    }
    // Get an access token
    const token = await getSpotifyAccessToken();
    // Fetch show metadata from Spotify API
    const apiRes = await fetch(`https://api.spotify.com/v1/shows/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!apiRes.ok) {
      throw new Error('Failed to fetch show from Spotify API');
    }
    const { name } = await apiRes.json();
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

async function getFeedUrl(slug) {
    // Fetch feed URL for a given slug, using PodcastIndex with iTunes fallback
    const authHeaders = getAuthHeaders();
    const searchUrl = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(slug)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        ...authHeaders,
        'User-Agent': process.env.USER_AGENT
      }
    });
    if (!searchRes.ok) {
      throw new Error(`PodcastIndex search failed with status ${searchRes.status}`);
    }
    const { feeds } = await searchRes.json();
    let feedUrl = null;
    if (feeds && feeds.length > 0) {
      for (const feed of feeds) {
        if (jaccardSimilarity(feed.title.toLowerCase(), slug) >= 0.8) {
          feedUrl = feed.url;
          break;
        }
      }
      if (!feedUrl) {
        feedUrl = feeds[0].url;
      }
    }
    // Fallback to Apple iTunes Lookup
    if (!feedUrl) {
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(slug)}&media=podcast&limit=1`
      );
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results && itunesData.results.length > 0 && itunesData.results[0].feedUrl) {
          feedUrl = itunesData.results[0].feedUrl;
        }
      }
    }
    return feedUrl;
  }

// Compute Jaccard similarity between two strings (by word overlap)
function jaccardSimilarity(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

export { getAuthHeaders, getTitleSlug, getFeedUrl, jaccardSimilarity };