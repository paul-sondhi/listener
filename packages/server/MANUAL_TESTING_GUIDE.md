# Manual Testing Guide: Daily Podcast Subscription Refresh System

> **⚠️ SCHEMA UPDATE NOTICE**: This guide contains references to the old `podcast_subscriptions` table. 
> The schema has been updated to use `user_podcast_subscriptions` table. Please update your SQL queries accordingly.
> See `SCHEMA_MIGRATION_STATUS.md` for details.

This guide provides comprehensive instructions for manually testing the **Daily Podcast Subscription Refresh System** at various levels, from individual components to complete end-to-end workflows.

## Table of Contents

1. [Quick Test Overview](#quick-test-overview)
2. [Testing via Admin API Endpoints](#testing-via-admin-api-endpoints)
3. [Direct Function Testing](#direct-function-testing)
4. [Database Integration Testing](#database-integration-testing)
5. [Scheduler Testing](#scheduler-testing)
6. [Error Scenario Testing](#error-scenario-testing)
7. [Performance Testing](#performance-testing)

## Quick Test Overview

### **Prerequisites**
- Server is running: `npm run dev`
- Database is accessible (Supabase connection working)
- At least one user with `spotify_vault_secret_id` in the database
- Admin API endpoints are available

### **🚀 5-Minute Quick Test**

```bash
# 1. Check system status
curl http://localhost:3000/api/admin/status

# 2. Get refresh status and estimates
curl http://localhost:3000/api/admin/subscription-refresh/status

# 3. Manually trigger a subscription refresh (safest test)
curl -X POST http://localhost:3000/api/admin/subscription-refresh/run

# 4. Check the results
curl http://localhost:3000/api/admin/subscription-refresh/status
```

## Testing via Admin API Endpoints

### **1. System Health Check**

```bash
# Check overall system status
curl -X GET http://localhost:3000/api/admin/status | jq

# Expected Response:
{
  "status": "healthy",
  "system": {
    "uptime": 12345,
    "memory": { ... },
    "node_version": "v18.x.x"
  },
  "database": {
    "connected": true
  },
  "background_jobs": {
    "scheduler_active": true,
    "daily_refresh": {
      "enabled": true,
      "cron_expression": "0 0 * * *",
      "timezone": "America/Los_Angeles"
    }
  },
  "user_statistics": {
    "total_users": 100,
    "spotify_integrated": 75,
    "needs_reauth": 5,
    "no_integration": 20
  }
}
```

### **2. Subscription Refresh Status**

```bash
# Get detailed refresh status and estimates
curl -X GET http://localhost:3000/api/admin/subscription-refresh/status | jq

# Expected Response:
{
  "system_status": {
    "total_users": 100,
    "users_with_spotify": 75,
    "users_needing_reauth": 5
  },
  "refresh_estimates": {
    "estimated_duration_minutes": 8,
    "estimated_api_calls": 75
  },
  "last_refresh": {
    "timestamp": "2024-01-15T08:00:00.000Z",
    "success": true,
    "users_processed": 75,
    "duration_ms": 480000
  },
  "configuration": {
    "enabled": true,
    "cron_schedule": "0 0 * * *",
    "timezone": "America/Los_Angeles",
    "batch_size": 5,
    "batch_delay": 2000
  }
}
```

### **3. Manual Job Triggering**

```bash
# Trigger a complete subscription refresh manually
curl -X POST http://localhost:3000/api/admin/subscription-refresh/run | jq

# Expected Response:
{
  "success": true,
  "execution_time": 15000,
  "result": {
    "success": true,
    "total_users": 10,
    "successful_users": 8,
    "failed_users": 2,
    "processing_time_ms": 12000,
    "summary": {
      "total_active_subscriptions": 45,
      "total_inactive_subscriptions": 12,
      "auth_errors": 1,
      "spotify_api_errors": 1,
      "database_errors": 0
    }
  }
}
```

### **4. Trigger Specific Job Types**

```bash
# Trigger via background job system
curl -X POST http://localhost:3000/api/admin/jobs/daily_subscription_refresh/run | jq

# Alternative job names
curl -X POST http://localhost:3000/api/admin/jobs/subscription_refresh/run | jq
```

## Direct Function Testing

### **1. Test Individual User Refresh**

Create a test script `test-user-refresh.js`:

```javascript
// test-user-refresh.js
import { refreshUserSubscriptions } from './services/subscriptionRefreshService.js';

async function testUserRefresh() {
  const userId = 'your-test-user-id'; // Replace with actual user ID
  const jobId = `manual-test-${Date.now()}`;
  
  console.log(`🧪 Testing refresh for user: ${userId}`);
  
  try {
    const result = await refreshUserSubscriptions(userId, jobId);
    
    console.log('✅ Refresh completed:', {
      success: result.success,
      activeCount: result.active_count,
      inactiveCount: result.inactive_count,
      error: result.error || 'None'
    });
    
    if (result.success) {
      console.log(`📊 Successfully refreshed subscriptions:`);
      console.log(`   - Active: ${result.active_count}`);
      console.log(`   - Inactive: ${result.inactive_count}`);
    } else {
      console.log(`❌ Refresh failed: ${result.error}`);
      if (result.auth_error) console.log('   - Authentication issue detected');
      if (result.spotify_api_error) console.log('   - Spotify API issue detected');
      if (result.database_error) console.log('   - Database issue detected');
    }
    
  } catch (error) {
    console.error('❌ Test failed with exception:', error);
  }
}

testUserRefresh();
```

Run the test:
```bash
cd packages/server
node test-user-refresh.js
```

### **2. Test Batch Processing**

Create a test script `test-batch-refresh.js`:

```javascript
// test-batch-refresh.js
import { refreshAllUserSubscriptionsEnhanced } from './services/subscriptionRefreshService.js';

async function testBatchRefresh() {
  console.log('🧪 Testing batch refresh for all users...');
  
  const startTime = Date.now();
  
  try {
    const result = await refreshAllUserSubscriptionsEnhanced();
    const duration = Date.now() - startTime;
    
    console.log('✅ Batch refresh completed:', {
      success: result.success,
      totalUsers: result.total_users,
      successfulUsers: result.successful_users,
      failedUsers: result.failed_users,
      durationMs: duration
    });
    
    console.log('📊 Summary Statistics:');
    console.log(`   - Success Rate: ${((result.successful_users / result.total_users) * 100).toFixed(1)}%`);
    console.log(`   - Total Active Subscriptions: ${result.summary.total_active_subscriptions}`);
    console.log(`   - Total Inactive Subscriptions: ${result.summary.total_inactive_subscriptions}`);
    
    if (result.summary.auth_errors > 0) {
      console.log(`   - Auth Errors: ${result.summary.auth_errors}`);
    }
    if (result.summary.spotify_api_errors > 0) {
      console.log(`   - API Errors: ${result.summary.spotify_api_errors}`);
    }
    if (result.summary.database_errors > 0) {
      console.log(`   - Database Errors: ${result.summary.database_errors}`);
    }
    
  } catch (error) {
    console.error('❌ Batch test failed:', error);
  }
}

testBatchRefresh();
```

### **3. Test User Discovery**

```javascript
// test-user-discovery.js
import { 
  getAllUsersWithSpotifyTokens, 
  getUserSpotifyStatistics,
  validateUserSpotifyIntegration 
} from './services/subscriptionRefreshService.js';

async function testUserDiscovery() {
  console.log('🧪 Testing user discovery functions...');
  
  try {
    // Test user statistics
    const stats = await getUserSpotifyStatistics();
    console.log('📊 User Statistics:', stats);
    
    // Test user discovery
    const userIds = await getAllUsersWithSpotifyTokens();
    console.log(`👥 Found ${userIds.length} users with Spotify integration`);
    
    // Test individual user validation
    if (userIds.length > 0) {
      const testUserId = userIds[0];
      const isValid = await validateUserSpotifyIntegration(testUserId);
      console.log(`✅ User ${testUserId} integration valid: ${isValid}`);
    }
    
  } catch (error) {
    console.error('❌ User discovery test failed:', error);
  }
}

testUserDiscovery();
```

## Database Integration Testing

### **1. Check Current Subscription Data**

```sql
-- Connect to your database and run these queries

-- Check total subscription counts
SELECT 
  status,
  COUNT(*) as count
FROM podcast_subscriptions 
GROUP BY status;

-- Check recent subscription activity
SELECT 
  user_id,
  COUNT(*) as total_subscriptions,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_subscriptions,
  COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_subscriptions,
  MAX(updated_at) as last_updated
FROM podcast_subscriptions 
GROUP BY user_id 
ORDER BY last_updated DESC 
LIMIT 10;

-- Check users with Spotify integration
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN spotify_vault_secret_id IS NOT NULL THEN 1 END) as spotify_integrated,
  COUNT(CASE WHEN spotify_reauth_required = true THEN 1 END) as needs_reauth
FROM users;
```

### **2. Monitor Database Changes During Refresh**

Before running a refresh, take a snapshot:

```sql
-- Pre-refresh snapshot
CREATE TEMP TABLE pre_refresh_snapshot AS
SELECT user_id, status, COUNT(*) as count
FROM podcast_subscriptions 
GROUP BY user_id, status;
```

Run the refresh, then compare:

```sql
-- Post-refresh comparison
SELECT 
  p.user_id,
  p.status,
  p.count as current_count,
  s.count as previous_count,
  (p.count - COALESCE(s.count, 0)) as change
FROM (
  SELECT user_id, status, COUNT(*) as count
  FROM podcast_subscriptions 
  GROUP BY user_id, status
) p
LEFT JOIN pre_refresh_snapshot s ON p.user_id = s.user_id AND p.status = s.status
WHERE p.count != COALESCE(s.count, 0)
ORDER BY change DESC;
```

## Scheduler Testing

### **1. Test Job Configuration**

```javascript
// test-scheduler-config.js
import { initializeBackgroundJobs } from './services/backgroundJobs.js';

// Test scheduler initialization
console.log('🧪 Testing scheduler configuration...');

// Check environment variables
const config = {
  enabled: process.env.DAILY_REFRESH_ENABLED,
  cron: process.env.DAILY_REFRESH_CRON,
  timezone: process.env.DAILY_REFRESH_TIMEZONE,
  batchSize: process.env.DAILY_REFRESH_BATCH_SIZE,
  batchDelay: process.env.DAILY_REFRESH_BATCH_DELAY
};

console.log('📋 Scheduler Configuration:', config);

// Initialize (won't actually schedule in test environment)
try {
  initializeBackgroundJobs();
  console.log('✅ Scheduler initialization successful');
} catch (error) {
  console.error('❌ Scheduler initialization failed:', error);
}
```

### **2. Test Manual Job Execution**

```javascript
// test-manual-job.js
import { runJob, dailySubscriptionRefreshJob } from './services/backgroundJobs.js';

async function testManualJobExecution() {
  console.log('🧪 Testing manual job execution...');
  
  try {
    // Test direct job function call
    console.log('📞 Calling dailySubscriptionRefreshJob directly...');
    await dailySubscriptionRefreshJob();
    console.log('✅ Direct job call completed');
    
    // Test via job runner
    console.log('🏃 Running job via runJob function...');
    await runJob('daily_subscription_refresh');
    console.log('✅ Job runner completed');
    
  } catch (error) {
    console.error('❌ Manual job test failed:', error);
  }
}

testManualJobExecution();
```

## Error Scenario Testing

### **1. Test Authentication Failures**

Temporarily modify a user's Spotify tokens to invalid values and run a refresh to test auth error handling:

```sql
-- Temporarily invalidate a user's tokens (BACKUP FIRST!)
UPDATE users 
SET spotify_vault_secret_id = 'invalid-vault-id' 
WHERE id = 'test-user-id-here';

-- Run refresh and observe auth error handling
-- Then restore the valid vault ID
```

### **2. Test API Rate Limiting**

Create a test that makes rapid successive calls to trigger rate limiting:

```javascript
// test-rate-limiting.js
import { refreshUserSubscriptions } from './services/subscriptionRefreshService.js';

async function testRateLimiting() {
  const userId = 'your-test-user-id';
  
  console.log('🧪 Testing rate limiting with rapid calls...');
  
  const promises = Array(10).fill(null).map((_, i) => 
    refreshUserSubscriptions(userId, `rate-test-${i}`)
  );
  
  const results = await Promise.allSettled(promises);
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`Call ${index}: ${result.value.success ? 'Success' : 'Failed'}`);
      if (!result.value.success) {
        console.log(`  Error: ${result.value.error}`);
      }
    } else {
      console.log(`Call ${index}: Exception - ${result.reason}`);
    }
  });
}

testRateLimiting();
```

### **3. Test Network Issues**

Temporarily block external network access or modify `/etc/hosts` to simulate network failures:

```bash
# Block Spotify API (requires sudo)
echo "127.0.0.1 api.spotify.com" | sudo tee -a /etc/hosts

# Run refresh test
node test-user-refresh.js

# Restore access
sudo sed -i '' '/api.spotify.com/d' /etc/hosts
```

## Performance Testing

### **1. Measure Refresh Performance**

```javascript
// test-performance.js
import { refreshAllUserSubscriptionsEnhanced } from './services/subscriptionRefreshService.js';

async function testPerformance() {
  console.log('🧪 Testing refresh performance...');
  
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  try {
    const result = await refreshAllUserSubscriptionsEnhanced();
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    const duration = endTime - startTime;
    const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
    
    console.log('📊 Performance Metrics:');
    console.log(`   - Total Duration: ${duration}ms`);
    console.log(`   - Users Processed: ${result.total_users}`);
    console.log(`   - Avg Time per User: ${(duration / result.total_users).toFixed(0)}ms`);
    console.log(`   - Memory Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   - Success Rate: ${((result.successful_users / result.total_users) * 100).toFixed(1)}%`);
    
    // Performance benchmarks
    const avgTimePerUser = duration / result.total_users;
    if (avgTimePerUser > 5000) {
      console.log('⚠️  WARNING: Average time per user exceeds 5 seconds');
    }
    
    if (memoryIncrease > 100 * 1024 * 1024) { // 100MB
      console.log('⚠️  WARNING: Memory increase exceeds 100MB');
    }
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
  }
}

testPerformance();
```

### **2. Load Testing with Multiple Users**

```javascript
// test-load.js
import { refreshUserSubscriptions } from './services/subscriptionRefreshService.js';
import { getAllUsersWithSpotifyTokens } from './services/subscriptionRefreshService.js';

async function testLoad() {
  console.log('🧪 Testing load with concurrent user refreshes...');
  
  try {
    const userIds = await getAllUsersWithSpotifyTokens();
    const testUserIds = userIds.slice(0, 10); // Test with first 10 users
    
    console.log(`📊 Testing concurrent refresh for ${testUserIds.length} users...`);
    
    const startTime = Date.now();
    
    const promises = testUserIds.map(userId => 
      refreshUserSubscriptions(userId, `load-test-${Date.now()}`)
    );
    
    const results = await Promise.allSettled(promises);
    
    const duration = Date.now() - startTime;
    const successful = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    console.log('📊 Load Test Results:');
    console.log(`   - Total Duration: ${duration}ms`);
    console.log(`   - Successful: ${successful}/${testUserIds.length}`);
    console.log(`   - Success Rate: ${(successful / testUserIds.length * 100).toFixed(1)}%`);
    console.log(`   - Avg Duration: ${(duration / testUserIds.length).toFixed(0)}ms per user`);
    
  } catch (error) {
    console.error('❌ Load test failed:', error);
  }
}

testLoad();
```

## Monitoring and Debugging

### **1. Enable Debug Logging**

```bash
# Run with debug logging enabled
DEBUG=subscription-refresh:* npm run dev

# Or set environment variable
export LOG_LEVEL=debug
npm run dev
```

### **2. Monitor Log Output**

Watch for these log patterns during testing:

```
✅ Success Patterns:
- "Starting daily_subscription_refresh job"
- "Daily refresh processed X users successfully"
- "User subscription refresh completed successfully"

⚠️ Warning Patterns:
- "Rate limit during API call"
- "Authentication error during API call"
- "Daily refresh completed with categorized errors"

❌ Error Patterns:
- "Database timeout for user"
- "Daily subscription refresh job failed with exception"
- "Spotify API error"
```

### **3. Database Monitoring**

Watch for database activity during refresh:

```sql
-- Monitor active connections
SELECT COUNT(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';

-- Monitor recent subscription updates
SELECT 
  COUNT(*) as updates_last_hour,
  MAX(updated_at) as last_update
FROM podcast_subscriptions 
WHERE updated_at > NOW() - INTERVAL '1 hour';
```

---

## **🎯 Testing Checklist**

Use this checklist to ensure comprehensive testing:

- [ ] **System Health**: API status endpoint returns healthy status
- [ ] **User Discovery**: Can identify users with Spotify integration
- [ ] **Individual Refresh**: Single user refresh completes successfully
- [ ] **Batch Refresh**: Multiple users process correctly
- [ ] **Database Updates**: Subscriptions are properly updated in database
- [ ] **Error Handling**: Auth failures, API errors, and network issues are handled gracefully
- [ ] **Performance**: Refresh completes within acceptable time limits
- [ ] **Logging**: Appropriate logs are generated for success and failure scenarios
- [ ] **Admin Controls**: Manual triggering works via API endpoints
- [ ] **Configuration**: Environment variables are properly applied

This comprehensive testing approach ensures the **Daily Podcast Subscription Refresh System** works correctly across all scenarios and use cases! 🚀 