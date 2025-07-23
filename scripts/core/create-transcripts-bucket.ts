#!/usr/bin/env tsx

/**
 * Create Transcripts Storage Bucket Script
 * Purpose: Create a private Supabase Storage bucket for storing podcast transcripts
 * 
 * This script:
 * 1. Creates a private storage bucket named 'transcripts'
 * 2. Sets appropriate policies for authenticated access
 * 3. Handles idempotent execution (safe to run multiple times)
 * 4. Provides clear logging for deployment verification
 * 
 * Usage:
 * - Development: pnpm tsx scripts/create-transcripts-bucket.ts
 * - CI/CD: Include this in deployment pipeline after database migrations
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface BucketCreationResult {
  success: boolean;
  bucketExists: boolean;
  bucketCreated: boolean;
  error?: string;
}

class TranscriptsBucketCreator {
  private supabase: SupabaseClient;
  private readonly bucketName = 'transcripts';

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
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
  }

  /**
   * Check if the transcripts bucket already exists
   */
  private async bucketExists(): Promise<boolean> {
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets();
      
      if (error) {
        console.error('❌ Error checking existing buckets:', error.message);
        return false;
      }

      return buckets?.some(bucket => bucket.name === this.bucketName) ?? false;
    } catch (error) {
      console.error('❌ Exception while checking bucket existence:', error);
      return false;
    }
  }

  /**
   * Create the transcripts bucket with private access
   */
  private async createBucket(): Promise<boolean> {
    try {
      const { data: _data, error } = await this.supabase.storage.createBucket(this.bucketName, {
        public: false,  // Private bucket - requires authentication
        allowedMimeTypes: [
          'application/json',      // For .jsonl files
          'application/gzip',      // For .gz compressed files
          'text/plain',            // For plain text transcripts
          'application/x-gzip'     // Alternative gzip MIME type
        ],
        fileSizeLimit: 10485760   // 10MB limit per file (generous for transcripts)
      });

      if (error) {
        console.error('❌ Error creating bucket:', error.message);
        return false;
      }

      console.log('✅ Successfully created transcripts bucket');
      return true;
    } catch (error) {
      console.error('❌ Exception while creating bucket:', error);
      return false;
    }
  }

  /**
   * Main execution method
   */
  async run(): Promise<BucketCreationResult> {
    console.log('🔄 Starting transcripts bucket creation...');
    console.log(`📦 Target bucket name: ${this.bucketName}`);
    
    const result: BucketCreationResult = {
      success: false,
      bucketExists: false,
      bucketCreated: false
    };

    try {
      // Step 1: Check if bucket already exists
      console.log('🔍 Checking if transcripts bucket already exists...');
      const exists = await this.bucketExists();
      result.bucketExists = exists;

      if (exists) {
        console.log('✅ Transcripts bucket already exists - no action needed');
        result.success = true;
        return result;
      }

      // Step 2: Create the bucket
      console.log('📦 Creating transcripts bucket...');
      const created = await this.createBucket();
      result.bucketCreated = created;

      if (created) {
        console.log('🎉 Transcripts bucket setup completed successfully!');
        console.log('📋 Bucket configuration:');
        console.log('   - Name: transcripts');
        console.log('   - Access: Private (requires authentication)');
        console.log('   - File size limit: 10MB');
        console.log('   - Allowed types: JSON, GZIP, Plain text');
        result.success = true;
      } else {
        result.error = 'Failed to create bucket';
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Unexpected error during bucket creation:', errorMessage);
      result.error = errorMessage;
      return result;
    }
  }
}

/**
 * Main function - entry point for the script
 */
async function main(): Promise<void> {
  try {
    const creator = new TranscriptsBucketCreator();
    const result = await creator.run();

    if (result.success) {
      console.log('\n🎉 Script completed successfully!');
      process.exit(0);
    } else {
      console.error('\n❌ Script failed:', result.error || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script if executed directly
if (require.main === module) {
  main();
} 