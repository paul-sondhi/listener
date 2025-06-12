#!/usr/bin/env node

/**
 * Debug Vault Schema Access
 * The vault extension is enabled but we can't access vault.secrets via API
 */

// Load environment variables from .env file
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

async function checkVaultSchema() {
  console.log('🔍 Debugging Vault Schema Access');
  console.log('=================================');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    console.log('1. Testing direct vault.secrets access...');
    const { data: directVault, error: directError } = await supabase
      .from('vault.secrets')
      .select('*')
      .limit(1);
    
    if (directError) {
      console.log('❌ Direct access failed:', directError.message);
    } else {
      console.log('✅ Direct access worked!');
      console.log(`   Found ${directVault?.length || 0} secrets`);
    }
    
    console.log('\n2. Testing RPC function availability...');
    const { data: _rpcTest, error: rpcError } = await supabase
      .rpc('vault_read_user_secret', {
        p_secret_id: '00000000-0000-0000-0000-000000000000'
      });
    
    if (rpcError) {
      console.log('❌ RPC function test:', rpcError.message);
      if (rpcError.message.includes('does not exist')) {
        console.log('   → Custom RPC functions may not be created yet');
        console.log('   → Need to run migration: 20250107000004_add_vault_crud_functions.sql');
      } else if (rpcError.message.includes('Secret not found')) {
        console.log('✅ RPC function exists (expected error with dummy ID)');
      }
    } else {
      console.log('✅ RPC function worked (unexpected)');
    }
    
    console.log('\n3. Testing if vault functions exist in database...');
    const { data: functions, error: funcError } = await supabase
      .from('pg_proc')
      .select('proname')
      .ilike('proname', 'vault_%')
      .limit(10);
    
    if (funcError) {
      console.log('❌ Cannot query pg_proc:', funcError.message);
    } else {
      console.log('✅ Function query successful');
      if (functions && functions.length > 0) {
        console.log('   Vault functions found:', functions.map(f => f.proname).join(', '));
      } else {
        console.log('   No vault functions found - migrations may not be applied');
      }
    }
    
    console.log('\n4. Testing supabase auth context...');
    const { data: _authTest, error: authError } = await supabase.auth.getUser();
    console.log('Auth context:', authError ? 'No user context (service role)' : 'User context available');
    
    console.log('\n📊 DIAGNOSIS');
    console.log('=============');
    
    if (!directError) {
      console.log('✅ Vault is working correctly!');
      console.log('   You can proceed with full verification');
    } else if (rpcError && !rpcError.message.includes('does not exist')) {
      console.log('⚠️  Vault extension enabled but API access limited');
      console.log('   This is common - try using RPC functions instead');
    } else {
      console.log('❌ Vault setup incomplete');
      console.log('   1. Check if all migrations have been applied');
      console.log('   2. Verify RPC functions are created');
      console.log('   3. Check service role permissions');
    }
    
  } catch (error) {
    console.log('❌ Unexpected error:', error.message);
  }
}

checkVaultSchema(); 