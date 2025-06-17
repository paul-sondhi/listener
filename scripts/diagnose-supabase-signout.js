#!/usr/bin/env node

/**
 * Supabase SignOut Diagnostic Tool
 * 
 * This script comprehensively tests different signOut scenarios to understand
 * exactly why signOut is hanging and what the root cause is.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🔍 Comprehensive Supabase SignOut Diagnosis...');
console.log('📍 URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test different signOut methods
 */
async function testSignOutMethod(methodName, signOutFunction, timeoutMs = 5000) {
  console.log(`🧪 Testing ${methodName}...`);
  const startTime = Date.now();
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${methodName} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    
    const result = await Promise.race([signOutFunction(), timeoutPromise]);
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${methodName} succeeded in ${duration}ms`);
    console.log('📄 Result:', result);
    
    return { success: true, duration, result, method: methodName };
  } catch (error) {
    const duration = Date.now() - startTime;
    const isTimeout = duration >= timeoutMs - 100;
    
    console.log(`❌ ${methodName} failed after ${duration}ms`);
    console.log(`🕐 Was timeout: ${isTimeout}`);
    console.log(`📄 Error: ${error.message}`);
    
    return { success: false, duration, error: error.message, isTimeout, method: methodName };
  }
}

/**
 * Test direct HTTP calls to auth endpoints
 */
async function testDirectAuthCalls() {
  console.log('🌐 Testing direct auth endpoint calls...');
  
  const tests = [
    {
      name: 'GET /auth/v1/settings',
      url: `${SUPABASE_URL}/auth/v1/settings`,
      method: 'GET',
      headers: { 'apikey': SUPABASE_ANON_KEY }
    },
    {
      name: 'POST /auth/v1/logout (without auth)',
      url: `${SUPABASE_URL}/auth/v1/logout`,
      method: 'POST',
      headers: { 
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    console.log(`📡 Testing ${test.name}...`);
    const startTime = Date.now();
    
    try {
      const response = await fetch(test.url, {
        method: test.method,
        headers: test.headers,
        body: test.body
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${test.name}: ${response.status} ${response.statusText} (${duration}ms)`);
      
      results.push({ 
        name: test.name, 
        success: true, 
        status: response.status, 
        duration 
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${test.name}: ${error.message} (${duration}ms)`);
      
      results.push({ 
        name: test.name, 
        success: false, 
        error: error.message, 
        duration 
      });
    }
  }
  
  return results;
}

/**
 * Monitor network requests during signOut
 */
async function analyzeSignOutNetworkActivity() {
  console.log('📊 Analyzing network activity during signOut...');
  
  // This would require browser environment for proper network monitoring
  // For now, we'll test different aspects of the signOut process
  
  console.log('🔍 Testing signOut sub-operations...');
  
  // Test 1: Can we get current session?
  try {
    const sessionStart = Date.now();
    const { data: { session }, error } = await supabase.auth.getSession();
    const sessionDuration = Date.now() - sessionStart;
    
    console.log(`📋 getSession() took ${sessionDuration}ms`);
    if (session) {
      console.log(`👤 Current user: ${session.user.email}`);
      console.log(`🎫 Token expires: ${new Date(session.expires_at * 1000).toISOString()}`);
    } else {
      console.log('👤 No current session');
    }
  } catch (sessionError) {
    console.log(`❌ getSession() failed: ${sessionError.message}`);
  }
  
  // Test 2: Auth service health check
  try {
    const healthStart = Date.now();
    const healthResponse = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { 'apikey': SUPABASE_ANON_KEY }
    });
    const healthDuration = Date.now() - healthStart;
    
    console.log(`🏥 Auth health check: ${healthResponse.status} (${healthDuration}ms)`);
  } catch (healthError) {
    console.log(`❌ Auth health check failed: ${healthError.message}`);
  }
}

/**
 * Main diagnostic function
 */
async function runComprehensiveDiagnosis() {
  try {
    console.log('🚀 Starting comprehensive signOut diagnosis...\n');
    
    // Step 1: Test direct auth endpoints
    console.log('=== STEP 1: Direct Auth Endpoint Tests ===');
    const directTests = await testDirectAuthCalls();
    console.log('');
    
    // Step 2: Analyze current auth state
    console.log('=== STEP 2: Current Auth State Analysis ===');
    await analyzeSignOutNetworkActivity();
    console.log('');
    
    // Step 3: Test different signOut methods
    console.log('=== STEP 3: SignOut Method Tests ===');
    const signOutTests = [
      {
        name: 'Standard signOut()',
        fn: () => supabase.auth.signOut()
      },
      {
        name: 'Local scope signOut()',
        fn: () => supabase.auth.signOut({ scope: 'local' })
      },
      {
        name: 'Global scope signOut()',
        fn: () => supabase.auth.signOut({ scope: 'global' })
      }
    ];
    
    const signOutResults = [];
    for (const test of signOutTests) {
      const result = await testSignOutMethod(test.name, test.fn);
      signOutResults.push(result);
      console.log(''); // Empty line for readability
    }
    
    // Step 4: Analysis and recommendations
    console.log('=== STEP 4: Analysis & Recommendations ===');
    
    const directIssues = directTests.filter(t => !t.success || t.duration > 2000);
    const signOutIssues = signOutResults.filter(t => !t.success || t.isTimeout);
    const fastMethods = signOutResults.filter(t => t.success && t.duration < 1000);
    
    console.log('📊 Summary:');
    console.log(`   Direct endpoint tests: ${directTests.length - directIssues.length}/${directTests.length} passed`);
    console.log(`   SignOut method tests: ${signOutResults.length - signOutIssues.length}/${signOutResults.length} succeeded`);
    console.log(`   Fast signOut methods: ${fastMethods.length}`);
    
    if (directIssues.length > 0) {
      console.log('\n🚨 Direct Endpoint Issues:');
      directIssues.forEach(issue => {
        console.log(`   • ${issue.name}: ${issue.error || 'Slow response'} (${issue.duration}ms)`);
      });
    }
    
    if (signOutIssues.length > 0) {
      console.log('\n🚨 SignOut Issues:');
      signOutIssues.forEach(issue => {
        console.log(`   • ${issue.method}: ${issue.error} (${issue.duration}ms, timeout: ${issue.isTimeout})`);
      });
    }
    
    if (fastMethods.length > 0) {
      console.log('\n✅ Working Methods:');
      fastMethods.forEach(method => {
        console.log(`   • ${method.method}: ${method.duration}ms`);
      });
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (signOutResults.every(r => r.isTimeout)) {
      console.log('   🔥 ALL signOut methods are timing out!');
      console.log('   → This indicates a serious Supabase Auth service issue');
      console.log('   → Consider reporting to Supabase support');
      console.log('   → Use manual token invalidation as workaround');
    } else if (fastMethods.length > 0) {
      console.log(`   ✅ Use ${fastMethods[0].method} as it works reliably`);
    }
    
    if (directIssues.length > 0) {
      console.log('   🌐 Network connectivity issues detected');
      console.log('   → Check firewall/proxy settings');
      console.log('   → Verify DNS resolution for Supabase endpoints');
    }
    
  } catch (error) {
    console.error('💥 Diagnosis failed:', error.message);
    process.exit(1);
  }
}

runComprehensiveDiagnosis(); 