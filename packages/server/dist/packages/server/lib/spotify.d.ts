/**
 * Get a Spotify access token using client credentials flow
 * Implements token caching to avoid unnecessary API calls
 * @returns {Promise<string>} The access token
 * @throws {Error} If token request fails
 */
declare function getSpotifyAccessToken(): Promise<string>;
export { getSpotifyAccessToken };
//# sourceMappingURL=spotify.d.ts.map