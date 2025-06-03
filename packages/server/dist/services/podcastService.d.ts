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
export declare class PodcastError extends Error {
    statusCode: number;
    constructor(message: string, statusCode?: number);
}
/**
 * Service class for handling all podcast-related operations
 */
declare class PodcastService {
    /**
     * Validates if the provided URL is a valid Spotify podcast URL
     * @param {string} url - The Spotify URL to validate
     * @returns {boolean} - True if valid, false otherwise
     */
    validateSpotifyUrl(url: string): boolean;
    /**
     * Gets the podcast slug from a Spotify URL
     * @param {string} url - The Spotify URL
     * @returns {Promise<string>} - The podcast slug
     * @throws {PodcastError} - If the slug cannot be retrieved
     */
    getPodcastSlug(url: string): Promise<string>;
    /**
     * Gets the RSS feed URL for a podcast
     * @param {string} slug - The podcast slug
     * @returns {Promise<string>} - The RSS feed URL
     * @throws {PodcastError} - If the feed URL cannot be retrieved
     */
    getPodcastFeed(slug: string): Promise<string>;
    /**
     * Fetches the RSS feed content
     * @param {string} feedUrl - The RSS feed URL
     * @returns {Promise<string>} - The RSS feed content
     * @throws {PodcastError} - If the feed cannot be fetched
     */
    fetchRssFeed(feedUrl: string): Promise<string>;
    /**
     * Parses RSS feed content into an object
     * @param {string} rssText - The RSS feed content
     * @returns {RssFeed} - The parsed RSS feed
     * @throws {PodcastError} - If the feed cannot be parsed
     */
    parseRssFeed(rssText: string): RssFeed;
    /**
     * Extracts the MP3 URL from the RSS feed data
     * @param {RssFeed} rssData - The parsed RSS feed data
     * @returns {string} - The MP3 URL
     * @throws {PodcastError} - If the MP3 URL cannot be found
     */
    extractMp3Url(rssData: RssFeed): string;
}
declare const _default: PodcastService;
export default _default;
//# sourceMappingURL=podcastService.d.ts.map