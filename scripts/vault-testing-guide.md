# Vault Usage Testing & Verification Guide

This guide helps you verify that your application is using **Supabase Vault** in production and not falling back to the `user_secrets` table (which is meant only for local development).

## 🎯 Quick Health Check

**Step 1: Run the verification script**
```bash
# For production environment
npm run verify:vault-usage -- --env=production

# For staging environment  
npm run verify:vault-usage -- --env=staging
```

**Step 2: Check the results**
- ✅ **VAULT IS ACTIVE** = Your app is using Vault correctly
- ❌ **VAULT ISSUES DETECTED** = There's a problem, see recommendations

## 📊 Continuous Monitoring

**Set up periodic monitoring:**
```bash
# Run monitoring check (exit codes: 0=healthy, 1=warning, 2=critical, 3=error)
npm run monitor:vault-usage

# Set environment threshold (default 90% of users should use Vault)
VAULT_MONITOR_THRESHOLD=95 npm run monitor:vault-usage
```

**Add to your CI/CD pipeline:**
```yaml
# In your GitHub Actions or deployment pipeline
- name: Verify Vault Usage
  run: npm run verify:vault-usage -- --env=production
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## 🔍 What Each Script Checks

### 1. Vault Extension Status
- ✅ `vault.secrets` table is accessible
- ✅ Service role has Vault permissions
- ✅ Vault extension is enabled in Supabase

### 2. RPC Functions
- ✅ `vault_create_user_secret` exists
- ✅ `vault_read_user_secret` exists  
- ✅ `vault_update_user_secret` exists

### 3. Storage Pattern Analysis
- ✅ Users have `spotify_vault_secret_id` populated
- ✅ `user_secrets` table is empty or doesn't exist
- ✅ High percentage of users using Vault storage

### 4. Live Operation Testing
- ✅ Can successfully read secrets from Vault
- ✅ Secret data is valid JSON with required fields
- ✅ Operations complete within reasonable time

## 🚨 Common Issues & Solutions

### Issue 1: "Vault extension is NOT enabled"
**Symptoms:**
```
❌ Vault extension is NOT enabled - vault.secrets table does not exist
```

**Solution:**
1. Go to Supabase Dashboard → Settings → Database
2. Enable the "Vault" extension
3. Run migrations: `supabase db push`

### Issue 2: "RPC functions not found"
**Symptoms:**
```
❌ RPC function 'vault_create_user_secret' does not exist
```

**Solution:**
1. Run missing migrations:
   ```bash
   supabase db push
   # Or specifically:
   supabase migration up 20250107000004_add_vault_crud_functions.sql
   ```

### Issue 3: "Users using fallback storage"
**Symptoms:**
```
⚠️ 15 users using fallback storage
WARNING: Fallback table in use - may not be using Vault
```

**Solution:**
1. Check if you're accidentally running in development mode
2. Verify environment variables are correctly set:
   - `SUPABASE_URL` (should be production URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (should be production key)
3. May need to migrate users from fallback to Vault

### Issue 4: "Permission denied" 
**Symptoms:**
```
❌ Vault access denied - service role key lacks vault permissions
```

**Solution:**
1. Verify service role key is correct
2. Check Supabase RLS policies allow service role access
3. Ensure service role has `vault` schema permissions

## 📋 Production Readiness Checklist

Before going live, verify:

- [ ] **Vault Extension Enabled**: ✅ in Supabase dashboard
- [ ] **All RPC Functions Present**: Run `npm run verify:vault-usage`
- [ ] **No Fallback Table Usage**: 0 records in `user_secrets` 
- [ ] **Environment Variables Set**: Production URLs and keys
- [ ] **Live Operations Work**: Test reads/writes succeed
- [ ] **Monitoring Setup**: Add to CI/CD and cron jobs

## 🔄 Ongoing Verification Strategy

### Daily Monitoring
```bash
# Add to cron job (runs every 6 hours)
0 */6 * * * cd /path/to/app && npm run monitor:vault-usage
```

### Pre-Deployment Checks
```bash
# Add to deployment script
npm run verify:vault-usage -- --env=staging
if [ $? -eq 0 ]; then
  echo "✅ Vault verification passed, proceeding with deployment"
else
  echo "❌ Vault verification failed, aborting deployment"
  exit 1
fi
```

### Weekly Deep Verification
```bash
# Run comprehensive check weekly
npm run verify:vault-usage -- --env=production
```

## 🎯 Key Metrics to Track

**Healthy Production Environment:**
- `vault.accessible`: `true`
- `vault_percentage`: `>90%` of users
- `fallback_users`: `0`
- `operation_test.success`: `true`
- `operation_test.elapsed_ms`: `<1000`

**Warning Signs:**
- Vault percentage dropping over time
- Increasing fallback table usage
- RPC function errors
- Slow Vault operations (>2000ms)

## 🧪 Testing New Deployments

**Before deploying code changes:**
```bash
# 1. Test current state
npm run verify:vault-usage -- --env=staging

# 2. Deploy changes

# 3. Verify Vault still works
npm run verify:vault-usage -- --env=staging

# 4. Test a few operations
npm run monitor:vault-usage
```

## 🔧 Development vs Production

| Environment | Expected Behavior |
|-------------|-------------------|
| **Local Development** | May use `user_secrets` table fallback |
| **Staging** | Should use Vault (same as production) |
| **Production** | Must use Vault exclusively |

**To force Vault in development:**
```bash
# Set production-like environment variables locally
SUPABASE_URL=your-staging-url \
SUPABASE_SERVICE_ROLE_KEY=your-staging-key \
npm run dev
```

This ensures your local environment matches production behavior.

---

## 📞 Support

If Vault verification fails consistently:

1. **Check Supabase Status**: [status.supabase.com](https://status.supabase.com)
2. **Review Logs**: Look for `VAULT_OPERATION:` entries in your application logs
3. **Contact Support**: Include verification script output in your ticket
4. **Fallback Plan**: Ensure `user_secrets` table exists for emergency fallback

**Remember**: The goal is 100% Vault usage in production with 0% fallback table usage! 