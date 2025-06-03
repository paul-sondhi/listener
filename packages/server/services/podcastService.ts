// Import required dependencies
import { XMLParser } from 'fast-xml-parser';
import { getTitleSlug, getFeedUrl } from '../lib/utils.js';

// Interface for RSS feed structure
interface RssEnclosure {
  '@_url'?: string;
  url?: string;
  '@_type'?: string;
  '@_length'?: string;
}

interface RssItem {
  title: string;
  description: string;
  pubDate: string;
  enclosure: RssEnclosure;
  guid: string;
  [key: string]: unknown;
}

interface RssChannel {
  title: string;
  description: string;
  item: RssItem | RssItem[];
  [key: string]: unknown;
}

interface RssFeed {
  rss: {
    channel: RssChannel;
    [key: string]: unknown;
  };
}

/**
 * Custom error class for podcast-related errors
 */
export class PodcastError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'PodcastError';
    this.statusCode = statusCode;
  }
}

/**
 * Service class for handling all podcast-related operations
 */
class PodcastService {
  /**
   * Validates if the provided URL is a valid Spotify podcast URL
   * @param {string} url - The Spotify URL to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  validateSpotifyUrl(url: string): boolean {
    const spotifyRegex: RegExp = /^https:\/\/open\.spotify\.com\/show\/[A-Za-z0-9]+(?:\?[^\s]*)?$/;
    return spotifyRegex.test(url);
  }

  /**
   * Gets the podcast slug from a Spotify URL
   * @param {string} url - The Spotify URL
   * @returns {Promise<string>} - The podcast slug
   * @throws {PodcastError} - If the slug cannot be retrieved
   */
  async getPodcastSlug(url: string): Promise<string> {
    try {
      return await getTitleSlug(url);
    } catch (error: unknown) {
      const err = error as Error;
      throw new PodcastError(`Failed to get podcast slug: ${err.message}`, 500);
    }
  }

  /**
   * Gets the RSS feed URL for a podcast
   * @param {string} slug - The podcast slug
   * @returns {Promise<string>} - The RSS feed URL
   * @throws {PodcastError} - If the feed URL cannot be retrieved
   */
  async getPodcastFeed(slug: string): Promise<string> {
    try {
      const feedUrl: string | null = await getFeedUrl(slug);
      if (!feedUrl) {
        throw new PodcastError('Podcast has no public RSS; probably Spotify-exclusive.', 404);
      }
      return feedUrl;
    } catch (error: unknown) {
      const err = error as Error;
      throw new PodcastError(`Failed to get podcast feed: ${err.message}`, 502);
    }
  }

  /**
   * Fetches the RSS feed content
   * @param {string} feedUrl - The RSS feed URL
   * @returns {Promise<string>} - The RSS feed content
   * @throws {PodcastError} - If the feed cannot be fetched
   */
  async fetchRssFeed(feedUrl: string): Promise<string> {
    try {
      const response: globalThis.Response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status}`);
      }
      return await response.text();
    } catch (error: unknown) {
      const err = error as Error;
      throw new PodcastError(`Failed to fetch RSS feed: ${err.message}`, 502);
    }
  }

  /**
   * Parses RSS feed content into an object
   * @param {string} rssText - The RSS feed content
   * @returns {RssFeed} - The parsed RSS feed
   * @throws {PodcastError} - If the feed cannot be parsed
   */
  parseRssFeed(rssText: string): RssFeed {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      return parser.parse(rssText) as RssFeed;
    } catch (error: unknown) {
      const err = error as Error;
      throw new PodcastError(`Failed to parse RSS feed: ${err.message}`, 500);
    }
  }

  /**
   * Extracts the MP3 URL from the RSS feed data
   * @param {RssFeed} rssData - The parsed RSS feed data
   * @returns {string} - The MP3 URL
   * @throws {PodcastError} - If the MP3 URL cannot be found
   */
  extractMp3Url(rssData: RssFeed): string {
    try {
      const items: RssItem | RssItem[] = rssData.rss.channel.item;
      const firstItem: RssItem | undefined = Array.isArray(items) ? items[0] : items;
      
      if (!firstItem) {
        throw new Error('No items found in RSS feed');
      }
      
      const enclosure: RssEnclosure = firstItem.enclosure;
      const mp3Url: string | undefined = enclosure && (enclosure['@_url'] || enclosure.url);
      
      if (!mp3Url) {
        throw new Error('No enclosure URL found in first item');
      }
      
      return mp3Url;
    } catch (error: unknown) {
      const err = error as Error;
      throw new PodcastError(`Failed to extract MP3 URL: ${err.message}`, 500);
    }
  }
}

// Export a singleton instance
export default new PodcastService(); 