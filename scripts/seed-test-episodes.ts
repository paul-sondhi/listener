#!/usr/bin/env tsx

/**
 * Seed test episodes for debugging transcript worker
 * Uses actual failing episode data from production logs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedTestEpisodes() {
  console.log('🌱 Seeding test episodes for transcript worker debugging...');

  try {
    // Use existing Ringer Fantasy Football Show from database
    const testShowId = 'cd1a9680-aafc-42d8-a3fc-2fae75f3747b';
    const testRssUrl = 'https://feeds.megaphone.fm/ringer-fantasy-football-show';

    console.log('📺 Using existing podcast show: The Ringer Fantasy Football Show');

    // Create test episode from production failure logs (but with existing show)
    const testEpisode = {
      id: '0eb4e63a-c0ad-4589-a617-0c8415bba566', // From production logs
      show_id: testShowId,
      guid: '206f6ce8-5006-11f0-a60f-4f75f492a976', // From production logs
      episode_url: 'https://pdst.fm/e/traffic.megaphone.fm/GLT7101717990.mp3?updated=1750666870',
      title: 'Test Episode for Transcript Worker Debugging',
      description: 'Test episode for transcript worker debugging - uses failing GUID from production',
      pub_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      duration_sec: 3600 // 1 hour
    };

    console.log('📻 Upserting test episode...');
    const { error: episodeError } = await supabase
      .from('podcast_episodes')
      .upsert(testEpisode, { onConflict: 'id' });

    if (episodeError) {
      console.error('Error upserting episode:', episodeError);
      return;
    }

    // Clean up any existing transcript records for this episode
    console.log('🧹 Cleaning up existing transcript records...');
    const { error: cleanupError } = await supabase
      .from('transcripts')
      .delete()
      .eq('episode_id', testEpisode.id);

    if (cleanupError) {
      console.error('Error cleaning up transcripts:', cleanupError);
      return;
    }

    console.log('✅ Test data seeded successfully!');
    console.log('📊 Test episode details:');
    console.log(`   - Episode ID: ${testEpisode.id}`);
    console.log(`   - Show ID: ${testShowId}`);
    console.log(`   - GUID: ${testEpisode.guid}`);
    console.log(`   - RSS URL: ${testRssUrl}`);
    console.log(`   - Pub Date: ${testEpisode.pub_date}`);
    console.log('');
    console.log('🔧 You can now test the transcript worker with:');
    console.log('   npm run dev:job transcript_worker');
    console.log('');
    console.log('🗑️  To clean up test data, run:');
    console.log('   npm run clean:test-episodes');

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  }
}

async function cleanupTestEpisodes() {
  console.log('🗑️  Cleaning up test episodes...');

  try {
    const testEpisodeId = '0eb4e63a-c0ad-4589-a617-0c8415bba566';

    // Clean up transcripts first (foreign key constraint)
    await supabase.from('transcripts').delete().eq('episode_id', testEpisodeId);
    
    // Clean up episode (don't delete the show since it's a real one)
    await supabase.from('podcast_episodes').delete().eq('id', testEpisodeId);

    console.log('✅ Test data cleaned up successfully!');
  } catch (error) {
    console.error('❌ Error cleaning up test data:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const command = process.argv[2];

if (command === 'clean') {
  cleanupTestEpisodes();
} else {
  seedTestEpisodes();
} 