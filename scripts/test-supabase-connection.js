#!/usr/bin/env node

/**
 * Supabase Connection Test Script
 * 
 * This script tests various Supabase operations to confirm whether
 * the signOut hanging issue is caused by network connectivity problems.
 * 
 * Usage: node scripts/test-supabase-connection.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Environment variables are loaded by require('dotenv').config() above

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.error('   VITE_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

console.log('🔗 Testing Supabase Connection...');
console.log('📍 URL:', SUPABASE_URL);
console.log('🔑 Using anon key:', SUPABASE_ANON_KEY.substring(0, 20) + '...');
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test a specific operation with timeout
 */
async function testOperation(name, operation, timeoutMs = 5000) {
  console.log(`🧪 Testing ${name}...`);
  const startTime = Date.now();
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${name} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    
    const result = await Promise.race([operation(), timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${name} completed in ${duration}ms`);
    return { success: true, duration, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = duration >= timeoutMs;
    
    console.log(`❌ ${name} failed after ${duration}ms`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Was timeout: ${isTimeout}`);
    
    return { success: false, duration, error: error.message, isTimeout };
  }
}

/**
 * Main test function
 */
async function runConnectionTests() {
  console.log('🚀 Starting Supabase connection tests...\n');
  
  const tests = [
    {
      name: 'Basic Connection',
      operation: () => supabase.auth.getSession()
    },
    {
      name: 'Get Current User',
      operation: () => supabase.auth.getUser()
    },
    {
      name: 'Test Database Query',
      operation: () => supabase.from('users').select('count', { count: 'exact', head: true })
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await testOperation(test.name, test.operation);
    results.push({ ...test, ...result });
    console.log(''); // Empty line for readability
  }
  
  // Summary
  console.log('📊 Test Summary:');
  console.log('================');
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const timeouts = results.filter(r => r.isTimeout).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`⏱️  Timeouts: ${timeouts}/${results.length}`);
  console.log(`📈 Average Duration: ${avgDuration.toFixed(0)}ms`);
  
  if (timeouts > 0) {
    console.log('\n⚠️  WARNING: Detected timeouts - this confirms network connectivity issues!');
    console.log('   This suggests that supabase.auth.signOut() would likely hang as well.');
  } else if (avgDuration > 2000) {
    console.log('\n⚠️  WARNING: Slow response times detected');
    console.log('   This increases the risk of signOut hanging in poor network conditions.');
  } else {
    console.log('\n✅ Connection appears healthy');
    console.log('   If signOut was hanging, it may have been a temporary network issue.');
  }
  
  console.log('\n🔍 To simulate the actual issue:');
  console.log('   1. Try running this script when you experience logout problems');
  console.log('   2. Compare results during different network conditions');
  console.log('   3. Look for correlation between slow/failed tests and logout issues');
}

// Run the tests
runConnectionTests().catch(error => {
  console.error('💥 Test script failed:', error.message);
  process.exit(1);
}); 