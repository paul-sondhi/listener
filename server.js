require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const app = express();
app.use(express.static('public'));
const _nf = require('node-fetch');
const fetch = _nf.default || _nf;

function getAuthHeaders() {
    // Read key/secret
    const key = process.env.PI_KEY;
    const secret = process.env.PI_SECRET;
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
    return res
        .status(500)
        .json({ error: 'Failed to fetch title from Spotify oEmbed.' });
    }
    // Return a success message if the above validations pass
    return res.json({ slug });
    // return res.json({ message: '✅ Spotify URL looks good!' });
});

async function getTitleSlug(spotifyUrl) {
    // Fetch oEmbed JSON
    const res = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`
    );
    if (!res.ok) {
      throw new Error('oEmbed lookup failed');
    }
    const { title } = await res.json();
    // Normalize title
    let slug = title
      .toLowerCase() // lower-case
      .replace(/\|.*$/, '') // remove “| Podcast” and anything after
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // strip emojis
      .trim();                                // trim whitespace
  
    return slug;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});