#!/usr/bin/env node

/**
 * Vault Usage Verification Script
 * 
 * This script verifies that the application is using Supabase Vault 
 * in production and not falling back to the user_secrets table.
 * 
 * Usage:
 *   node scripts/verify-vault-usage.js --env=production
 *   node scripts/verify-vault-usage.js --env=staging
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

class VaultUsageVerifier {
  constructor() {
    this.supabase = null;
    this.environment = process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'production';
  }

  /**
   * Initialize Supabase client with proper environment variables
   */
  initializeClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(`✅ Initialized Supabase client for ${this.environment} environment`);
  }

  /**
   * Step 1: Verify Vault extension is enabled and accessible
   */
  async verifyVaultExtension() {
    console.log('\n🔍 Step 1: Verifying Vault extension...');

    try {
      // Test vault accessibility using RPC functions (since direct table access is restricted)
      const { data: _data, error } = await this.supabase
        .rpc('vault_read_user_secret', {
          p_secret_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID for testing
        });

      if (error) {
        if (error.message.includes('does not exist')) {
          throw new Error('❌ Vault RPC functions not found - migrations may not be applied');
        }
        if (error.message.includes('permission denied')) {
          throw new Error('❌ Vault access denied - service role key lacks vault permissions');
        }
        if (error.message.includes('Secret not found') || error.message.includes('inaccessible')) {
          // This is expected with dummy UUID - vault is working
          console.log(`✅ Vault extension is enabled and accessible`);
          console.log(`   RPC functions are working correctly`);
          return { vaultEnabled: true, secretCount: 'N/A (using RPC access)' };
        }
        throw new Error(`❌ Vault access failed: ${error.message}`);
      }

      // If we get here without error, vault worked with dummy ID (unexpected but good)
      console.log(`✅ Vault extension is enabled and accessible`);
      console.log(`   RPC functions working (unexpected success with dummy ID)`);
      return { vaultEnabled: true, secretCount: 'N/A (using RPC access)' };

    } catch (error) {
      console.error(`❌ Vault verification failed: ${error.message}`);
      return { vaultEnabled: false, error: error.message };
    }
  }

  /**
   * Step 2: Verify RPC functions for Vault operations exist
   */
  async verifyVaultRPCFunctions() {
    console.log('\n🔍 Step 2: Verifying Vault RPC functions...');

    const rpcFunctions = [
      'vault_create_user_secret',
      'vault_read_user_secret', 
      'vault_update_user_secret'
    ];

    const results = {};

    for (const funcName of rpcFunctions) {
      try {
        // Test with dummy data that should fail gracefully
        const { error } = await this.supabase.rpc(funcName, {
          p_secret_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
          p_secret_name: 'test',
          p_secret_data: '{}',
          p_description: 'test'
        });

        if (error && error.message.includes(`function ${funcName} does not exist`)) {
          console.log(`❌ RPC function '${funcName}' does not exist`);
          results[funcName] = false;
        } else {
          console.log(`✅ RPC function '${funcName}' exists`);
          results[funcName] = true;
        }

      } catch (error) {
        console.log(`❌ Error testing '${funcName}': ${error.message}`);
        results[funcName] = false;
      }
    }

    const allFunctionsExist = Object.values(results).every(exists => exists);
    console.log(`${allFunctionsExist ? '✅' : '❌'} All required RPC functions: ${allFunctionsExist ? 'exist' : 'missing'}`);
    
    return results;
  }

  /**
   * Step 3: Verify user_secrets table usage patterns
   */
  async verifyUserSecretsTableUsage() {
    console.log('\n🔍 Step 3: Checking user_secrets table usage...');

    try {
      // Check if user_secrets table exists
      const { data: _userSecretsData, error: userSecretsError, count: fallbackRecordCount } = await this.supabase
        .from('user_secrets')
        .select('id', { count: 'exact' })
        .limit(1);

      if (userSecretsError) {
        if (userSecretsError.message.includes('relation "user_secrets" does not exist')) {
          console.log('✅ user_secrets table does not exist (good - means production Vault setup)');
          return { 
            tableExists: false, 
            recordCount: 0, 
            isProduction: true,
            message: 'Production environment detected - no fallback table' 
          };
        }
        throw new Error(`Error accessing user_secrets: ${userSecretsError.message}`);
      }

      const recordCount = fallbackRecordCount || 0;
      
      if (recordCount === 0) {
        console.log('✅ user_secrets table exists but is empty (good - Vault is being used)');
        return { 
          tableExists: true, 
          recordCount: 0, 
          isProduction: true,
          message: 'Fallback table exists but unused - Vault is active' 
        };
      } else {
        console.log(`⚠️  user_secrets table has ${recordCount} records`);
        console.log('   This suggests the application may be using fallback storage instead of Vault');
        return { 
          tableExists: true, 
          recordCount: recordCount, 
          isProduction: false,
          message: 'WARNING: Fallback table in use - may not be using Vault' 
        };
      }

    } catch (error) {
      console.error(`❌ Error checking user_secrets table: ${error.message}`);
      return { 
        tableExists: null, 
        recordCount: null, 
        isProduction: null, 
        error: error.message 
      };
    }
  }

  /**
   * Step 4: Verify actual user token storage patterns
   */
  async verifyUserTokenStorage() {
    console.log('\n🔍 Step 4: Analyzing user token storage patterns...');

    try {
      // Check users with Vault secret IDs
      const { data: usersWithVault, error: vaultError } = await this.supabase
        .from('users')
        .select('id, email, spotify_vault_secret_id')
        .not('spotify_vault_secret_id', 'is', null)
        .limit(10); // Sample for analysis

      if (vaultError) {
        throw new Error(`Error querying users: ${vaultError.message}`);
      }

      const vaultUserCount = usersWithVault?.length || 0;
      console.log(`✅ Found ${vaultUserCount} users with Vault secret IDs`);

      // Check total user count for comparison
      const { data: _totalUsers, error: totalError, count: totalUserCount } = await this.supabase
        .from('users')
        .select('id', { count: 'exact' });

      if (!totalError) {
        const userCount = totalUserCount || 0;
        const vaultPercentage = userCount > 0 ? (vaultUserCount / userCount * 100).toFixed(1) : 0;
        console.log(`   Total users: ${userCount}`);
        console.log(`   Users with Vault storage: ${vaultUserCount} (${vaultPercentage}%)`);

        return {
          totalUsers: userCount,
          vaultUsers: vaultUserCount,
          vaultPercentage: parseFloat(vaultPercentage),
          isUsingVault: vaultUserCount > 0
        };
      }

    } catch (error) {
      console.error(`❌ Error analyzing user storage: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Step 5: Test live Vault operations (read-only)
   */
  async testLiveVaultOperations() {
    console.log('\n🔍 Step 5: Testing live Vault operations...');

    try {
      // Find a user with a Vault secret ID for testing
      const { data: testUser, error: userError } = await this.supabase
        .from('users')
        .select('id, spotify_vault_secret_id')
        .not('spotify_vault_secret_id', 'is', null)
        .limit(1)
        .single();

      if (userError || !testUser) {
        console.log('⚠️  No users with Vault secrets found - cannot test live operations');
        return { tested: false, reason: 'No test users available' };
      }

      console.log(`   Testing with user: ${testUser.id}`);

      // Test reading from Vault
      const { data: secretData, error: readError } = await this.supabase
        .rpc('vault_read_user_secret', {
          p_secret_id: testUser.spotify_vault_secret_id
        });

      if (readError) {
        console.log(`❌ Vault read test failed: ${readError.message}`);
        return { tested: true, success: false, error: readError.message };
      }

      // Verify the secret data is valid JSON (don't log actual tokens!)
      try {
        const parsedData = JSON.parse(secretData);
        const hasRequiredFields = parsedData.access_token && parsedData.refresh_token;
        
        console.log(`✅ Vault read test successful`);
        console.log(`   Secret data is valid JSON: ✅`);
        console.log(`   Contains required token fields: ${hasRequiredFields ? '✅' : '❌'}`);

        return { 
          tested: true, 
          success: true, 
          validJson: true, 
          hasTokenFields: hasRequiredFields 
        };

      } catch (parseError) {
        console.log(`❌ Secret data is not valid JSON: ${parseError.message}`);
        return { tested: true, success: false, validJson: false };
      }

    } catch (error) {
      console.error(`❌ Error testing live Vault operations: ${error.message}`);
      return { tested: false, error: error.message };
    }
  }

  /**
   * Generate final assessment report
   */
  generateReport(results) {
    console.log('\n📊 VAULT USAGE VERIFICATION REPORT');
    console.log('='.repeat(50));
    console.log(`Environment: ${this.environment}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('');

    // Overall status
    const isVaultWorking = results.vault?.vaultEnabled && 
                          Object.values(results.rpcFunctions || {}).every(exists => exists) &&
                          results.userStorage?.isUsingVault;

    console.log(`🎯 OVERALL STATUS: ${isVaultWorking ? '✅ VAULT IS ACTIVE' : '❌ VAULT ISSUES DETECTED'}`);
    console.log('');

    // Detailed findings
    console.log('📋 Detailed Findings:');
    console.log(`   Vault Extension: ${results.vault?.vaultEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   RPC Functions: ${Object.values(results.rpcFunctions || {}).every(exists => exists) ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Fallback Table: ${results.fallbackTable?.isProduction ? '✅ Not in use' : '⚠️ May be in use'}`);
    console.log(`   User Storage: ${results.userStorage?.isUsingVault ? '✅ Using Vault' : '❌ Not using Vault'}`);
    console.log(`   Live Operations: ${results.liveTest?.success ? '✅ Working' : results.liveTest?.tested ? '❌ Failed' : '⚠️ Not tested'}`);
    console.log('');

    // Recommendations
    if (!isVaultWorking) {
      console.log('🚨 RECOMMENDATIONS:');
      if (!results.vault?.vaultEnabled) {
        console.log('   1. Enable Vault extension in Supabase dashboard');
        console.log('   2. Verify service role key has vault permissions');
      }
      if (!Object.values(results.rpcFunctions || {}).every(exists => exists)) {
        console.log('   3. Run missing database migrations for RPC functions');
      }
      if (!results.userStorage?.isUsingVault) {
        console.log('   4. Check application deployment - may be using local development mode');
      }
    } else {
      console.log('✅ All systems operational - Vault is being used correctly');
    }

    return isVaultWorking;
  }

  /**
   * Main verification workflow
   */
  async run() {
    console.log('🔐 Supabase Vault Usage Verification');
    console.log(`Environment: ${this.environment}`);
    console.log('='.repeat(50));

    try {
      // Initialize
      this.initializeClient();

      // Run all verification steps
      const results = {
        vault: await this.verifyVaultExtension(),
        rpcFunctions: await this.verifyVaultRPCFunctions(),
        fallbackTable: await this.verifyUserSecretsTableUsage(),
        userStorage: await this.verifyUserTokenStorage(),
        liveTest: await this.testLiveVaultOperations()
      };

      // Generate report
      const isVaultWorking = this.generateReport(results);

      // Exit with appropriate code
      process.exit(isVaultWorking ? 0 : 1);

    } catch (error) {
      console.error('\n❌ Verification failed:', error.message);
      console.error('\nEnsure you have the correct environment variables set:');
      console.error('  - SUPABASE_URL');
      console.error('  - SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const verifier = new VaultUsageVerifier();
  verifier.run().catch(console.error);
}

module.exports = { VaultUsageVerifier }; 