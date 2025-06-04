# Backup-Restore Migration Testing

## Overview

This directory contains scripts for **Step 8.1** of the vault migration plan: **Script backup-restore test each migration; fail CI if secrets don't decrypt**.

The backup-restore testing system ensures that database migrations don't break vault secret encryption/decryption functionality by:

1. **Creating backups** of the current database state
2. **Running migrations** (or simulating them in CI)
3. **Testing secret decryption** after migrations
4. **Validating end-to-end functionality**
5. **Failing CI** if any secrets become inaccessible

## 🔧 Scripts

### `validate-migration.js`
Production-safe migration validation script that:
- ✅ Verifies vault accessibility
- ✅ Creates test secrets for validation
- ✅ Tests encryption/decryption integrity
- ✅ Validates CRUD operations
- ✅ Cleans up test data automatically
- ✅ Fails fast on any issues

**Usage:**
```bash
cd scripts
npm install
node validate-migration.js
```

### `backup-restore-test.js`
Comprehensive backup-restore test that:
- ✅ Creates database backups
- ✅ Sets up test secrets
- ✅ Simulates migration process
- ✅ Tests secret decryption post-migration
- ✅ Runs end-to-end vault operations
- ✅ Performs cleanup

**Usage:**
```bash
cd scripts
npm install
node backup-restore-test.js
```

### `backup-restore-test.ts`
TypeScript version of the backup-restore test (requires tsx):
```bash
cd scripts
npm install
npm run backup-restore-test
```

## 🚀 CI Integration

### GitHub Actions Workflow

The migration tests are integrated into `.github/workflows/deploy.yml`:

```yaml
migration-tests:
  name: Migration & Vault Tests
  runs-on: ubuntu-latest
  needs: run-tests
  if: github.ref == 'refs/heads/main' || github.base_ref == 'main'
  
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_KEY }}
    NODE_ENV: test
    TEST_SECRET_COUNT: 3
    
  steps:
    - name: Run Migration Validation
      run: |
        cd scripts
        node validate-migration.js
        
    - name: Run Backup-Restore Test
      run: |
        cd scripts
        node backup-restore-test.js
```

### Required Secrets

Set these in your GitHub repository secrets:

- `SUPABASE_TEST_URL` - Supabase URL for testing
- `SUPABASE_TEST_SERVICE_KEY` - Service role key for testing
- `SUPABASE_URL` - Production Supabase URL (fallback)
- `SUPABASE_SERVICE_ROLE_KEY` - Production service key (fallback)

## 🔒 Security Features

### Test Data Isolation
- All test secrets use predictable naming: `test:*`
- Test secrets are automatically cleaned up
- No production data is ever touched
- Separate test environment variables

### Safe Failures
- Scripts exit with code 1 on failure (fails CI)
- Comprehensive error logging
- Graceful cleanup on errors
- Backup artifacts saved on failure

### Validation Checks
- ✅ Vault connectivity
- ✅ Secret creation/encryption
- ✅ Secret decryption/integrity
- ✅ CRUD operations
- ✅ Data consistency
- ✅ Error handling

## 📊 Test Coverage

### Unit Tests

Run the test suite:
```bash
cd scripts
npm test
```

**Coverage includes:**
- MigrationValidator class methods
- BackupRestoreTest class methods
- Error handling scenarios
- Environment validation
- Mock Supabase interactions
- Integration test scenarios

### Test Structure
```
scripts/
├── __tests__/
│   └── backup-restore.test.js    # Unit tests
├── backup-restore-test.js        # Main test script
├── backup-restore-test.ts        # TypeScript version
├── validate-migration.js         # Migration validator
└── package.json                  # Test dependencies
```

## 🛠️ Configuration

### Environment Variables

**Required:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key with vault access

**Optional:**
- `TEST_SECRET_COUNT` - Number of test secrets to create (default: 3)
- `NODE_ENV` - Environment (test/development/production)

### Local Development

1. **Set up environment:**
   ```bash
   cp .env.example .env.local
   # Add your Supabase credentials
   ```

2. **Install dependencies:**
   ```bash
   cd scripts
   npm install
   ```

3. **Run tests:**
   ```bash
   # Migration validation
   node validate-migration.js
   
   # Full backup-restore test
   node backup-restore-test.js
   
   # Unit tests
   npm test
   ```

## 🎯 Integration with Vault Plan

This testing system implements **Step 8.1** of the comprehensive vault migration plan:

### Plan Context
```
8. Backup & CI
8.1 Script backup-restore test each migration; fail CI if secrets don't decrypt. ✅ IMPLEMENTED
```

### How It Fits
- **Before migrations:** Validates current vault state
- **During CI:** Ensures migrations don't break encryption
- **After deployment:** Confirms vault integrity
- **On failure:** Provides detailed diagnostics

## 🔍 Troubleshooting

### Common Issues

**1. Vault Access Denied**
```
Error: Vault access failed: permission denied
```
**Solution:** Check service role key has vault permissions

**2. Test Secret Creation Failed**
```
Error: Failed to create test secret: vault extension not enabled
```
**Solution:** Ensure vault extension is enabled in Supabase

**3. Environment Variables Missing**
```
Error: Missing required environment variable: SUPABASE_URL
```
**Solution:** Set required environment variables

### Debug Mode

Add detailed logging:
```bash
DEBUG=true node validate-migration.js
```

### Manual Cleanup

If tests fail and leave test data:
```sql
DELETE FROM vault.secrets WHERE name ILIKE 'test:%';
```

## 📈 Metrics & Monitoring

### Test Metrics
- **Duration:** Test execution time
- **Secret Count:** Number of secrets tested
- **Success Rate:** Pass/fail statistics
- **Coverage:** Validation steps completed

### CI Monitoring
- Failed tests trigger CI failure
- Backup artifacts saved for debugging
- Detailed logs for troubleshooting
- Integration with deployment pipeline

## 🚨 Alerts & Notifications

### CI Failure Scenarios
1. **Vault connectivity lost** → Immediate CI failure
2. **Secret decryption failed** → CI failure + artifact upload
3. **Data integrity issues** → CI failure + detailed logging
4. **CRUD operations broken** → CI failure + rollback recommendation

### Recovery Actions
1. **Check vault status** in Supabase dashboard
2. **Review migration logs** for errors
3. **Validate vault extension** is enabled
4. **Test with minimal secret** manually
5. **Contact Supabase support** if vault issues persist

---

## 🎉 Success Criteria

✅ **Migration validation passes**
✅ **Backup-restore test completes**  
✅ **All secrets decrypt correctly**
✅ **CRUD operations work**
✅ **CI pipeline integrates**
✅ **Test coverage > 80%**

This completes the implementation of **Step 8.1** from the vault migration plan! 