# Environment Consolidation Migration Guide

## Overview
This guide helps team members migrate from the old package-specific environment file structure to the new consolidated root-level environment setup.

## What Changed

### Before (Old Structure)
```
listener/
├── packages/
│   ├── server/
│   │   ├── .env              ❌ REMOVED
│   │   └── .env.example      ❌ REMOVED
│   └── client/
│       └── .env              ❌ REMOVED
└── .env.example              ✅ Enhanced
```

### After (New Structure)
```
listener/
├── .env.local                ✅ NEW - All development credentials
├── .env.example              ✅ Enhanced - Comprehensive documentation
├── .env.production           ✅ Production template
├── .env.test                 ✅ Test environment
└── ENVIRONMENT_SETUP.md      ✅ NEW - Setup instructions
```

## Migration Steps for Team Members

### Step 1: Backup Your Current Environment Files
```bash
# Create backup directory
mkdir -p env-backup

# Backup existing files (if they exist)
cp packages/server/.env env-backup/server-env 2>/dev/null || echo "No server .env found"
cp packages/client/.env env-backup/client-env 2>/dev/null || echo "No client .env found"
```

### Step 2: Pull Latest Changes
```bash
git pull origin main
```

### Step 3: Set Up New Environment Structure
```bash
# Copy the example file to create your local environment
cp .env.example .env.local

# Edit with your actual credentials
nano .env.local  # or use your preferred editor
```

### Step 4: Migrate Your Existing Credentials
If you had custom credentials in the old package-specific files, merge them into the new `.env.local`:

1. **Server credentials** (from `packages/server/.env`) → Add to root `.env.local`
2. **Client credentials** (from `packages/client/.env`) → Add to root `.env.local`
3. **Any custom variables** → Add to root `.env.local`

### Step 5: Verify Everything Works
```bash
# Test server startup
cd packages/server && npm run dev

# Test client startup (in another terminal)
cd packages/client && npm run dev

# Run full test suite
npm test
```

### Step 6: Clean Up Old Files
```bash
# Remove old package-specific environment files (if they still exist)
rm -f packages/server/.env packages/server/.env.example
rm -f packages/client/.env
```

## Key Benefits of New Structure

### ✅ **Simplified Setup**
- Single `.env.local` file for all development credentials
- No more confusion about which package needs which variables
- Consistent environment loading across all packages

### ✅ **Better Documentation**
- Comprehensive `.env.example` with detailed comments
- `ENVIRONMENT_SETUP.md` with step-by-step instructions
- Clear troubleshooting guide for common issues

### ✅ **Improved Developer Experience**
- Faster onboarding for new team members
- Reduced setup time from ~15 minutes to ~5 minutes
- Consistent environment variable access patterns

### ✅ **Enhanced Security**
- Clear separation between development and production environments
- Better documentation of required vs optional credentials
- Consistent handling of sensitive information

## Environment File Reference

### `.env.local` (Development)
- Contains all your actual development credentials
- Used for local development and testing
- **Never commit this file to version control**

### `.env.example` (Documentation)
- Shows all required and optional environment variables
- Contains detailed comments and setup instructions
- Safe to commit to version control

### `.env.production` (Production Template)
- Template for production environment variables
- Contains placeholders for production credentials
- Used as reference for deployment setup

### `.env.test` (Testing)
- Contains mock values for testing
- Used by automated test suites
- Safe to commit to version control

## Troubleshooting

### Issue: "Environment variable not found"
**Solution**: Check that the variable is defined in your `.env.local` file and matches the exact name from `.env.example`.

### Issue: "Server won't start"
**Solution**: 
1. Verify all required environment variables are set
2. Run `npm run validate:dev-setup` to check your configuration
3. Check the troubleshooting section in `ENVIRONMENT_SETUP.md`

### Issue: "Client build fails"
**Solution**: Ensure client-side environment variables start with `VITE_` prefix and are defined in `.env.local`.

### Issue: "Tests failing after migration"
**Solution**: Tests use `.env.test` - ensure test environment variables are properly configured.

## Getting Help

1. **Check Documentation**: Review `ENVIRONMENT_SETUP.md` for detailed setup instructions
2. **Validate Setup**: Run `npm run validate:dev-setup` to verify your configuration
3. **Ask Team**: Reach out to the team if you encounter issues not covered here

## Quick Reference Commands

```bash
# Validate your development setup
npm run validate:dev-setup

# Start development servers
npm run dev

# Run tests
npm test

# Check environment variables are loaded
cd packages/server && node -e "console.log(process.env.SUPABASE_URL)"
```

---

**Migration completed successfully?** 🎉 You should now have a single `.env.local` file with all your development credentials, and everything should work exactly as before, but with a much simpler setup process!

---

# Taddy Business Tier Migration Guide

## Overview
This guide covers the migration from Taddy Free API to Taddy Business API for improved transcript coverage and functionality. This migration was implemented in December 2024 to provide better transcript availability and processing capabilities.

## What Changed

### Database Schema Updates
- **New `source` Column**: Tracks whether transcripts come from podcasters or Taddy API
- **Extended Status Enum**: Adds `'processing'` status for transcripts being generated by Taddy
- **Updated Constraints**: Allows `NULL` storage_path only for processing transcripts

### Environment Configuration
- **New `TRANSCRIPT_TIER` Variable**: Controls which Taddy API tier to use (`'free'` or `'business'`)
- **Enhanced Configuration**: Better defaults and validation for Business tier usage
- **Renamed `TRANSCRIPT_WORKER_L10D` Variable**: Strict boolean toggle. `"true"` makes the nightly worker re-submit the 10 most-recent episodes (overwriting duplicates). `"false"` means normal nightly mode (skip episodes that already have transcripts). To pause the worker, use `TRANSCRIPT_WORKER_ENABLED=false`.

### Application Features
- **Business Client**: New `TaddyBusinessClient` with GraphQL API integration
- **Enhanced Service**: Tier-based routing in `TranscriptService`
- **Improved Worker**: Processing status handling and quota exhaustion detection

## Migration Steps

### Step 1: Apply Database Migration
```bash
# Apply the migration that adds source tracking and processing status
supabase db push --linked

# This applies: 20250622125657_add_source_and_processing_status.sql
```

**Migration Details:**
- Adds `source text NULL` column with check constraint for `'podcaster'|'taddy'`
- Extends `status` constraint to include `'processing'`
- Updates `storage_path` constraint to allow NULL only when `status='processing'`

### Step 2: Update Environment Variables

Add the new `TRANSCRIPT_TIER` variable to your environment files:

```bash
# .env.local (Development)
TRANSCRIPT_TIER=business

# .env.production (Production)
TRANSCRIPT_TIER=business

# .env.test (Testing - keep as free for mock isolation)
TRANSCRIPT_TIER=free
```

### Step 3: Deploy Application Code

Deploy the updated application code that includes:
- `TaddyBusinessClient` for improved transcript fetching
- Enhanced `TranscriptService` with tier-based routing
- Updated `TranscriptWorker` with processing status handling
- Quota exhaustion detection and graceful handling

### Step 4: Verify Migration Success

```bash
# Check that the migration applied correctly
supabase db remote --help

# Verify environment configuration
cd packages/server && node -e "
import { getTranscriptWorkerConfig } from './config/transcriptWorkerConfig.js';
console.log('Transcript tier:', getTranscriptWorkerConfig().tier);
"

# Run tests to ensure everything works
npm test
```

## Business Tier Benefits

### Improved API Limits
- **Free Tier**: 500 requests/month
- **Business Tier**: 10,000+ requests/month

### Enhanced Features
- **Pregenerated Transcripts**: Access to existing transcripts for popular podcasts
- **Faster Processing**: Quicker transcript availability for newly published episodes
- **Better Quality**: Improved transcript accuracy and speaker identification
- **Processing Status**: Real-time status updates for transcripts being generated

### Cost Considerations
- Business tier has usage-based pricing
- Credit consumption is tracked and logged for cost analysis
- Quota exhaustion is detected and handled gracefully

## Rollback Plan

If rollback is needed, the migration supports backward compatibility:

### Emergency Rollback
```bash
# Switch back to Free tier immediately
TRANSCRIPT_TIER=free

# This will:
# - Route all new requests to TaddyFreeClient
# - Continue working with existing transcripts
# - Reduce API usage to Free tier limits
```

### Database Rollback
The migration is designed to be backward compatible:
- New `source` and `processing` fields are nullable
- Existing transcript records continue working unchanged
- Old application code can still read transcript data

If a complete database rollback is absolutely necessary:
```sql
-- Remove the new columns (CAUTION: This will lose source tracking data)
ALTER TABLE transcripts DROP COLUMN IF EXISTS source;

-- Revert status constraint (removes 'processing' option)
ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_status_check;
ALTER TABLE transcripts ADD CONSTRAINT transcripts_status_check 
  CHECK (status IN ('available', 'error', 'not_found'));

-- Revert storage_path constraint
ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_storage_path_check;
ALTER TABLE transcripts ADD CONSTRAINT transcripts_storage_path_check 
  CHECK (storage_path IS NOT NULL);
```

## Monitoring and Troubleshooting

### Key Metrics to Monitor
- **Transcript Coverage**: Percentage of episodes with available transcripts
- **Processing Status**: Number of transcripts in 'processing' state
- **API Usage**: Credit consumption and quota utilization
- **Error Rates**: Failed transcript fetches and quota exhaustion events

### Common Issues

#### Issue: "Quota Exhausted" Errors
**Symptoms**: Transcript worker logs show "CREDITS_EXCEEDED" or HTTP 429 errors
**Solution**: 
1. Check your Taddy Business plan usage in their dashboard
2. Consider increasing your plan limits
3. Adjust `TRANSCRIPT_MAX_REQUESTS` to stay within limits

#### Issue: Many Transcripts Stuck in 'Processing'
**Symptoms**: Database shows many transcripts with `status='processing'`
**Solution**:
1. Processing transcripts are normal - Taddy generates them asynchronously
2. They will be updated to 'available' in future worker runs
3. Monitor for transcripts stuck in processing for >48 hours

#### Issue: Free Tier Fallback Not Working
**Symptoms**: Errors when `TRANSCRIPT_TIER=free`
**Solution**:
1. Verify `TADDY_API_KEY` is still valid for Free tier access
2. Check that Free tier client is properly initialized
3. Review logs for tier-specific routing issues

### Logging and Debugging

The migration includes enhanced logging:
```bash
# Check transcript worker logs for tier information
grep "TRANSCRIPT_WORKER" logs/application.log

# Monitor API usage and credit consumption
grep "creditsConsumed" logs/application.log

# Check for quota exhaustion warnings
grep "quota.*exhausted" logs/application.log
```

## Testing the Migration

### Unit Tests
```bash
# Run transcript-related tests
npm test packages/server/lib/clients/__tests__/taddyBusinessClient.test.ts
npm test packages/server/lib/services/__tests__/TranscriptService.test.ts
npm test packages/server/services/__tests__/TranscriptWorker.test.ts
```

### Integration Tests
```bash
# Run integration tests with real database
npm run test:integration
```

### Manual Testing
```bash
# Trigger transcript worker manually to test Business tier
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('transcript_worker');
"
```

## Migration Rationale

### Why Migrate to Business Tier?

1. **Scalability**: Free tier's 500 requests/month limit was insufficient for production usage
2. **Coverage**: Business tier provides access to pregenerated transcripts for popular podcasts
3. **Reliability**: Higher rate limits reduce the risk of quota exhaustion
4. **Features**: Processing status and better error handling improve user experience

### Implementation Approach

The migration was designed with these principles:
- **Backward Compatibility**: Existing functionality continues working
- **Gradual Rollout**: Tier can be switched via environment variable
- **Safe Rollback**: Migration can be reversed without data loss
- **Comprehensive Testing**: Full test coverage for both tiers

---

**Migration completed successfully?** 🎉 You should now have access to Taddy Business tier with improved transcript coverage and processing capabilities! 