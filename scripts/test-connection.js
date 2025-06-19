#!/usr/bin/env node

/**
 * Simple connection test to debug Supabase credentials
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

async function testConnection() {
  console.log('🔗 Testing Supabase Connection');
  console.log('==============================');
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Environment check:');
  console.log(`  URL: ${url ? url.substring(0, 40) + '...' : '❌ Missing'}`);
  console.log(`  Key: ${key ? key.substring(0, 20) + '...' : '❌ Missing'}`);
  
  if (!url || !key) {
    console.log('\n❌ Missing credentials. Please set:');
    console.log('   export SUPABASE_URL="https://your-project.supabase.co"');
    console.log('   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
    process.exit(1);
  }
  
  try {
    console.log('\n🔍 Creating Supabase client...');
    const supabase = createClient(url, key);
    
    console.log('✅ Client created successfully');
    
    console.log('\n🔍 Testing basic query...');
    
    // Try a simple table query that should exist in your app
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (error) {
      console.log('❌ Users table query failed:', error.message);
      console.log('\n🚨 This suggests:');
      console.log('   1. API key is invalid or expired');
      console.log('   2. URL and key don\'t match');
      console.log('   3. Service role key lacks basic permissions');
      console.log('   4. Users table doesn\'t exist (unlikely)');
      console.log('\n💡 Check your Supabase dashboard:');
      console.log('   → Settings → API → Service Role Key');
      process.exit(1);
    } else {
      console.log('✅ Users table query successful');
      console.log(`   Found ${data?.length || 0} users (showing max 1)`);
    }
    
    console.log('\n🔍 Testing encrypted token functionality...');
    const { data: encryptionTest, error: encryptionError } = await supabase
      .rpc('test_encryption', { test_data: 'test' });

    if (encryptionError) {
      console.log('❌ Encrypted token functions not available:', encryptionError.message);
      if (encryptionError.message.includes('does not exist')) {
        console.log('   → Encrypted token functions may not be migrated yet');
      }
    } else {
      console.log('✅ Encrypted token functions are available');
      console.log(`   Test result: ${encryptionTest || 'success'}`);
    }
    
    console.log('\n📊 CONNECTION TEST SUMMARY');
    console.log('==========================');
    console.log('✅ Supabase connection is working!');
    console.log('✅ Service role key has basic permissions');
    console.log('✅ Ready to test encrypted token functionality');
    
    process.exit(0);
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
    console.log('\n🔍 Error details:');
    console.log('   Type:', error.constructor.name);
    if (error.status) console.log('   Status:', error.status);
    if (error.statusText) console.log('   Status Text:', error.statusText);
    
    process.exit(1);
  }
}

testConnection(); 