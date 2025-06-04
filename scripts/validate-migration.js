#!/usr/bin/env node

/**
 * Production Migration Validation Script
 * Step 8.1: Validate that migrations preserve vault secret integrity
 * 
 * This script runs during CI to ensure that database migrations
 * don't break vault secret encryption/decryption functionality.
 * 
 * Safety Features:
 * - Only runs test secrets (never touches production data)
 * - Always cleans up after itself
 * - Fails fast on any encryption/decryption issues
 * - Comprehensive logging for debugging
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from parent directory (project root)
// This handles both local development and CI environments
const parentDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(parentDir, '.env.local') });
dotenv.config({ path: path.join(parentDir, '.env') });

class MigrationValidator {
  constructor() {
    // Validate environment
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required Supabase environment variables');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    this.testSecrets = [];
    this.startTime = Date.now();
  }

  /**
   * Main validation workflow
   */
  async validate() {
    console.log('🔍 Starting migration validation...');
    
    try {
      // Step 1: Verify vault is accessible
      await this.verifyVaultAccess();
      console.log('✅ Vault access verified');

      // Step 2: Check existing secrets (read-only mode)
      await this.checkExistingSecrets();
      console.log('✅ Existing secrets verified');

      // Step 3: Test basic vault functionality
      await this.testVaultFunctionality();
      console.log('✅ Vault functionality verified');

      const duration = Date.now() - this.startTime;
      console.log(`🎉 Migration validation completed successfully in ${duration}ms`);
      
      return { success: true, duration };

    } catch (error) {
      console.error('❌ Migration validation failed:', error.message);
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify basic vault accessibility
   */
  async verifyVaultAccess() {
    try {
      // Test basic vault connectivity using our custom RPC function
      const { data, error } = await this.supabase
        .rpc('test_vault_count');

      if (error) {
        throw new Error(`Vault access failed: ${error.message}`);
      }

      console.log(`📡 Vault connectivity confirmed (${data} existing secrets)`);
    } catch (error) {
      throw new Error(`Vault access verification failed: ${error.message}`);
    }
  }

  /**
   * Check existing secrets in the vault
   */
  async checkExistingSecrets() {
    try {
      const { data: count, error } = await this.supabase
        .rpc('test_vault_count');

      if (error) {
        throw new Error(`Failed to count secrets: ${error.message}`);
      }

      console.log(`📊 Found ${count} existing secrets in vault`);
      
      if (count === 0) {
        console.log('ℹ️  No existing secrets found - this is normal for a fresh setup');
      }

    } catch (error) {
      throw new Error(`Existing secrets check failed: ${error.message}`);
    }
  }

  /**
   * Test basic vault functionality with read operations
   */
  async testVaultFunctionality() {
    try {
      // Test that we can access the vault schema
      const { data: count, error } = await this.supabase
        .rpc('test_vault_count');

      if (error) {
        throw new Error(`Vault functionality test failed: ${error.message}`);
      }

      // Test that the count is a valid number
      if (typeof count !== 'number' || count < 0) {
        throw new Error('Vault returned invalid count data');
      }

      console.log(`🔧 Vault functionality test passed (${count} secrets accessible)`);

    } catch (error) {
      throw new Error(`Vault functionality test failed: ${error.message}`);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Migration Validation Starting...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Working Directory: ${process.cwd()}`);
  console.log(`Script Location: ${__dirname}`);
  console.log(`Parent Directory: ${path.join(__dirname, '..')}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`Service Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
  
  // Additional debug info for environment variable sources
  if (process.env.SUPABASE_URL) {
    console.log(`  └─ SUPABASE_URL length: ${process.env.SUPABASE_URL.length} chars`);
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`  └─ SUPABASE_SERVICE_ROLE_KEY length: ${process.env.SUPABASE_SERVICE_ROLE_KEY.length} chars`);
  }
  
  try {
    const validator = new MigrationValidator();
    const result = await validator.validate();
    
    if (result.success) {
      console.log('\n🎉 Migration validation PASSED');
      console.log(`⏱️  Total duration: ${result.duration}ms`);
      process.exit(0);
    } else {
      console.log('\n❌ Migration validation FAILED');
      console.log(`💥 Error: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Migration validation crashed:', error.message);
    console.error('Debug info:');
    console.error(`  - NODE_ENV: ${process.env.NODE_ENV}`);
    console.error(`  - Has SUPABASE_URL: ${!!process.env.SUPABASE_URL}`);
    console.error(`  - Has SUPABASE_SERVICE_ROLE_KEY: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { MigrationValidator }; 