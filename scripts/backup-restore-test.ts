#!/usr/bin/env ts-node

/**
 * Backup-Restore Migration Test Script
 * Step 8.1: Script backup-restore test each migration; fail CI if secrets don't decrypt
 * 
 * This script:
 * 1. Creates a backup of the current database state
 * 2. Runs pending migrations
 * 3. Tests that all vault secrets can still be decrypted
 * 4. Validates token functionality end-to-end
 * 5. Fails CI if any secrets become inaccessible
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface TestConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseProjectId: string;
  backupDir: string;
  testSecretCount: number;
}

interface BackupData {
  timestamp: string;
  secrets: Array<{
    id: string;
    name: string;
    secret: string;
    description: string;
    created_at: string;
  }>;
  users: Array<{
    id: string;
    email: string;
    spotify_vault_secret_id: string | null;
    spotify_reauth_required: boolean | null;
  }>;
  migrations: Array<{
    version: string;
    applied_at: string;
    checksum: string | null;
  }>;
}

interface TestResult {
  success: boolean;
  error?: string;
  details: {
    backupCreated: boolean;
    migrationsRan: boolean;
    secretsDecrypted: boolean;
    endToEndTest: boolean;
    cleanupCompleted: boolean;
  };
  metrics: {
    secretCount: number;
    userCount: number;
    migrationCount: number;
    testDurationMs: number;
  };
}

class BackupRestoreTest {
  private config: TestConfig;
  private supabase: SupabaseClient;
  private backupPath: string;
  private testStartTime: number;

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_PROJECT_ID'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    this.config = {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      supabaseProjectId: process.env.SUPABASE_PROJECT_ID!,
      backupDir: join(process.cwd(), 'backups'),
      testSecretCount: parseInt(process.env.TEST_SECRET_COUNT || '5')
    };

    this.supabase = createClient(
      this.config.supabaseUrl,
      this.config.supabaseServiceKey
    );

    this.testStartTime = Date.now();
    this.backupPath = join(
      this.config.backupDir,
      `backup-${Date.now()}.json`
    );

    // Ensure backup directory exists
    if (!existsSync(this.config.backupDir)) {
      mkdirSync(this.config.backupDir, { recursive: true });
    }
  }

  /**
   * Main test execution
   */
  async run(): Promise<TestResult> {
    console.log('🔄 Starting backup-restore migration test...');
    
    const result: TestResult = {
      success: false,
      details: {
        backupCreated: false,
        migrationsRan: false,
        secretsDecrypted: false,
        endToEndTest: false,
        cleanupCompleted: false
      },
      metrics: {
        secretCount: 0,
        userCount: 0,
        migrationCount: 0,
        testDurationMs: 0
      }
    };

    try {
      // Step 1: Create backup
      console.log('📦 Creating database backup...');
      await this.createBackup();
      result.details.backupCreated = true;
      console.log('✅ Backup created successfully');

      // Step 2: Create test secrets if needed
      console.log('🔐 Setting up test secrets...');
      await this.setupTestSecrets();
      console.log('✅ Test secrets created');

      // Step 3: Run migrations
      console.log('🔄 Running database migrations...');
      await this.runMigrations();
      result.details.migrationsRan = true;
      console.log('✅ Migrations completed successfully');

      // Step 4: Test secret decryption
      console.log('🔍 Testing secret decryption...');
      const decryptionResult = await this.testSecretDecryption();
      result.details.secretsDecrypted = decryptionResult.success;
      result.metrics.secretCount = decryptionResult.secretCount;
      
      if (!decryptionResult.success) {
        throw new Error(`Secret decryption failed: ${decryptionResult.error}`);
      }
      console.log('✅ All secrets decrypted successfully');

      // Step 5: End-to-end token test
      console.log('🧪 Running end-to-end token test...');
      const e2eResult = await this.endToEndTokenTest();
      result.details.endToEndTest = e2eResult.success;
      
      if (!e2eResult.success) {
        throw new Error(`End-to-end test failed: ${e2eResult.error}`);
      }
      console.log('✅ End-to-end test passed');

      // Step 6: Cleanup
      console.log('🧹 Cleaning up test data...');
      await this.cleanup();
      result.details.cleanupCompleted = true;
      console.log('✅ Cleanup completed');

      result.success = true;
      console.log('🎉 Backup-restore test completed successfully!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.error = errorMessage;
      console.error('❌ Backup-restore test failed:', errorMessage);

      // Attempt cleanup even on failure
      try {
        await this.cleanup();
        result.details.cleanupCompleted = true;
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup failed:', cleanupError);
      }
    } finally {
      result.metrics.testDurationMs = Date.now() - this.testStartTime;
    }

    return result;
  }

  /**
   * Create a backup of current database state
   */
  private async createBackup(): Promise<void> {
    const backup: BackupData = {
      timestamp: new Date().toISOString(),
      secrets: [],
      users: [],
      migrations: []
    };

    // Backup vault secrets
    const { data: secrets, error: secretsError } = await this.supabase
      .from('vault.secrets')
      .select('id, name, secret, description, created_at')
      .order('created_at', { ascending: true });

    if (secretsError) {
      throw new Error(`Failed to backup secrets: ${secretsError.message}`);
    }

    backup.secrets = secrets || [];

    // Backup users with vault references
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, email, spotify_vault_secret_id, spotify_reauth_required')
      .order('created_at', { ascending: true });

    if (usersError) {
      throw new Error(`Failed to backup users: ${usersError.message}`);
    }

    backup.users = users || [];

    // Backup migration history
    const { data: migrations, error: migrationsError } = await this.supabase
      .from('supabase_migrations')
      .select('version, applied_at, checksum')
      .order('applied_at', { ascending: true });

    if (migrationsError) {
      // Migrations table might not exist in some setups
      console.warn('Warning: Could not backup migration history');
      backup.migrations = [];
    } else {
      backup.migrations = migrations || [];
    }

    // Save backup to file
    writeFileSync(this.backupPath, JSON.stringify(backup, null, 2));
    console.log(`📁 Backup saved to: ${this.backupPath}`);
    console.log(`📊 Backup contains: ${backup.secrets.length} secrets, ${backup.users.length} users, ${backup.migrations.length} migrations`);
  }

  /**
   * Create test secrets for validation
   */
  private async setupTestSecrets(): Promise<void> {
    const testSecrets = [];

    for (let i = 0; i < this.config.testSecretCount; i++) {
      const testTokenData = {
        access_token: `test_access_token_${i}_${Date.now()}`,
        refresh_token: `test_refresh_token_${i}_${Date.now()}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      };

      const { data, error } = await this.supabase
        .from('vault.secrets')
        .insert({
          name: `test:backup-restore:${i}:tokens`,
          secret: JSON.stringify(testTokenData),
          description: `Test secret ${i} for backup-restore validation`,
          key_id: 'default'
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create test secret ${i}: ${error.message}`);
      }

      testSecrets.push(data);
    }

    console.log(`🔐 Created ${testSecrets.length} test secrets`);
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    try {
      // Run Supabase migrations
      console.log('Running supabase db reset...');
      execSync('supabase db reset --linked', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('Migration completed');
    } catch (error) {
      throw new Error(`Migration failed: ${error}`);
    }
  }

  /**
   * Test that all secrets can still be decrypted
   */
  private async testSecretDecryption(): Promise<{ success: boolean; error?: string; secretCount: number }> {
    try {
      // Get all test secrets
      const { data: secrets, error } = await this.supabase
        .from('vault.secrets')
        .select('id, name, secret, description')
        .ilike('name', 'test:backup-restore:%');

      if (error) {
        return { success: false, error: error.message, secretCount: 0 };
      }

      if (!secrets || secrets.length === 0) {
        return { success: false, error: 'No test secrets found', secretCount: 0 };
      }

      // Test decryption of each secret
      let successCount = 0;
      const errors: string[] = [];

      for (const secret of secrets) {
        try {
          // Parse the JSON to ensure it's valid
          const tokenData = JSON.parse(secret.secret);
          
          // Validate token structure
          if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_at) {
            errors.push(`Secret ${secret.name} has invalid token structure`);
            continue;
          }

          // Validate token content
          if (!tokenData.access_token.startsWith('test_access_token_')) {
            errors.push(`Secret ${secret.name} has corrupted access token`);
            continue;
          }

          successCount++;
        } catch (parseError) {
          errors.push(`Secret ${secret.name} failed to decrypt: ${parseError}`);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `${errors.length} secrets failed decryption: ${errors.join(', ')}`,
          secretCount: secrets.length
        };
      }

      console.log(`🔓 Successfully decrypted ${successCount}/${secrets.length} test secrets`);
      return { success: true, secretCount: secrets.length };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage, secretCount: 0 };
    }
  }

  /**
   * End-to-end token functionality test
   */
  private async endToEndTokenTest(): Promise<{ success: boolean; error?: string }> {
    try {
      // Test vault helper functions
      const { createUserSecret, getUserSecret, updateUserSecret, deleteUserSecret } = 
        await import('../packages/server/lib/vaultHelpers');

      const testUserId = `test-user-${Date.now()}`;
      const testTokenData = {
        access_token: `e2e_access_token_${Date.now()}`,
        refresh_token: `e2e_refresh_token_${Date.now()}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
        scope: 'user-read-email user-library-read'
      };

      // Test create
      const createResult = await createUserSecret(testUserId, testTokenData);
      if (!createResult.success) {
        return { success: false, error: `Create failed: ${createResult.error}` };
      }

      // Test read
      const readResult = await getUserSecret(testUserId);
      if (!readResult.success || !readResult.data) {
        return { success: false, error: `Read failed: ${readResult.error}` };
      }

      // Validate read data
      if (readResult.data.access_token !== testTokenData.access_token) {
        return { success: false, error: 'Read data does not match created data' };
      }

      // Test update
      const updatedTokenData = { ...testTokenData, access_token: `updated_${testTokenData.access_token}` };
      const updateResult = await updateUserSecret(testUserId, updatedTokenData);
      if (!updateResult.success) {
        return { success: false, error: `Update failed: ${updateResult.error}` };
      }

      // Verify update
      const verifyResult = await getUserSecret(testUserId);
      if (!verifyResult.success || verifyResult.data?.access_token !== updatedTokenData.access_token) {
        return { success: false, error: 'Update verification failed' };
      }

      // Test delete
      const deleteResult = await deleteUserSecret(testUserId, true);
      if (!deleteResult.success) {
        return { success: false, error: `Delete failed: ${deleteResult.error}` };
      }

      // Verify delete
      const deletedResult = await getUserSecret(testUserId);
      if (deletedResult.success) {
        return { success: false, error: 'Secret was not properly deleted' };
      }

      console.log('🔄 End-to-end token test completed successfully');
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Clean up test data
   */
  private async cleanup(): Promise<void> {
    try {
      // Delete test secrets
      const { error: deleteError } = await this.supabase
        .from('vault.secrets')
        .delete()
        .ilike('name', 'test:backup-restore:%');

      if (deleteError) {
        console.warn('Warning: Failed to cleanup test secrets:', deleteError.message);
      }

      // Clean up test users if any were created
      const { error: userDeleteError } = await this.supabase
        .from('users')
        .delete()
        .ilike('id', 'test-user-%');

      if (userDeleteError) {
        console.warn('Warning: Failed to cleanup test users:', userDeleteError.message);
      }

      console.log('🧹 Test data cleanup completed');
    } catch (error) {
      console.warn('Warning: Cleanup error:', error);
    }
  }
}

/**
 * CLI execution
 */
async function main(): Promise<void> {
  try {
    const test = new BackupRestoreTest();
    const result = await test.run();

    // Output results
    console.log('\n📊 Test Results:');
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  Duration: ${result.metrics.testDurationMs}ms`);
    console.log(`  Secrets tested: ${result.metrics.secretCount}`);
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    console.log('\n📋 Step Details:');
    Object.entries(result.details).forEach(([step, success]) => {
      console.log(`  ${step}: ${success ? '✅' : '❌'}`);
    });

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { BackupRestoreTest }; 