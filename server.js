require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const app = express();
app.use(express.static('public'));
const _nf = require('node-fetch');
const fetch = _nf.default || _nf;
const { getSpotifyAccessToken } = require('./spotify');

function getAuthHeaders() {
    // Read key/secret
    const key = process.env.PODCASTINDEX_KEY;
    const secret = process.env.PODCASTINDEX_SECRET;
    // Unix timestamp in seconds
    const date = Math.floor(Date.now() / 1000).toString();
    // HMAC-SHA1 of (key + date) using your secret
    const signature = crypto
      .createHmac('sha1', secret)
      .update(key + date)
      .digest('hex');
    // Return the three required headers
    return {
      'X-Auth-Key': key,
      'X-Auth-Date': date,
      'Authorization': signature
    };
};

app.get('/api/download', async (req, res) => {
    // Read the `url` param
    const spotifyUrl = req.query.url;
    if (!spotifyUrl) {
      return res
        .status(400)
        .json({ error: 'Missing `url` query parameter.' });
    }
    // Simple Spotify URL validation
    const spotifyRegex = /^https:\/\/open\.spotify\.com\/show\/[A-Za-z0-9]+(?:\?[^\s]*)?$/;
    if (!spotifyRegex.test(spotifyUrl)) {
      return res
        .status(400)
        .json({ error: 'Invalid URL; must be a Spotify podcast show title.' });
    }
    // Get the podcast show slug
    let slug;
    try {
      slug = await getTitleSlug(spotifyUrl);
    } catch (err) {
      console.error('getTitleSlug error:', err);
      return res.status(500).json({ error: err.message });
    }
    // Return a success message if the above validations pass
    return res.json({ slug });
    // return res.json({ message: '✅ Spotify URL looks good!' });
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});