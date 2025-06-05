#!/usr/bin/env node

/**
 * Vault Usage Monitoring Script
 * 
 * A lightweight script to periodically verify Vault usage.
 * Designed to be run as a cron job or monitoring check.
 * 
 * Usage:
 *   node scripts/vault-usage-monitor.js
 *   
 * Environment variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - VAULT_MONITOR_THRESHOLD (default: 90) - minimum % of users that should use Vault
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

class VaultUsageMonitor {
  constructor() {
    this.thresholdPercentage = parseInt(process.env.VAULT_MONITOR_THRESHOLD || '90');
    this.supabase = null;
  }

  /**
   * Initialize Supabase client
   */
  initializeClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Check if Vault is accessible
   */
  async checkVaultAccessibility() {
    try {
      const { data, error } = await this.supabase
        .from('vault.secrets')
        .select('count(*)', { count: 'exact' })
        .limit(1);

      if (error) {
        throw new Error(`Vault not accessible: ${error.message}`);
      }

      return { accessible: true, secretCount: data[0]?.count || 0 };
    } catch (error) {
      return { accessible: false, error: error.message };
    }
  }

  /**
   * Check user storage patterns
   */
  async checkUserStoragePatterns() {
    try {
      // Get total users
      const { data: totalUsersData, error: totalError } = await this.supabase
        .from('users')
        .select('count(*)', { count: 'exact' });

      if (totalError) {
        throw new Error(`Cannot count total users: ${totalError.message}`);
      }

      const totalUsers = totalUsersData[0]?.count || 0;

      // Get users with Vault secrets
      const { data: vaultUsersData, error: vaultError } = await this.supabase
        .from('users')
        .select('count(*)', { count: 'exact' })
        .not('spotify_vault_secret_id', 'is', null);

      if (vaultError) {
        throw new Error(`Cannot count Vault users: ${vaultError.message}`);
      }

      const vaultUsers = vaultUsersData[0]?.count || 0;

      // Check fallback table usage
      let fallbackUsers = 0;
      try {
        const { data: fallbackData, error: fallbackError } = await this.supabase
          .from('user_secrets')
          .select('count(*)', { count: 'exact' });

        if (!fallbackError) {
          fallbackUsers = fallbackData[0]?.count || 0;
        }
      } catch (error) {
        // user_secrets table may not exist in production - this is good
        fallbackUsers = 0;
      }

      const vaultPercentage = totalUsers > 0 ? (vaultUsers / totalUsers * 100) : 0;

      return {
        totalUsers,
        vaultUsers,
        fallbackUsers,
        vaultPercentage: Math.round(vaultPercentage * 10) / 10, // Round to 1 decimal
        meetsThreshold: vaultPercentage >= this.thresholdPercentage
      };

    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Test a single Vault operation
   */
  async testVaultOperation() {
    try {
      // Try to find any user with a Vault secret for testing
      const { data: testUser, error: userError } = await this.supabase
        .from('users')
        .select('id, spotify_vault_secret_id')
        .not('spotify_vault_secret_id', 'is', null)
        .limit(1)
        .single();

      if (userError || !testUser) {
        return { tested: false, reason: 'No users with Vault secrets found' };
      }

      // Test reading the secret
      const startTime = Date.now();
      const { error: readError } = await this.supabase
        .rpc('vault_read_user_secret', {
          p_secret_id: testUser.spotify_vault_secret_id
        });

      const elapsed = Date.now() - startTime;

      if (readError) {
        return { 
          tested: true, 
          success: false, 
          error: readError.message,
          elapsed 
        };
      }

      return { 
        tested: true, 
        success: true, 
        elapsed 
      };

    } catch (error) {
      return { 
        tested: false, 
        error: error.message 
      };
    }
  }

  /**
   * Generate monitoring metrics in JSON format
   */
  generateMetrics(vaultStatus, userStorage, operationTest) {
    const timestamp = new Date().toISOString();
    
    const metrics = {
      timestamp,
      status: 'unknown',
      vault: {
        accessible: vaultStatus.accessible,
        secret_count: vaultStatus.secretCount || 0,
        error: vaultStatus.error || null
      },
      users: {
        total: userStorage.totalUsers || 0,
        vault_users: userStorage.vaultUsers || 0,
        fallback_users: userStorage.fallbackUsers || 0,
        vault_percentage: userStorage.vaultPercentage || 0,
        meets_threshold: userStorage.meetsThreshold || false,
        threshold: this.thresholdPercentage,
        error: userStorage.error || null
      },
      operation_test: {
        tested: operationTest.tested,
        success: operationTest.success || false,
        elapsed_ms: operationTest.elapsed || null,
        error: operationTest.error || null,
        reason: operationTest.reason || null
      }
    };

    // Determine overall status
    if (vaultStatus.accessible && 
        userStorage.meetsThreshold && 
        (operationTest.success || !operationTest.tested)) {
      metrics.status = 'healthy';
    } else if (vaultStatus.accessible && userStorage.vaultUsers > 0) {
      metrics.status = 'warning';
    } else {
      metrics.status = 'critical';
    }

    return metrics;
  }

  /**
   * Log metrics in structured format for monitoring systems
   */
  logMetrics(metrics) {
    // Structured log for monitoring systems to parse
    console.log(`VAULT_MONITOR: ${JSON.stringify(metrics)}`);
    
    // Human-readable summary
    console.log(`\n📊 Vault Usage Monitor - ${metrics.timestamp}`);
    console.log(`Status: ${metrics.status.toUpperCase()}`);
    console.log(`Vault Access: ${metrics.vault.accessible ? '✅' : '❌'}`);
    
    if (metrics.users.total > 0) {
      console.log(`User Storage: ${metrics.users.vault_users}/${metrics.users.total} using Vault (${metrics.users.vault_percentage}%)`);
      
      if (metrics.users.fallback_users > 0) {
        console.log(`⚠️  ${metrics.users.fallback_users} users using fallback storage`);
      }
      
      if (!metrics.users.meets_threshold) {
        console.log(`⚠️  Below threshold: ${metrics.users.vault_percentage}% < ${metrics.users.threshold}%`);
      }
    }

    if (metrics.operation_test.tested) {
      console.log(`Operation Test: ${metrics.operation_test.success ? '✅' : '❌'} (${metrics.operation_test.elapsed_ms}ms)`);
    }

    // Alert conditions
    if (metrics.status === 'critical') {
      console.log('\n🚨 CRITICAL: Vault appears to be unavailable or not in use');
    } else if (metrics.status === 'warning') {
      console.log('\n⚠️  WARNING: Vault usage below expected threshold');
    }
  }

  /**
   * Main monitoring workflow
   */
  async run() {
    try {
      this.initializeClient();

      // Run checks in parallel for speed
      const [vaultStatus, userStorage, operationTest] = await Promise.all([
        this.checkVaultAccessibility(),
        this.checkUserStoragePatterns(),
        this.testVaultOperation()
      ]);

      // Generate and log metrics
      const metrics = this.generateMetrics(vaultStatus, userStorage, operationTest);
      this.logMetrics(metrics);

      // Exit with status code based on health
      const exitCode = metrics.status === 'critical' ? 2 : 
                      metrics.status === 'warning' ? 1 : 0;
      
      process.exit(exitCode);

    } catch (error) {
      console.error('❌ Monitor failed:', error.message);
      
      // Log error metrics
      const errorMetrics = {
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      };
      console.log(`VAULT_MONITOR: ${JSON.stringify(errorMetrics)}`);
      
      process.exit(3);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new VaultUsageMonitor();
  monitor.run().catch(console.error);
}

module.exports = { VaultUsageMonitor }; 