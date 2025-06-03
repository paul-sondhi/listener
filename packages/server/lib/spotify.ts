import querystring from 'querystring';

// Interface for Spotify token response
interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// --- Spotify Web API token caching ---
let spotifyToken: string | null = null;
let spotifyTokenExpiresAt: number = 0;

/**
 * Get a Spotify access token using client credentials flow
 * Implements token caching to avoid unnecessary API calls
 * @returns {Promise<string>} The access token
 * @throws {Error} If token request fails
 */
async function getSpotifyAccessToken(): Promise<string> {
  const now: number = Date.now();
  
  // Return cached token if still valid
  if (spotifyToken && now < spotifyTokenExpiresAt) {
    return spotifyToken;
  }

  // --- Start Temporary Debugging Logs ---
  // console.log('DEBUG: Attempting to get Spotify token.');
  // console.log(`DEBUG: SPOTIFY_CLIENT_ID loaded: ${process.env.SPOTIFY_CLIENT_ID || 'UNDEFINED'}`);
  // console.log(`DEBUG: SPOTIFY_CLIENT_SECRET length: ${process.env.SPOTIFY_CLIENT_SECRET ? process.env.SPOTIFY_CLIENT_SECRET.length : 'UNDEFINED or 0'}`);
  // --- End Temporary Debugging Logs ---

  // Validate environment variables
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in environment variables');
  }

  // Create base64 encoded credentials
  const creds: string = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  // Request access token from Spotify
  const res: globalThis.Response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({ grant_type: 'client_credentials' })
  });

  if (!res.ok) {
    const errorBody: string = await res.text(); // Read response body as text
    console.error('Spotify Access Token Request Failed - Status:', res.status);
    console.error('Spotify Access Token Request Failed - Body:', errorBody);
    throw new Error(`Failed to get Spotify access token. Status: ${res.status}. Response: ${errorBody}`);
  }

  const data: SpotifyTokenResponse = await res.json() as SpotifyTokenResponse;
  
  // Cache the token with expiration
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + (data.expires_in * 1000) - 60000; // refresh 1m early
  
  return spotifyToken;
}

export { getSpotifyAccessToken }; 