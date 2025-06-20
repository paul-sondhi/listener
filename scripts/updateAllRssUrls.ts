#!/usr/bin/env ts-node

/**
 * Update All RSS URLs Script
 * Purpose: Fix all existing podcast_shows rows to have proper RSS URLs
 * 
 * This script addresses the situation where:
 * - Some rows have Spotify URLs incorrectly stored in rss_url column
 * - We want to update ALL rows to have proper RSS feed URLs
 * - Ensures data consistency for future user subscriptions
 * 
 * This script:
 * 1. Queries ALL podcast_shows regardless of current rss_url value
 * 2. For each show, attempts to find the actual RSS feed URL
 * 3. Updates rss_url with real RSS feed URL if found, keeps Spotify URL as fallback
 * 4. Updates title with actual show name from Spotify API
 * 5. Logs progress and results for verification
 * 
 * Run carefully: This will make API calls for every row in podcast_shows table
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { getTitleSlug, getFeedUrl } from '../packages/server/lib/utils.js';

/**
 * Get the original title from Spotify (without normalization)
 * @param {string} spotifyUrl - The Spotify show URL
 * @returns {Promise<string>} The original show title from Spotify
 */
async function getOriginalSpotifyTitle(spotifyUrl: string): Promise<string> {
  // Similar to getTitleSlug but returns the original title without normalization
  const cleanUrl: string = spotifyUrl.split('?')[0]!;
  const { pathname } = new URL(cleanUrl);
  const [, type, id] = pathname.split('/');
  
  if (type !== 'show') {
    throw new Error('getOriginalSpotifyTitle: URL is not a Spotify show link');
  }
  
  // Get Spotify access token (need to implement this)
  const token: string = await getSpotifyAccessToken();
  
  // Fetch show metadata from Spotify API
  const apiRes: globalThis.Response = await fetch(`https://api.spotify.com/v1/shows/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!apiRes.ok) {
    throw new Error('Failed to fetch show from Spotify API');
  }
  
  const showData: any = await apiRes.json();
  const { name } = showData;
  
  if (!name) {
    throw new Error('No show name returned from Spotify API');
  }
  
  // Return the original title without normalization
  return name;
}

/**
 * Get Spotify access token using client credentials flow
 */
async function getSpotifyAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not found in environment variables');
  }
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials'
  });
  
  if (!response.ok) {
    throw new Error('Failed to get Spotify access token');
  }
  
  const data = await response.json();
  return data.access_token;
}

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface PodcastShow {
  id: string;
  spotify_url: string;
  title: string | null;
  rss_url: string | null;
  description: string | null;
  image_url: string | null;
  last_updated: string | null;
}

interface UpdateResult {
  success: boolean;
  totalShows: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedShows: number;
  rssFoundCount: number;
  rssNotFoundCount: number;
  errors: Array<{
    showId: string;
    spotifyUrl: string;
    error: string;
  }>;
}

class RssUrlUpdater {
  private supabase: SupabaseClient;
  private results: UpdateResult;
  private readonly batchSize = 10; // Process in batches to be gentle on APIs
  private readonly delayBetweenBatches = 5000; // 5 seconds between batches
  private readonly delayBetweenShows = 1500; // 1.5 seconds between individual shows

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'PODCASTINDEX_KEY',
      'PODCASTINDEX_SECRET'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    this.results = {
      success: false,
      totalShows: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      skippedShows: 0,
      rssFoundCount: 0,
      rssNotFoundCount: 0,
      errors: []
    };
  }

  /**
   * Main update execution
   */
  async run(): Promise<UpdateResult> {
    console.log('🔄 Starting RSS URL update process for ALL podcast_shows...');
    console.log('⚠️  This will attempt to find RSS feeds for every show in the database');
    
    // Safety check: Warn if running in production-like environment
    if (process.env.NODE_ENV === 'production' || process.env.SUPABASE_URL?.includes('supabase.co')) {
      console.warn('⚠️  WARNING: This script is running in a production environment!');
      console.warn('⚠️  This will make many API calls to PodcastIndex, iTunes, and Spotify.');
      console.warn('⚠️  Consider running during off-peak hours to avoid rate limits.');
      console.warn('⚠️  Continuing in 10 seconds... Press Ctrl+C to cancel.');
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    const startTime = Date.now();

    try {
      // Step 1: Query all shows that need updating
      console.log('📊 Querying all podcast_shows...');
      const allShows = await this.getAllShows();
      this.results.totalShows = allShows.length;

      if (allShows.length === 0) {
        console.log('✅ No shows found in database. Nothing to update!');
        this.results.success = true;
        return this.results;
      }

      console.log(`📋 Found ${allShows.length} shows to process`);
      console.log(`🔄 Processing in batches of ${this.batchSize} with ${this.delayBetweenBatches/1000}s delays`);

      // Step 2: Process shows in batches
      for (let i = 0; i < allShows.length; i += this.batchSize) {
        const batch = allShows.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(allShows.length / this.batchSize);
        
        console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (shows ${i + 1}-${Math.min(i + this.batchSize, allShows.length)})`);
        
        await this.processBatch(batch, i + 1);
        
        // Delay between batches (except for the last batch)
        if (i + this.batchSize < allShows.length) {
          console.log(`⏳ Waiting ${this.delayBetweenBatches/1000}s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
        }
      }

      // Step 3: Summary
      const duration = Math.round((Date.now() - startTime) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      
      console.log('\n📊 RSS URL Update Summary:');
      console.log(`  Total shows processed: ${this.results.totalShows}`);
      console.log(`  Successful updates: ${this.results.successfulUpdates}`);
      console.log(`  Failed updates: ${this.results.failedUpdates}`);
      console.log(`  RSS feeds found: ${this.results.rssFoundCount}`);
      console.log(`  RSS feeds not found (using Spotify URL): ${this.results.rssNotFoundCount}`);
      console.log(`  Duration: ${minutes}m ${seconds}s`);

      if (this.results.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        this.results.errors.slice(0, 10).forEach((error, index) => {
          console.log(`  ${index + 1}. Show ID: ${error.showId}`);
          console.log(`     Spotify URL: ${error.spotifyUrl}`);
          console.log(`     Error: ${error.error}`);
        });
        
        if (this.results.errors.length > 10) {
          console.log(`  ... and ${this.results.errors.length - 10} more errors`);
        }
      }

      this.results.success = this.results.failedUpdates < this.results.totalShows * 0.1; // Success if <10% failures
      
      if (this.results.success) {
        console.log('\n🎉 RSS URL update completed successfully!');
        console.log('✅ Database is now ready with proper RSS URLs');
      } else {
        console.log('\n⚠️ RSS URL update completed with significant errors.');
        console.log('❌ Review errors and consider re-running for failed shows.');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.results.success = false;
      console.error('❌ Update process failed:', errorMessage);
      throw error;
    }

    return this.results;
  }

  /**
   * Query ALL podcast_shows rows
   */
  private async getAllShows(): Promise<PodcastShow[]> {
    const { data, error } = await this.supabase
      .from('podcast_shows')
      .select('id, spotify_url, title, rss_url, description, image_url, last_updated')
      .order('id', { ascending: true }); // Process by ID order

    if (error) {
      throw new Error(`Failed to query podcast_shows: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Process a batch of shows
   */
  private async processBatch(batch: PodcastShow[], startIndex: number): Promise<void> {
    for (let i = 0; i < batch.length; i++) {
      const show = batch[i];
      if (!show) continue;
      
      const overallIndex = startIndex + i - 1;
      const progress = `[${overallIndex + 1}/${this.results.totalShows}]`;
      
      console.log(`${progress} Processing: ${show.title || 'Untitled'}`);
      console.log(`  Current rss_url: ${show.rss_url}`);

      try {
        const updatedShow = await this.processShow(show);
        this.results.successfulUpdates++;
        
        if (updatedShow.foundRssUrl) {
          this.results.rssFoundCount++;
          console.log(`  ✅ Updated with RSS feed: ${updatedShow.rssUrl}`);
        } else {
          this.results.rssNotFoundCount++;
          console.log(`  ✅ Updated (no RSS found, using Spotify URL): ${updatedShow.rssUrl}`);
        }
        
      } catch (error) {
        this.results.failedUpdates++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.results.errors.push({
          showId: show.id,
          spotifyUrl: show.spotify_url,
          error: errorMessage
        });
        console.log(`  ❌ Failed: ${errorMessage}`);
      }

      // Delay between individual shows within batch
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenShows));
      }
    }
  }

  /**
   * Process a single show: get proper RSS URL and title, then update database
   */
  private async processShow(show: PodcastShow): Promise<{ foundRssUrl: boolean; rssUrl: string; title: string }> {
    let actualTitle = show.title || 'Unknown Show';
    let rssUrl = show.spotify_url; // Default fallback
    let foundRssUrl = false;

    try {
      // Step 1: Get original title from Spotify API (preserving case and formatting)
      const originalTitle = await getOriginalSpotifyTitle(show.spotify_url);
      actualTitle = originalTitle;
      console.log(`  Original title from Spotify: "${originalTitle}"`);

      // Step 2: Get normalized slug for RSS feed searching
      const titleSlug = await getTitleSlug(show.spotify_url);
      console.log(`  Search slug: "${titleSlug}"`);

      // Step 3: Try to find RSS feed URL using the normalized slug
      const discoveredRssUrl = await getFeedUrl(titleSlug);
      
      if (discoveredRssUrl) {
        rssUrl = discoveredRssUrl;
        foundRssUrl = true;
        console.log(`  Found RSS feed: ${rssUrl}`);
      } else {
        console.log(`  No RSS feed found, keeping Spotify URL as fallback`);
      }

    } catch (apiError) {
      // If API calls fail, we'll still update what we can
      console.log(`  API lookup failed, using existing data: ${(apiError as Error).message}`);
    }

    // Step 4: Update database with new information
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('podcast_shows')
      .update({ 
        rss_url: rssUrl,
        title: actualTitle,
        last_updated: now
      })
      .eq('id', show.id);

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }

    return { foundRssUrl, rssUrl, title: actualTitle };
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🚀 RSS URL Update Script Starting...');
  console.log('This script will update ALL podcast_shows with proper RSS URLs');
  console.log('');
  
  try {
    const updater = new RssUrlUpdater();
    const result = await updater.run();
    
    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS:');
    console.log('='.repeat(60));
    console.log(`Success: ${result.success ? '✅ YES' : '❌ NO'}`);
    console.log(`Total shows: ${result.totalShows}`);
    console.log(`Successful updates: ${result.successfulUpdates}`);
    console.log(`Failed updates: ${result.failedUpdates}`);
    console.log(`RSS feeds found: ${result.rssFoundCount}`);
    console.log(`Using Spotify URLs: ${result.rssNotFoundCount}`);
    console.log('='.repeat(60));
    
    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 