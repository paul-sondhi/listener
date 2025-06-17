#!/usr/bin/env node

/**
 * Authenticated Supabase SignOut Test
 * 
 * This script creates an authenticated session and then tests signOut,
 * replicating the exact production scenario where signOut hangs.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🔍 Testing Authenticated SignOut Scenario...');
console.log('📍 URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test signOut with an authenticated session
 */
async function testAuthenticatedSignOut() {
  console.log('🔑 Step 1: Checking current session...');
  
  // Check if there's already a session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('❌ Error getting session:', sessionError);
    return;
  }
  
  if (session) {
    console.log('✅ Found authenticated session');
    console.log(`👤 User: ${session.user.email}`);
    console.log(`🕐 Session expires: ${new Date(session.expires_at * 1000).toISOString()}`);
    console.log(`🎫 Access token: ${session.access_token.substring(0, 20)}...`);
    console.log('');
    
    // Now test signOut with this authenticated session
    await testSignOutWithSession();
  } else {
    console.log('❌ No authenticated session found');
    console.log('💡 To test this properly, you need to:');
    console.log('   1. Log into your app in a browser');
    console.log('   2. Copy the session from browser storage');
    console.log('   3. Or run this test from within your authenticated app context');
    console.log('');
    console.log('🧪 Testing signOut without session (should be fast)...');
    await testSignOutWithSession();
  }
}

/**
 * Test signOut with current session state
 */
async function testSignOutWithSession() {
  console.log('🧪 Testing supabase.auth.signOut()...');
  const startTime = Date.now();
  
  try {
    // Same timeout logic as production
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SignOut timeout after 5 seconds')), 5000);
    });
    
    const signOutPromise = supabase.auth.signOut();
    
    console.log('⏳ Calling supabase.auth.signOut()...');
    const result = await Promise.race([signOutPromise, timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ signOut completed successfully in ${duration}ms`);
    console.log('📄 Result:', result);
    
    if (duration > 1000) {
      console.log('⚠️  WARNING: signOut took longer than 1 second');
      console.log('   This indicates potential performance issues');
    }
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = duration >= 4900; // Allow timing variance
    
    console.log(`❌ signOut failed after ${duration}ms`);
    console.log(`🕐 Was timeout: ${isTimeout}`);
    console.log(`📄 Error: ${error.message}`);
    
    if (isTimeout) {
      console.log('');
      console.log('🚨 CRITICAL: signOut is hanging with authenticated session!');
      console.log('   This replicates the production issue exactly');
      console.log('   Root causes could be:');
      console.log('   • Supabase Auth service overload');
      console.log('   • Token invalidation endpoint issues');
      console.log('   • Network connectivity to auth.supabase.io');
      console.log('   • Database locks during session cleanup');
    }
  }
}

/**
 * Test network connectivity to Supabase Auth endpoints specifically
 */
async function testAuthEndpointConnectivity() {
  console.log('🌐 Testing connectivity to Supabase Auth endpoints...');
  
  try {
    // Test the auth endpoint specifically
    const authUrl = `${SUPABASE_URL}/auth/v1/logout`;
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      // Don't send actual auth data, just test connectivity
    });
    
    console.log(`📡 Auth endpoint response: ${response.status} ${response.statusText}`);
    
    if (response.status === 401 || response.status === 400) {
      console.log('✅ Auth endpoint is reachable (expected auth error)');
    } else {
      console.log(`⚠️  Unexpected response from auth endpoint`);
    }
    
  } catch (error) {
    console.log(`❌ Auth endpoint connectivity issue: ${error.message}`);
    console.log('   This could explain why signOut hangs');
  }
}

/**
 * Main test execution
 */
async function runTests() {
  try {
    console.log('🚀 Starting authenticated signOut investigation...\n');
    
    await testAuthenticatedSignOut();
    console.log('');
    await testAuthEndpointConnectivity();
    
    console.log('\n📋 Investigation Summary:');
    console.log('========================');
    console.log('• If signOut timed out with an authenticated session → Confirms production issue');
    console.log('• If signOut worked quickly → Issue may be session-state specific');
    console.log('• If auth endpoint is unreachable → Network connectivity issue');
    console.log('• If auth endpoint is reachable → Supabase Auth service issue');
    
    console.log('\n💡 Next Steps:');
    console.log('• Run this test while logged into your production app');
    console.log('• Compare results during different times of day');
    console.log('• Monitor Supabase status page for Auth service issues');
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    process.exit(1);
  }
}

runTests(); 