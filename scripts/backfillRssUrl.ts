#!/usr/bin/env ts-node

/**
 * RSS URL Backfill Script
 * Purpose: Populate rss_url column for all podcast_shows where rss_url IS NULL
 * 
 * This script:
 * 1. Queries all podcast_shows where rss_url IS NULL
 * 2. For each show, calls getFeedUrl(spotify_url) to find the RSS feed
 * 3. Updates the database with the found RSS URL
 * 4. Logs progress and results for verification
 * 
 * Run this script BEFORE deploying the constraint migration that makes rss_url NOT NULL
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { getTitleSlug, getFeedUrl } from '../packages/server/lib/utils';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface PodcastShow {
  id: string;
  spotify_url: string;
  title: string | null;
  rss_url: string | null;
}

interface BackfillResult {
  success: boolean;
  totalShows: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedShows: number;
  errors: Array<{
    showId: string;
    spotifyUrl: string;
    error: string;
  }>;
}

class RssUrlBackfill {
  private supabase: SupabaseClient;
  private results: BackfillResult;

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
      errors: []
    };
  }

  /**
   * Main backfill execution
   */
  async run(): Promise<BackfillResult> {
    console.log('🔄 Starting RSS URL backfill process...');
    
    // Safety check: Warn if running in production-like environment
    if (process.env.NODE_ENV === 'production' || process.env.SUPABASE_URL?.includes('supabase.co')) {
      console.warn('⚠️  WARNING: This script is running in a production environment!');
      console.warn('⚠️  This script should only be run ONCE during initial deployment.');
      console.warn('⚠️  Continuing in 5 seconds... Press Ctrl+C to cancel.');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    const startTime = Date.now();

    try {
      // Step 1: Query shows that need RSS URLs
      console.log('📊 Querying podcast_shows where rss_url IS NULL...');
      const showsToUpdate = await this.getShowsNeedingRssUrl();
      this.results.totalShows = showsToUpdate.length;

      if (showsToUpdate.length === 0) {
        console.log('✅ No shows need RSS URL backfill. All done!');
        this.results.success = true;
        return this.results;
      }

      console.log(`📋 Found ${showsToUpdate.length} shows needing RSS URL backfill`);

      // Step 2: Process each show
      for (let i = 0; i < showsToUpdate.length; i++) {
        const show = showsToUpdate[i];
        if (!show) continue; // Skip if show is undefined
        
        const progress = `[${i + 1}/${showsToUpdate.length}]`;
        
        console.log(`${progress} Processing show: ${show.title || 'Untitled'}`);
        console.log(`  Spotify URL: ${show.spotify_url}`);

        try {
          await this.processShow(show);
          this.results.successfulUpdates++;
          console.log(`  ✅ Successfully updated RSS URL`);
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

        // Add small delay to avoid overwhelming external APIs
        if (i < showsToUpdate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Step 3: Summary
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log('\n📊 Backfill Summary:');
      console.log(`  Total shows processed: ${this.results.totalShows}`);
      console.log(`  Successful updates: ${this.results.successfulUpdates}`);
      console.log(`  Failed updates: ${this.results.failedUpdates}`);
      console.log(`  Duration: ${duration}s`);

      if (this.results.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        this.results.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. Show ID: ${error.showId}`);
          console.log(`     Spotify URL: ${error.spotifyUrl}`);
          console.log(`     Error: ${error.error}`);
        });
      }

      this.results.success = this.results.failedUpdates === 0;
      
      if (this.results.success) {
        console.log('\n🎉 RSS URL backfill completed successfully!');
        console.log('✅ Ready to deploy constraint migration (20250618002310_add_rss_url_constraints.sql)');
      } else {
        console.log('\n⚠️ RSS URL backfill completed with errors.');
        console.log('❌ Review errors before deploying constraint migration.');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.results.success = false;
      console.error('❌ Backfill process failed:', errorMessage);
      throw error;
    }

    return this.results;
  }

  /**
   * Query all podcast_shows where rss_url IS NULL
   */
  private async getShowsNeedingRssUrl(): Promise<PodcastShow[]> {
    const { data, error } = await this.supabase
      .from('podcast_shows')
      .select('id, spotify_url, title, rss_url')
      .is('rss_url', null);

    if (error) {
      throw new Error(`Failed to query podcast_shows: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Process a single show: get RSS URL and update database
   */
  private async processShow(show: PodcastShow): Promise<void> {
    // Step 1: Get title slug from Spotify URL
    const showMetadata = await getTitleSlug(show.spotify_url);
    console.log(`  Title slug: "${showMetadata.name}"`);

    // Step 2: Find RSS feed URL using the enhanced metadata
    const rssUrl = await getFeedUrl(showMetadata);
    
    if (!rssUrl) {
      throw new Error('No RSS feed URL found for this podcast');
    }

    console.log(`  Found RSS URL: ${rssUrl}`);

    // Step 3: Update database
    const { error } = await this.supabase
      .from('podcast_shows')
      .update({ rss_url: rssUrl })
      .eq('id', show.id);

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    const backfill = new RssUrlBackfill();
    const result = await backfill.run();
    
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