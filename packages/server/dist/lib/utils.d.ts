interface AuthHeaders {
    'X-Auth-Key': string;
    'X-Auth-Date': string;
    'Authorization': string;
}
/**
 * Generate authentication headers for PodcastIndex API
 * @returns {AuthHeaders} The authentication headers
 * @throws {Error} If API credentials are missing
 */
declare function getAuthHeaders(): AuthHeaders;
/**
 * Get a slugified title from a Spotify show URL
 * @param {string} spotifyUrl - The Spotify show URL
 * @returns {Promise<string>} The slugified show title
 * @throws {Error} If the URL is invalid or the show cannot be fetched
 */
declare function getTitleSlug(spotifyUrl: string): Promise<string>;
/**
 * Get the RSS feed URL for a podcast by searching PodcastIndex and iTunes
 * @param {string} slug - The podcast slug/title to search for
 * @returns {Promise<string | null>} The RSS feed URL or null if not found
 * @throws {Error} If the search fails
 */
declare function getFeedUrl(slug: string): Promise<string | null>;
/**
 * Compute Jaccard similarity between two strings (by word overlap)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
declare function jaccardSimilarity(a: string, b: string): number;
export { getAuthHeaders, getTitleSlug, getFeedUrl, jaccardSimilarity };
//# sourceMappingURL=utils.d.ts.map