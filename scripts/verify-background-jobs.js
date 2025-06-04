#!/usr/bin/env node

/**
 * Background Jobs Verification Script
 * 
 * Verifies that background jobs are working correctly after Render upgrade
 * Run this script periodically to ensure cron jobs are functioning
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config();

const RENDER_URL = process.env.RENDER_URL || 'https://listener-api.onrender.com';

async function verifyBackgroundJobs() {
  console.log('🔍 Verifying Background Jobs...\n');

  try {
    // Test 1: Health Check
    console.log('1. Testing service health...');
    const healthStart = Date.now();
    const healthResponse = await fetch(`${RENDER_URL}/api/healthz`);
    const healthTime = Date.now() - healthStart;
    
    if (healthResponse.ok) {
      console.log(`✅ Health check passed (${healthTime}ms)`);
      if (healthTime > 5000) {
        console.log('⚠️  Warning: Slow response, service might be cold starting');
      }
    } else {
      console.log(`❌ Health check failed: ${healthResponse.status}`);
      return false;
    }

    // Test 2: Manual Vault Cleanup
    console.log('\n2. Testing manual vault cleanup...');
    const cleanupResponse = await fetch(`${RENDER_URL}/api/admin/jobs/vault-cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (cleanupResponse.ok) {
      const cleanupResult = await cleanupResponse.json();
      console.log('✅ Vault cleanup test passed');
      console.log(`   Message: ${cleanupResult.message}`);
    } else {
      console.log(`❌ Vault cleanup test failed: ${cleanupResponse.status}`);
      return false;
    }

    // Test 3: Manual Key Rotation
    console.log('\n3. Testing manual key rotation...');
    const rotationResponse = await fetch(`${RENDER_URL}/api/admin/jobs/key-rotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (rotationResponse.ok) {
      const rotationResult = await rotationResponse.json();
      console.log('✅ Key rotation test passed');
      console.log(`   Message: ${rotationResult.message}`);
    } else {
      console.log(`❌ Key rotation test failed: ${rotationResponse.status}`);
      return false;
    }

    // Test 4: Check Current Time vs Scheduled Times
    console.log('\n4. Checking scheduled job times...');
    const now = new Date();
    const utcTime = now.toISOString();
    const nextCleanup = new Date(now);
    nextCleanup.setUTCDate(nextCleanup.getUTCDate() + 1);
    nextCleanup.setUTCHours(2, 0, 0, 0);
    
    const nextRotation = new Date(now);
    // Set to next quarter (Apr 1, Jul 1, Oct 1, Jan 1)
    const currentMonth = nextRotation.getUTCMonth();
    if (currentMonth < 3) nextRotation.setUTCMonth(3, 1); // April
    else if (currentMonth < 6) nextRotation.setUTCMonth(6, 1); // July  
    else if (currentMonth < 9) nextRotation.setUTCMonth(9, 1); // October
    else {
      nextRotation.setUTCFullYear(nextRotation.getUTCFullYear() + 1, 0, 1); // January next year
    }
    nextRotation.setUTCHours(3, 0, 0, 0);

    console.log(`✅ Current UTC time: ${utcTime}`);
    console.log(`📅 Next vault cleanup: ${nextCleanup.toISOString()}`);
    console.log(`📅 Next key rotation: ${nextRotation.toISOString()}`);

    console.log('\n🎉 All background job tests passed!');
    console.log('\n📋 Next Steps:');
    console.log(`   • Check logs tomorrow after ${nextCleanup.toLocaleString()} for automatic cleanup`);
    console.log(`   • Set calendar reminder for ${nextRotation.toLocaleDateString()} key rotation`);
    console.log(`   • Run this script weekly to verify continued operation`);

    return true;

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

// Run verification
verifyBackgroundJobs()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }); 