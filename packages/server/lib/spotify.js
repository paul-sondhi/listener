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
  const creds = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({ grant_type: 'client_credentials' })
  });
  if (!res.ok) {
    throw new Error('Failed to get Spotify access token');
  }
  const data = await res.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = now + (data.expires_in * 1000) - 60000; // refresh 1m early
  return spotifyToken;
}

export { getSpotifyAccessToken };
