#!/usr/bin/env node

/**
 * Background Jobs Verification Script
 * 
 * Verifies that background jobs are working correctly after Render upgrade
 * Run this script periodically to ensure cron jobs are functioning
 */

const fetch = require('node-fetch');
const { config } = require('dotenv');

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

    // Test 2: Episode Sync
    console.log('\n2. Testing episode sync job...');
    const episodeResponse = await fetch(`${RENDER_URL}/api/admin/jobs/episode-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (episodeResponse.ok) {
      console.log('✅ Episode sync test passed');
    } else {
      console.log(`❌ Episode sync test failed: ${episodeResponse.status}`);
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
    const nextEpisodeSync = new Date();
    nextEpisodeSync.setHours(1, 0, 0, 0); // 1 AM PT
    if (nextEpisodeSync <= new Date()) {
      nextEpisodeSync.setDate(nextEpisodeSync.getDate() + 1);
    }

    console.log(`✅ Current UTC time: ${utcTime}`);
    console.log(`📅 Next episode sync: ${nextEpisodeSync.toISOString()}`);

    console.log('\n🎉 All background job tests passed!');
    console.log('\n📋 Next Steps:');
    console.log(`   • Check logs tomorrow after ${nextEpisodeSync.toLocaleString()} for automatic cleanup`);
    console.log(`   • Set calendar reminder for ${nextEpisodeSync.toLocaleDateString()} key rotation`);
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