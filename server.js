require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.static('public'));
const {  getTitleSlug, getFeedUrl  } = require('./lib/utils');

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
    // Get feedUrl via PodcastIndex search with iTunes fallback
    let feedUrl;
    try {
      feedUrl = await getFeedUrl(slug);
    } catch (err) {
      console.error('getFeedUrl error:', err);
      return res.status(502).json({ error: err.message });
    }
    if (!feedUrl) {
      return res
        .status(404)
        .json({ error: 'Podcast has no public RSS; probably Spotify-exclusive.' });
    }
    req.feedUrl = feedUrl;
    return res.json({ feedUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});