#!/usr/bin/env tsx

/**
 * Test script to verify enhanced RSS matching with "The Daily"
 * This script tests the real Spotify URL for "The Daily" to ensure
 * the enhanced matching algorithm works correctly in practice.
 */

import { getTitleSlug, getFeedUrl } from '../../packages/server/lib/utils';

async function testDailyMatching() {
  console.log('🧪 Testing enhanced RSS matching with "The Daily"...\n');
  
  const dailySpotifyUrl = 'https://open.spotify.com/show/44BcTpDWnfhcn02ADzs7iB';
  
  try {
    // Step 1: Get metadata from Spotify
    console.log('1️⃣ Fetching metadata from Spotify...');
    const metadata = await getTitleSlug(dailySpotifyUrl);
    console.log('✅ Metadata retrieved:');
    console.log(`   Name: "${metadata.name}"`);
    console.log(`   Description: "${metadata.description}"`);
    console.log('');
    
    // Step 2: Test enhanced RSS matching
    console.log('2️⃣ Testing enhanced RSS matching...');
    const rssUrl = await getFeedUrl(metadata);
    console.log('✅ RSS URL found:');
    console.log(`   ${rssUrl}`);
    console.log('');
    
    // Step 3: Verify it's the correct feed
    if (rssUrl && rssUrl.includes('podtrac.com')) {
      console.log('✅ SUCCESS: Enhanced matching correctly identified The Daily RSS feed!');
      console.log('   This is the official New York Times feed for "The Daily"');
    } else if (rssUrl) {
      console.log('⚠️  WARNING: Found RSS feed but may not be the optimal match');
      console.log(`   Found: ${rssUrl}`);
    } else {
      console.log('❌ ERROR: No RSS feed found');
    }
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testDailyMatching().catch(console.error); 