#!/usr/bin/env node

/**
 * Debug script to test Taddy API with a specific RSS URL
 * 
 * Usage: 
 *   node debug-taddy-rss.js <RSS_URL> [EPISODE_GUID]
 * 
 * Example:
 *   node debug-taddy-rss.js "https://feeds.example.com/podcast.rss" "episode-guid-123"
 */

import { GraphQLClient } from 'graphql-request';

// Taddy API configuration
const TADDY_API_KEY = process.env.TADDY_API_KEY;
const TADDY_USER_ID = process.env.TADDY_USER_ID;
const TADDY_ENDPOINT = 'https://api.taddy.org/graphql';

if (!TADDY_API_KEY) {
  console.error('❌ TADDY_API_KEY environment variable is required');
  process.exit(1);
}

if (!TADDY_USER_ID) {
  console.error('❌ TADDY_USER_ID environment variable is required');
  process.exit(1);
}

async function debugTaddyRSS(rssUrl, episodeGuid = null) {
  console.log('🔍 Debugging Taddy API for RSS URL:', rssUrl);
  console.log('📋 Episode GUID:', episodeGuid || 'Not provided');
  console.log('');

  const client = new GraphQLClient(TADDY_ENDPOINT, {
    headers: {
      'X-API-KEY': TADDY_API_KEY,
      'X-USER-ID': TADDY_USER_ID,
      'User-Agent': 'listener-app/1.0.0 (GraphQL Business Client)',
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  try {
    // Step 1: Test podcast series lookup
    console.log('📡 Step 1: Looking up podcast series...');
    const seriesQuery = `
      query GetPodcastSeries($rssUrl: String!) {
        getPodcastSeries(rssUrl: $rssUrl) {
          uuid
          name
          rssUrl
          datePublished
          totalEpisodesCount
        }
      }
    `;

    const seriesResult = await client.request(seriesQuery, { rssUrl });
    console.log('📊 Series Query Result:', JSON.stringify(seriesResult, null, 2));
    
    if (!seriesResult.getPodcastSeries) {
      console.log('❌ No podcast series found - this would result in no_match');
      return;
    }

    const series = seriesResult.getPodcastSeries;
    console.log('✅ Podcast series found:', series.name);
    console.log('🆔 Series UUID:', series.uuid);
    console.log('📅 Published:', new Date(series.datePublished * 1000).toISOString());
    console.log('📊 Total Episodes:', series.totalEpisodesCount);
    console.log('');

    // Step 2: Test episode lookup (if GUID provided)
    if (episodeGuid) {
      console.log('📡 Step 2: Looking up specific episode...');
      const episodeQuery = `
        query GetPodcastEpisode($guid: String!, $seriesUuidForLookup: ID!) {
          getPodcastEpisode(guid: $guid, seriesUuidForLookup: $seriesUuidForLookup) {
            uuid
            name
            guid
            datePublished
            duration
            taddyTranscribeStatus
            transcriptWithSpeakersAndTimecodes {
              id
              text
              speaker
              startTimecode
              endTimecode
            }
          }
        }
      `;

      const episodeResult = await client.request(episodeQuery, { 
        guid: episodeGuid,
        seriesUuidForLookup: series.uuid
      });
      console.log('📊 Episode Query Result:', JSON.stringify(episodeResult, null, 2));

      if (!episodeResult.getPodcastEpisode) {
        console.log('❌ No episode found - this would result in no_match');
        return;
      }

      const episode = episodeResult.getPodcastEpisode;
      console.log('✅ Episode found:', episode.name);
      console.log('🆔 Episode UUID:', episode.uuid);
      console.log('📅 Published:', new Date(episode.datePublished * 1000).toISOString());
      console.log('⏱️ Duration:', episode.duration, 'seconds');
      console.log('📝 Transcribe Status:', episode.taddyTranscribeStatus);
      
      if (episode.transcriptWithSpeakersAndTimecodes) {
        console.log('📄 Transcript segments:', episode.transcriptWithSpeakersAndTimecodes.length);
        if (episode.transcriptWithSpeakersAndTimecodes.length > 0) {
          console.log('📝 First segment:', episode.transcriptWithSpeakersAndTimecodes[0]);
        }
      } else {
        console.log('📄 No transcript available');
      }
    }

    // Step 3: Test search as fallback
    console.log('');
    console.log('📡 Step 3: Testing search fallback...');
    const searchQuery = `
      query SearchPodcastSeries($searchTerm: String!) {
        search(searchTerm: $searchTerm) {
          podcastSeries {
            uuid
            name
            rssUrl
          }
        }
      }
    `;

    // Extract search term from RSS URL
    const searchTerm = extractSearchTerm(rssUrl);
    console.log('🔍 Search term:', searchTerm);

    const searchResult = await client.request(searchQuery, { searchTerm });
    console.log('📊 Search Result:', JSON.stringify(searchResult, null, 2));

    if (searchResult.search?.podcastSeries) {
      console.log('🔍 Found', searchResult.search.podcastSeries.length, 'series via search');
      searchResult.search.podcastSeries.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.name} (${s.rssUrl})`);
      });
    }

  } catch (error) {
    console.error('❌ API Error:', error.message);
    
    if (error.response) {
      console.error('📊 Response data:', JSON.stringify(error.response, null, 2));
    }
    
    if (error.request) {
      console.error('🌐 Request details:', error.request);
    }
  }
}

function extractSearchTerm(rssUrl) {
  try {
    const url = new URL(rssUrl);
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);
    const lastPart = pathParts[pathParts.length - 1];
    return lastPart
      .replace(/\.(xml|rss)$/i, '')
      .replace(/[-_]/g, ' ')
      .toLowerCase() || 'podcast';
  } catch (_error) {
    return 'podcast';
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node debug-taddy-rss.js <RSS_URL> [EPISODE_GUID]');
  console.error('');
  console.error('Example:');
  console.error('  node debug-taddy-rss.js "https://feeds.example.com/podcast.rss"');
  console.error('  node debug-taddy-rss.js "https://feeds.example.com/podcast.rss" "episode-guid-123"');
  process.exit(1);
}

const rssUrl = args[0];
const episodeGuid = args[1] || null;

debugTaddyRSS(rssUrl, episodeGuid)
  .then(() => {
    console.log('');
    console.log('✅ Debug complete');
  })
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  }); 