#!/usr/bin/env node

/**
 * Session State Analysis Tool
 * 
 * This script analyzes the current browser session state to understand
 * what might be causing signOut operations to hang.
 */

console.log('🔍 Session State Analysis Tool');
console.log('===============================');
console.log('');
console.log('📋 Instructions:');
console.log('1. Open your production app in a browser');
console.log('2. Log in with Spotify');
console.log('3. Open browser console and run this analysis:');
console.log('');
console.log('// COPY AND PASTE THIS CODE INTO YOUR BROWSER CONSOLE:');
console.log('');
console.log(`
// Session State Analysis
console.log('🔍 ANALYZING SESSION STATE...');

// 1. Check localStorage
console.log('\\n📦 LocalStorage Analysis:');
Object.keys(localStorage).forEach(key => {
  if (key.includes('supabase') || key.includes('sb-')) {
    const value = localStorage.getItem(key);
    console.log(\`  \${key}: \${value ? value.substring(0, 100) + '...' : 'null'}\`);
  }
});

// 2. Check sessionStorage  
console.log('\\n📦 SessionStorage Analysis:');
Object.keys(sessionStorage).forEach(key => {
  if (key.includes('supabase') || key.includes('sb-')) {
    const value = sessionStorage.getItem(key);
    console.log(\`  \${key}: \${value ? value.substring(0, 100) + '...' : 'null'}\`);
  }
});

// 3. Check cookies
console.log('\\n🍪 Cookie Analysis:');
document.cookie.split(';').forEach(cookie => {
  const [name, value] = cookie.split('=');
  if (name.trim().startsWith('sb-')) {
    console.log(\`  \${name.trim()}: \${value ? value.substring(0, 50) + '...' : 'null'}\`);
  }
});

// 4. Check if Supabase client exists
console.log('\\n🏗️ Supabase Client Analysis:');
if (typeof window !== 'undefined' && window.supabase) {
  console.log('  Supabase client: FOUND');
  console.log('  URL:', window.supabase.supabaseUrl);
  console.log('  Key (first 20 chars):', window.supabase.supabaseKey.substring(0, 20) + '...');
} else {
  console.log('  Supabase client: NOT FOUND in window');
}

// 5. Test session retrieval timing
console.log('\\n⏱️ Session Retrieval Timing Test:');
const startTime = Date.now();

// This requires you to have access to your supabase client
// Replace 'supabase' with however you access it in your app
const testSessionRetrieval = async () => {
  try {
    // You'll need to replace this with your actual supabase client access
    // For example: const { data: { session } } = await supabase.auth.getSession();
    console.log('  → Replace this with: await YourSupabaseClient.auth.getSession()');
    console.log('  → Time the operation and check for any delays');
  } catch (error) {
    console.log('  Session retrieval error:', error.message);
  }
};

console.log('\\n📊 Analysis Complete');
console.log('=====================');
console.log('');
console.log('🎯 What to look for:');
console.log('• Large session tokens (>10KB could indicate corruption)');
console.log('• Multiple conflicting session entries');
console.log('• Expired tokens that should have been refreshed');
console.log('• Provider tokens from Spotify that might be malformed');
console.log('• Session retrieval taking >100ms');
console.log('');
console.log('📤 Please share the output of this analysis!');
`);

console.log('');
console.log('🚀 After running the above in your browser console,');
console.log('   please share the output so we can identify the root cause!');

// Also create a Node.js version for general analysis
async function analyzeSupabaseConfig() {
  console.log('');
  console.log('🔧 Server-side Configuration Analysis:');
  console.log('=====================================');
  
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  
  console.log('📍 Supabase URL:', SUPABASE_URL);
  console.log('🔑 Anon Key (first 20 chars):', SUPABASE_ANON_KEY?.substring(0, 20) + '...');
  
  // Test auth endpoint response times
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    console.log('\\n⏱️ Auth Endpoint Response Times:');
    
    const endpoints = [
      '/auth/v1/settings',
      '/auth/v1/health',
      '/auth/v1/user'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY }
        });
        const duration = Date.now() - startTime;
        
        console.log(`  ${endpoint}: ${response.status} (${duration}ms)`);
        
        if (duration > 1000) {
          console.log(`    ⚠️ SLOW: ${endpoint} took ${duration}ms - this could cause signOut hangs`);
        }
        
      } catch (error) {
        console.log(`  ${endpoint}: ERROR - ${error.message}`);
      }
    }
  }
  
  console.log('\\n🎯 Server-side Analysis Complete');
}

// Run server-side analysis if in Node.js environment
if (typeof window === 'undefined') {
  require('dotenv').config();
  analyzeSupabaseConfig();
} 