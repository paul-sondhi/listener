#!/usr/bin/env node

/**
 * Quick Vault Check - Manual verification
 * Use this to quickly test if Vault is accessible before running full verification
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

async function quickCheck() {
  console.log('🔍 Quick Vault Accessibility Check');
  console.log('================================');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.log('❌ Missing environment variables:');
    console.log('   SUPABASE_URL:', url ? '✅ Set' : '❌ Missing');
    console.log('   SUPABASE_SERVICE_ROLE_KEY:', key ? '✅ Set' : '❌ Missing');
    console.log('\nPlease set both variables and try again.');
    process.exit(1);
  }
  
  console.log('✅ Environment variables are set');
  console.log(`   URL: ${url.substring(0, 30)}...`);
  console.log(`   Key: ${key.substring(0, 10)}...`);
  
  try {
    const supabase = createClient(url, key);
    
    // Test 1: Basic connection
    console.log('\n1. Testing basic connection...');
    const { data: testData, error: testError, count: testCount } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .limit(1);
    
    if (testError) {
      console.log('❌ Basic connection failed:', testError.message);
      process.exit(1);
    }
    
    console.log('✅ Basic connection successful');
    console.log(`   Found ${testCount || 0} users in database`);
    
    // Test 2: Vault accessibility (using RPC functions since direct access is restricted)
    console.log('\n2. Testing Vault accessibility...');
    const { data: vaultTest, error: vaultError } = await supabase
      .rpc('vault_read_user_secret', {
        p_secret_id: '00000000-0000-0000-0000-000000000000' // Dummy UUID for testing
      });
    
    if (vaultError) {
      if (vaultError.message.includes('does not exist')) {
        console.log('❌ Vault RPC functions not found:', vaultError.message);
        console.log('   → Need to run vault RPC function migrations');
        process.exit(1);
      } else if (vaultError.message.includes('Secret not found') || vaultError.message.includes('inaccessible')) {
        console.log('✅ Vault is accessible (expected error with dummy ID)');
        console.log('   RPC functions are working correctly');
      } else {
        console.log('❌ Vault error:', vaultError.message);
        process.exit(1);
      }
    } else {
      console.log('✅ Vault is accessible (unexpected success with dummy ID)');
    }
    
    // Test 3: Users with Vault secrets
    console.log('\n3. Checking user storage patterns...');
    const { data: userData, error: userError, count: vaultUserCount } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .not('spotify_vault_secret_id', 'is', null)
      .limit(1);
    
    if (userError) {
      console.log('❌ Cannot check user storage:', userError.message);
      process.exit(1);
    }
    
    const totalUserCount = testCount || 0;
    const usersWithVaultCount = vaultUserCount || 0;
    const percentage = totalUserCount > 0 ? (usersWithVaultCount / totalUserCount * 100).toFixed(1) : 0;
    
    console.log('✅ User storage analysis complete');
    console.log(`   Users with Vault secrets: ${usersWithVaultCount}/${totalUserCount} (${percentage}%)`);
    
    // Summary
    console.log('\n📊 QUICK CHECK SUMMARY');
    console.log('======================');
    if (usersWithVaultCount > 0) {
      console.log('✅ Your application appears to be using Vault!');
      console.log('   → Ready to run full verification: npm run verify:vault-usage');
    } else {
      console.log('⚠️  No users found with Vault secrets');
      console.log('   → May be using fallback storage or no users have authenticated yet');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

quickCheck(); 