#!/usr/bin/env node

/**
 * Extract episode GUIDs from an RSS feed
 * 
 * Usage: node extract-episode-guids.js <RSS_URL>
 */

import fetch from 'node-fetch';

async function extractEpisodeGuids(rssUrl) {
  try {
    console.log('📡 Fetching RSS feed:', rssUrl);
    
    const response = await fetch(rssUrl);
    const xmlText = await response.text();
    
    console.log('📊 RSS Feed Content Length:', xmlText.length, 'characters');
    console.log('');
    
    // Extract GUIDs using regex
    const guidMatches = xmlText.match(/<guid[^>]*>(.*?)<\/guid>/gi);
    
    if (!guidMatches || guidMatches.length === 0) {
      console.log('❌ No GUIDs found in RSS feed');
      return;
    }
    
    console.log(`✅ Found ${guidMatches.length} episode GUIDs:`);
    console.log('');
    
    guidMatches.forEach((match, index) => {
      // Extract the actual GUID value
      const guidValue = match.replace(/<guid[^>]*>(.*?)<\/guid>/i, '$1');
      console.log(`${index + 1}. ${guidValue}`);
    });
    
    console.log('');
    console.log('💡 To test a specific episode, use:');
    console.log(`   node packages/server/scripts/debug-taddy-rss.js "${rssUrl}" "GUID_FROM_ABOVE"`);
    
  } catch (error) {
    console.error('❌ Error fetching RSS feed:', error.message);
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('❌ Usage: node extract-episode-guids.js <RSS_URL>');
  console.error('');
  console.error('Example:');
  console.error('  node extract-episode-guids.js "https://anchor.fm/s/1035b1568/podcast/rss"');
  process.exit(1);
}

const rssUrl = args[0];
extractEpisodeGuids(rssUrl); 