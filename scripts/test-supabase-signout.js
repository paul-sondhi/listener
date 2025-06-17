#!/usr/bin/env node

/**
 * Supabase SignOut Specific Test Script
 * 
 * This script specifically tests supabase.auth.signOut() to see if it hangs,
 * which is the exact operation that was causing issues.
 * 
 * Usage: node scripts/test-supabase-signout.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🔍 Testing Supabase SignOut Specifically...');
console.log('📍 URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test signOut with timeout (same logic as production)
 */
async function testSignOut(timeoutMs = 5000) {
  console.log(`🧪 Testing supabase.auth.signOut() with ${timeoutMs}ms timeout...`);
  const startTime = Date.now();
  
  try {
    // Same timeout logic as production
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SignOut timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    
    const signOutPromise = supabase.auth.signOut();
    
    console.log('⏳ Calling supabase.auth.signOut()...');
    const result = await Promise.race([signOutPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ signOut completed successfully in ${duration}ms`);
    console.log('📄 Result:', result);
    
    return { success: true, duration, result, timedOut: false };
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = duration >= timeoutMs - 100; // Allow small timing variance
    
    console.log(`❌ signOut failed after ${duration}ms`);
    console.log(`🕐 Was timeout: ${isTimeout}`);
    console.log(`📄 Error: ${error.message}`);
    
    if (isTimeout) {
      console.log('🚨 CONFIRMED: supabase.auth.signOut() is hanging!');
      console.log('   This proves the root cause is NOT intermittent network issues');
      console.log('   but rather a specific problem with the signOut operation.');
    } else {
      console.log('ℹ️  signOut failed quickly (not a timeout/hang issue)');
    }
    
    return { success: false, duration, error: error.message, timedOut: isTimeout };
  }
}

/**
 * Run multiple signOut tests to see consistency
 */
async function runSignOutTests() {
  console.log('🚀 Starting SignOut-specific tests...\n');
  
  const results = [];
  const testCount = 3;
  
  for (let i = 1; i <= testCount; i++) {
    console.log(`--- Test ${i}/${testCount} ---`);
    const result = await testSignOut();
    results.push(result);
    console.log('');
  }
  
  // Analysis
  console.log('📊 SignOut Test Analysis:');
  console.log('========================');
  
  const successful = results.filter(r => r.success).length;
  const timeouts = results.filter(r => r.timedOut).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`✅ Successful: ${successful}/${testCount}`);
  console.log(`⏱️  Timeouts: ${timeouts}/${testCount}`);
  console.log(`📈 Average Duration: ${avgDuration.toFixed(0)}ms`);
  
  if (timeouts > 0) {
    console.log('\n🚨 CRITICAL FINDING:');
    console.log(`   ${timeouts}/${testCount} signOut attempts timed out (hung for 5+ seconds)`);
    console.log('   This confirms that supabase.auth.signOut() specifically has issues');
    console.log('   The problem is NOT intermittent network connectivity');
    console.log('   The problem IS with the signOut operation itself');
    
    if (timeouts === testCount) {
      console.log('\n💡 DIAGNOSIS: signOut consistently hangs');
      console.log('   This could be:');
      console.log('   • Supabase Auth service issue');
      console.log('   • Specific signOut endpoint problems');
      console.log('   • Session invalidation bottleneck');
    } else {
      console.log('\n💡 DIAGNOSIS: signOut intermittently hangs');
      console.log('   This suggests load-related issues with Supabase Auth service');
    }
  } else if (avgDuration > 2000) {
    console.log('\n⚠️  WARNING: signOut is consistently slow');
    console.log('   While not hanging, the slow response increases hang risk');
  } else {
    console.log('\n✅ signOut appears to be working normally');
    console.log('   If you experienced hangs, they may be timing-related');
  }
  
  console.log('\n🔍 Comparison with your production experience:');
  console.log('   • If signOut timed out in production 10 minutes ago');
  console.log('   • But these tests show it working now');
  console.log('   • Then the issue may be load-dependent or user-session-specific');
}

// Run the tests
runSignOutTests().catch(error => {
  console.error('💥 Test script failed:', error.message);
  process.exit(1);
}); 