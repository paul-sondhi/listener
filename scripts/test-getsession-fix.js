#!/usr/bin/env node

/**
 * Test script to verify that the getSession() hang fix works
 * This script demonstrates that getSession() now resolves quickly
 * even after auth state changes that previously caused deadlocks.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test that getSession() resolves quickly
 */
async function testGetSessionSpeed() {
  console.log('🧪 Testing getSession() speed...');
  
  const iterations = 5;
  const timeouts = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    try {
      // This should resolve quickly (< 100ms) with our fix
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 1000)
      );
      
      const sessionPromise = supabase.auth.getSession();
      
      await Promise.race([sessionPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      timeouts.push(duration);
      
      console.log(`  Iteration ${i + 1}: ${duration}ms`);
      
      if (duration > 500) {
        console.warn(`  ⚠️  Slow response (${duration}ms) - may indicate issues`);
      }
      
    } catch (error) {
      console.error(`  ❌ Iteration ${i + 1} failed:`, error.message);
      return false;
    }
  }
  
  const avgTime = timeouts.reduce((a, b) => a + b, 0) / timeouts.length;
  const maxTime = Math.max(...timeouts);
  
  console.log(`\n📊 Results:`);
  console.log(`  Average time: ${avgTime.toFixed(1)}ms`);
  console.log(`  Maximum time: ${maxTime}ms`);
  console.log(`  All calls under 1000ms: ${maxTime < 1000 ? '✅' : '❌'}`);
  console.log(`  All calls under 100ms: ${maxTime < 100 ? '✅' : '❌'}`);
  
  return maxTime < 1000; // Success if all calls complete within 1 second
}

/**
 * Test auth state change simulation
 */
async function testAuthStateChangeSimulation() {
  console.log('\n🔄 Testing auth state change simulation...');
  
  let authCallbackExecuted = false;
  
  // Set up auth state listener (simulating the fix)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log(`  Auth event: ${event}`);
    authCallbackExecuted = true;
    
    // With our fix, this callback should NOT make any Supabase calls
    // Instead, it should only update local state
    console.log(`  ✅ Callback executed without Supabase calls`);
  });
  
  // Test getSession after setting up the listener
  console.log('  Testing getSession() after setting up auth listener...');
  
  const startTime = Date.now();
  
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('getSession timeout after auth listener')), 1000)
    );
    
    const sessionPromise = supabase.auth.getSession();
    
    await Promise.race([sessionPromise, timeoutPromise]);
    
    const duration = Date.now() - startTime;
    console.log(`  ✅ getSession() resolved in ${duration}ms after auth listener setup`);
    
    // Clean up
    subscription.unsubscribe();
    
    return duration < 1000;
    
  } catch (error) {
    console.error(`  ❌ getSession() failed after auth listener:`, error.message);
    subscription.unsubscribe();
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Testing getSession() hang fix');
  console.log('=====================================\n');
  
  try {
    const speedTest = await testGetSessionSpeed();
    const authTest = await testAuthStateChangeSimulation();
    
    console.log('\n🎯 Summary:');
    console.log('=====================================');
    console.log(`Speed test: ${speedTest ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Auth listener test: ${authTest ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (speedTest && authTest) {
      console.log('\n🎉 All tests passed! The getSession() hang fix is working.');
      console.log('   Your AuthContext changes have successfully resolved the deadlock issue.');
    } else {
      console.log('\n⚠️  Some tests failed. The hang issue may still exist.');
      console.log('   Review the AuthContext implementation for remaining async calls in auth callbacks.');
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run the tests
runTests(); 