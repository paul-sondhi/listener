import _nf from 'node-fetch';
const fetch = _nf.default || _nf;
import querystring from 'querystring';

// --- Spotify Web API token caching ---
let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyToken && now < spotifyTokenExpiresAt) {
    return spotifyToken;
  }

  // --- Start Temporary Debugging Logs ---
  console.log('DEBUG: Attempting to get Spotify token.');
  console.log(`DEBUG: SPOTIFY_CLIENT_ID loaded: ${process.env.SPOTIFY_CLIENT_ID || 'UNDEFINED'}`);
  console.log(`DEBUG: SPOTIFY_CLIENT_SECRET length: ${process.env.SPOTIFY_CLIENT_SECRET ? process.env.SPOTIFY_CLIENT_SECRET.length : 'UNDEFINED or 0'}`);
  // --- End Temporary Debugging Logs ---

  const creds = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  // Log the Client ID being used (first 5 chars) to help verify it's loaded
  // console.log(`Attempting to get Spotify token with Client ID starting: ${process.env.SPOTIFY_CLIENT_ID ? process.env.SPOTIFY_CLIENT_ID.substring(0, 5) : 'UNDEFINED'}`); // Keep this or remove if redundant with full ID log

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({ grant_type: 'client_credentials' })
  });
  if (!res.ok) {
    const errorBody = await res.text(); // Read response body as text
    console.error('Spotify Access Token Request Failed - Status:', res.status);
    console.error('Spotify Access Token Request Failed - Body:', errorBody);
    throw new Error(`Failed to get Spotify access token. Status: ${res.status}. Response: ${errorBody}`);
  }
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + (data.expires_in * 1000) - 60000; // refresh 1m early
  return spotifyToken;
}

export { getSpotifyAccessToken };
