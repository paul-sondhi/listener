#!/usr/bin/env node

/**
 * Vault Operations Monitoring Script
 * Run this during staging deployment to monitor vault health
 * 
 * Usage: node scripts/monitor-vault.js --duration=24h --interval=5m
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

class VaultMonitor {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    this.metrics = {
      startTime: Date.now(),
      checks: 0,
      errors: 0,
      lastError: null,
      vaultAccessible: true,
      secretCount: 0
    };
  }

  /**
   * Perform a health check of vault operations
   */
  async healthCheck() {
    const checkStart = Date.now();
    this.metrics.checks++;
    
    try {
      // Test 1: Basic vault connectivity
      const { data: secretCount, error } = await this.supabase
        .rpc('test_vault_count');

      if (error) {
        throw new Error(`Vault connectivity failed: ${error.message}`);
      }

      // Test 2: Validate secret count is reasonable
      if (typeof secretCount !== 'number' || secretCount < 0) {
        throw new Error('Vault returned invalid secret count');
      }

      // Update metrics
      this.metrics.vaultAccessible = true;
      this.metrics.secretCount = secretCount;

      const duration = Date.now() - checkStart;
      
      console.log(`✅ ${new Date().toISOString()} - Vault healthy: ${secretCount} secrets, ${duration}ms`);
      
      return { success: true, secretCount, duration };
      
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      this.metrics.vaultAccessible = false;
      
      const duration = Date.now() - checkStart;
      
      console.error(`❌ ${new Date().toISOString()} - Vault error: ${error.message}, ${duration}ms`);
      
      return { success: false, error: error.message, duration };
    }
  }

  /**
   * Print current monitoring status
   */
  printStatus() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    const errorRate = this.metrics.checks > 0 ? (this.metrics.errors / this.metrics.checks * 100).toFixed(2) : 0;
    
    console.log('\n📊 Vault Monitoring Status:');
    console.log(`   Uptime: ${uptime}s`);
    console.log(`   Checks: ${this.metrics.checks}`);
    console.log(`   Errors: ${this.metrics.errors} (${errorRate}%)`);
    console.log(`   Vault Accessible: ${this.metrics.vaultAccessible ? '✅' : '❌'}`);
    console.log(`   Secret Count: ${this.metrics.secretCount}`);
    
    if (this.metrics.lastError) {
      console.log(`   Last Error: ${this.metrics.lastError}`);
    }
    
    // Alert if error rate is high
    if (errorRate > 5) {
      console.log(`\n⚠️  WARNING: Error rate ${errorRate}% is above 5% threshold!`);
    }
    
    console.log('');
  }

  /**
   * Start monitoring with specified interval
   */
  async startMonitoring(intervalMs = 60000) { // Default: 1 minute
    console.log(`🔍 Starting vault monitoring (interval: ${intervalMs/1000}s)`);
    console.log(`📊 Monitor dashboard: ${process.env.SUPABASE_URL?.replace('/rest/v1', '')}/project/default/logs`);
    console.log('');
    
    // Initial health check
    await this.healthCheck();
    this.printStatus();
    
    // Set up periodic monitoring
    const interval = setInterval(async () => {
      await this.healthCheck();
      
      // Print status every 10 checks
      if (this.metrics.checks % 10 === 0) {
        this.printStatus();
      }
    }, intervalMs);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping vault monitoring...');
      clearInterval(interval);
      this.printStatus();
      console.log('✅ Monitoring stopped.');
      process.exit(0);
    });
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    duration: '24h',
    interval: '1m'
  };
  
  args.forEach(arg => {
    if (arg.startsWith('--duration=')) {
      options.duration = arg.split('=')[1];
    } else if (arg.startsWith('--interval=')) {
      options.interval = arg.split('=')[1];
    }
  });
  
  return options;
}

/**
 * Convert time string to milliseconds
 */
function parseTimeToMs(timeStr) {
  const units = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000
  };
  
  const match = timeStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Use format like: 30s, 5m, 2h, 1d`);
  }
  
  const [, value, unit] = match;
  return parseInt(value) * units[unit];
}

/**
 * Main execution
 */
async function main() {
  try {
    const options = parseArgs();
    const intervalMs = parseTimeToMs(options.interval);
    const durationMs = parseTimeToMs(options.duration);
    
    console.log(`🚀 Vault Monitoring Starting...`);
    console.log(`Duration: ${options.duration} (${durationMs/1000}s)`);
    console.log(`Interval: ${options.interval} (${intervalMs/1000}s)`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Supabase URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
    console.log('');
    
    const monitor = new VaultMonitor();
    await monitor.startMonitoring(intervalMs);
    
    // Auto-stop after specified duration
    setTimeout(() => {
      console.log('\n⏰ Monitoring duration reached. Stopping...');
      process.exit(0);
    }, durationMs);
    
  } catch (error) {
    console.error('❌ Monitoring failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { VaultMonitor }; 