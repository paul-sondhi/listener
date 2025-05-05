require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.static('public'));
const {  getTitleSlug, getFeedUrl  } = require('./lib/utils');
// Import XML parser for parsing RSS feeds (Step 4.1)
const { XMLParser } = require('fast-xml-parser');

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
    // Fetch RSS feed as text
    let rssText;
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch RSS: ${response.status}`);
      }
      rssText = await response.text();
    } catch (err) {
      console.error('RSS fetch error:', err);
      return res.status(502).json({ error: err.message });
    }
    //Parse rssText with fast-xml-parser
    let rssObj;
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      rssObj = parser.parse(rssText);
    } catch (err) {
      console.error('RSS parse error:', err);
      return res.status(500).json({ error: err.message });
    }
    // Grab the first <item> (latest episode)
    let items = rssObj.rss.channel.item;
    let firstItem = Array.isArray(items) ? items[0] : items;
    // Read <enclosure> URL and store direct MP3 link
    const enclosure = firstItem.enclosure;
    const mp3Url = enclosure && (enclosure['@_url'] || enclosure.url);
    if (!mp3Url) {
      return res.status(500).json({ error: 'No enclosure URL found in first item.' });
    }
    // For now, return MP3 URL to test Step 4.4
    return res.json({ mp3Url });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});