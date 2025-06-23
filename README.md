# Listener

A podcast transcription service that integrates with Spotify.

## Quick Start

**⚡ New to the project?** See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for a complete setup guide (5-10 minutes).

**🔧 Environment Variables:** All configuration is now centralized in root-level `.env` files. No more package-specific environment files!

**📦 Existing Team Members:** See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for migrating from the old package-specific environment structure.

## Project Structure

```
.
├── app.js                 # Main application setup
├── server.js             # Server entry point
├── lib/                  # Core functionality
│   ├── transcribe.js     # Transcription logic
│   ├── spotify.js        # Spotify API integration
│   └── utils.js          # Utility functions
├── middleware/           # Express middleware
│   ├── auth.js          # Authentication middleware
│   └── error.js         # Error handling middleware
├── routes/              # API routes
│   ├── index.js         # Route aggregator
│   ├── transcribe.js    # Transcription endpoints
│   ├── spotifyTokens.js # Spotify token management
│   └── syncShows.js     # Podcast sync endpoints
├── services/            # Business logic
│   └── podcastService.js # Podcast-related services
└── public/             # Static files
    ├── login.html
    └── app.html 
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   ```bash
   # Copy the environment template
   cp .env.example .env.local
   
   # Fill in your credentials (see ENVIRONMENT_SETUP.md for detailed instructions)
   ```
   
   📖 **For detailed setup instructions, see [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md)**
   
   **Quick Reference - Required Variables:**
   ```bash
   # Database & Auth (Supabase)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # API Credentials
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   TADDY_API_KEY=your_taddy_api_key
   
   # Security
   JWT_SECRET=your_jwt_secret
   TOKEN_ENC_KEY=your_32_char_encryption_key
   
   # Transcript Worker (Optional - defaults provided)
   TRANSCRIPT_WORKER_ENABLED=true        # Enable nightly transcript sync
   TRANSCRIPT_WORKER_CRON=0 1 * * *      # Run at 1 AM daily
   TRANSCRIPT_TIER=business              # Taddy API tier ('free' or 'business')
   TRANSCRIPT_LOOKBACK=24                # Hours to scan for new episodes
   TRANSCRIPT_MAX_REQUESTS=15            # Max API calls per run
   TRANSCRIPT_CONCURRENCY=10             # Max simultaneous requests
   TRANSCRIPT_ADVISORY_LOCK=true         # Prevent overlapping runs
   ```

3. **Verify setup:**
   ```bash
   npm run validate-setup
   ```

4. Start the development environment:
   ```bash
   npm run dev
   ```

## Getting Started

For new developers joining the project:

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd listener
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the environment template
   cp .env.example .env.local
   
   # Follow the detailed setup guide
   # See ENVIRONMENT_SETUP.md for step-by-step instructions
   ```

3. **Generate GraphQL types:**
   ```bash
   # Generate typed SDK for Taddy API (requires TADDY_API_KEY in .env.local)
   npm run codegen
   ```

4. **Initialize the local database:**
   ```bash
   # Start Supabase services
   npm run supabase:start
   
   # Apply all migrations (including the new transcripts table)
   supabase db reset
   
   # Create storage buckets for transcripts
   cd packages/server && npx tsx scripts/create-transcripts-bucket.ts
   ```

5. **Verify setup:**
   ```bash
   # Check that services are running
   npm run supabase:status
   
   # Run tests to ensure everything works
   npm test
   ```

6. **Start development:**
   ```bash
   npm run dev
   ```

The database will now include the `transcripts` table for storing podcast episode transcript metadata.

## Development Commands

### GraphQL Code Generation

```bash
# Generate typed SDK for Taddy API
npm run codegen

# This command:
# 1. Fetches the latest Taddy GraphQL schema
# 2. Generates TypeScript types and request functions
# 3. Outputs to packages/server/generated/taddy.ts
```

### Database Management

```bash
# Reset local database (applies all migrations)
npm run db:reset

# Start Supabase locally
npm run supabase:start

# Stop Supabase
npm run supabase:stop

# Check Supabase status
npm run supabase:status

# Apply migrations manually (if needed)
supabase db push

# Create transcripts storage bucket (after migrations)
pnpm tsx scripts/create-transcripts-bucket.ts
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run migration tests specifically
cd packages/server && npm run test lib/__tests__/migrations/

# Run integration tests
cd packages/server && npm run test:integration
```

### Migration Development

```bash
# Create a new migration
supabase migration new <migration_name>

# Apply migrations to local database
supabase db push

# Reset database with fresh migrations
supabase db reset
```

### Taddy Business Tier Migration

The application recently migrated from Taddy Free API to Taddy Business API for improved transcript coverage. This migration includes new database schema and environment configuration.

#### Required Migration Steps

1. **Apply Database Migration:**
   ```bash
   # Apply the migration that adds source tracking and processing status
   supabase db push
   
   # This applies migration: 20250622125657_add_source_and_processing_status.sql
   # - Adds 'source' column to track transcript providers ('podcaster' or 'taddy')
   # - Extends status enum to include 'processing' for transcripts being generated
   # - Updates storage_path constraints to allow NULL for processing transcripts
   ```

2. **Update Environment Variables:**
   ```bash
   # Set the transcript tier in your environment files
   # Production/Staging:
   TRANSCRIPT_TIER=business
   
   # Local Development:
   TRANSCRIPT_TIER=business  # (or 'free' for testing with mock data)
   
   # Test Environment:
   TRANSCRIPT_TIER=free      # (uses mock credentials, safe for CI/CD)
   ```

3. **Deploy Application Code:**
   ```bash
   # Deploy the updated transcript worker and service code
   # This includes:
   # - TaddyBusinessClient for improved transcript fetching
   # - Enhanced TranscriptService with tier-based routing
   # - Updated TranscriptWorker with processing status handling
   # - Quota exhaustion detection and graceful handling
   ```

#### Environment Configuration Details

The Business tier migration introduces the `TRANSCRIPT_TIER` environment variable:

```bash
# Taddy API tier configuration
TRANSCRIPT_TIER=business              # 'free' or 'business'

# Business tier benefits:
# - Higher API rate limits (10,000+ requests/month vs 500/month)
# - Access to pregenerated transcripts for popular podcasts
# - Faster transcript availability for newly published episodes
# - Better transcript quality and speaker identification
```

#### Deployment Sequence

1. **Database First:** Apply migration before deploying application code
2. **Environment Variables:** Set `TRANSCRIPT_TIER=business` in production
3. **Application Deployment:** Deploy updated transcript worker and services
4. **Monitoring:** Verify first nightly run shows improved transcript coverage

#### Rollback Plan

If rollback is needed, the migration supports backward compatibility:

```bash
# Emergency rollback: switch back to Free tier
TRANSCRIPT_TIER=free

# Database rollback (if necessary):
# Migration is backward compatible - existing transcripts continue working
# New 'source' and 'processing' fields are nullable and don't break existing code
```

### Background Jobs

```bash
# Manually trigger episode sync job
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('episode_sync');
"

# Manually trigger daily subscription refresh
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('daily_subscription_refresh');
"

# Manually trigger transcript worker
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('transcript_worker');
"

# Check what jobs are available
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
console.log('Available jobs: episode_sync, daily_subscription_refresh, transcript_worker');
"
```

## API Endpoints

- `GET /api/transcribe?url=<spotify_url>` - Transcribe a podcast episode
- `POST /api/store-spotify-tokens` - Store Spotify authentication tokens
- `POST /api/sync-spotify-shows` - Sync user's Spotify podcast subscriptions

## Services

### TranscriptService

The `TranscriptService` provides a centralized interface for all transcript-related operations. Currently implemented as a stub that returns `null` for all requests.

**Location**: `packages/server/lib/services/TranscriptService.ts`

**Usage**:
```typescript
import { TranscriptService } from '../lib/services/TranscriptService.js';

const transcriptService = new TranscriptService();

// Get transcript by episode ID
const transcript = await transcriptService.getTranscript('episode-uuid');

// Get transcript by episode object (with show info)
const transcript = await transcriptService.getTranscript(episodeWithShow);
```

**Features**:
- **Overloaded Methods**: Supports both episode ID strings and full episode objects
- **Edge Case Handling**: Automatically filters out deleted episodes and episodes without RSS URLs
- **Comprehensive Logging**: Debug logging for eligibility checks and processing status
- **Future-Ready**: Structured with TODO comments for upcoming provider integrations

**Planned Provider Integration Order**:
1. **Taddy Free Lookup** (GraphQL, no cost)
2. **Taddy Business Pregenerated** (existing transcripts)  
3. **On-demand Taddy Jobs** (async queue, costs credits)
4. **Fallback ASR Providers** (Deepgram/Rev AI, direct cost)
5. **Cost Tracking & Provenance** (metadata storage)

**Testing**: Comprehensive unit tests with 7 test cases covering happy path and edge cases.

## Token Storage

The application securely stores Spotify authentication tokens using encrypted column storage:

### Architecture

- **Encryption**: Tokens are encrypted using PostgreSQL's pgcrypto extension
- **Storage**: Encrypted tokens are stored in the `users.spotify_tokens_enc` column as `bytea`
- **Key Management**: Encryption key is provided via the `TOKEN_ENC_KEY` environment variable
- **Access**: Tokens are decrypted on-demand when making Spotify API calls

### Token Data Structure

```typescript
interface SpotifyTokenData {
  access_token: string;     // Spotify access token (1-hour expiry)
  refresh_token: string;    // Spotify refresh token (long-lived)
  expires_at: number;       // Unix timestamp when access_token expires
  token_type: string;       // Always "Bearer"
  scope: string;           // Spotify API scopes granted
}
```

### Database Functions

The application uses custom PostgreSQL functions for token operations:

```sql
-- Encrypt and store token data
SELECT update_encrypted_tokens(user_id, token_data_json, encryption_key);

-- Retrieve and decrypt token data  
SELECT get_encrypted_tokens(user_id, encryption_key);

-- Test encryption/decryption (health check)
SELECT test_encryption(test_data);
```

### Environment Configuration

```bash
# Required: Encryption key for token storage
TOKEN_ENC_KEY=your_secure_encryption_key_here

# Recommended: Use a strong, randomly generated key
# Example generation: openssl rand -base64 32
```

### Security Features

- **Automatic Token Refresh**: Expired access tokens are automatically refreshed using stored refresh tokens
- **Reauth Handling**: Users requiring re-authentication are flagged via `spotify_reauth_required`
- **In-Memory Caching**: Valid tokens are cached for 60 seconds to reduce database calls
- **Secure Cleanup**: No tokens are stored in application logs or temporary files

## Database Schema

The application uses Supabase (PostgreSQL) with the following core tables:

### User Tables

```sql
-- User authentication and Spotify integration
-- (extends Supabase auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY,                    -- References auth.users.id
  email text,
  spotify_tokens_enc bytea,              -- Encrypted Spotify tokens
  spotify_reauth_required boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc', now()),
  updated_at timestamptz DEFAULT timezone('utc', now())
);
```

### Podcast Tables

```sql
-- Master list of podcast shows
CREATE TABLE podcast_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_url text NOT NULL UNIQUE,
  title text,
  description text,
  image_url text,
  etag text,                    -- For HTTP caching
  last_modified timestamptz,    -- For HTTP caching
  last_fetched timestamptz,     -- When we last checked for updates
  last_updated timestamptz DEFAULT timezone('utc', now())
);

-- Individual podcast episodes
CREATE TABLE podcast_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
  guid text NOT NULL,           -- Episode GUID from RSS
  episode_url text NOT NULL,    -- Direct MP3/audio URL
  title text,
  description text,
  pub_date timestamptz,         -- Publication date
  duration_sec int4,            -- Duration in seconds
  created_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE(show_id, guid)
);

-- User subscriptions to podcast shows
CREATE TABLE user_podcast_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  show_id uuid NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT timezone('utc', now()),
  updated_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE(user_id, show_id)
);
```

### Indexes

- `podcast_episodes_show_pub_idx` on `(show_id, pub_date DESC)` - For efficient episode queries
- `user_podcast_subscriptions_uid_idx` on `(user_id)` - For user subscription lookups
- `user_podcast_subscriptions_uid_sid_key` on `(user_id, show_id)` - Unique constraint

### Entity Relationships

```
users (Supabase Auth)
  ↓ 1:N
user_podcast_subscriptions
  ↓ N:1
podcast_shows
  ↓ 1:N  
podcast_episodes
```

### Migration History

- `20250616190040_create_podcast_core.sql` - Creates core podcast tables and episodes
- `20250616192002_migrate_subscriptions.sql` - Migrates legacy subscriptions to normalized schema
- `20250619093954_encrypted_token_column.sql` - Adds encrypted token storage and removes vault dependencies
- `20250619095919_remove_vault_test_tokens.sql` - Removes vault testing infrastructure
- `20250619102030_encrypted_token_functions.sql` - Adds PostgreSQL functions for encrypted token operations

## Deployment

### Transcripts Feature Deployment

The transcripts feature requires creating a private storage bucket in addition to database migrations:

```bash
# 1. Apply database migrations
supabase db push --linked

# 2. Create transcripts storage bucket
pnpm tsx scripts/create-transcripts-bucket.ts
```

**Note**: The bucket creation script is idempotent and safe to run multiple times. Include it in your deployment pipeline after the database migrations.

### Episode Sync Feature Deployment

The episode sync feature requires a specific deployment sequence to safely add RSS URL tracking:

#### 1. Deploy Schema Changes
```bash
# Deploy the column addition migration first
supabase db push --linked

# This applies:
# - 20250618002222_add_rss_url_and_last_checked_episodes.sql (adds nullable columns)
# - 20250618002721_add_last_checked_episodes_index.sql (adds index)
```

#### 2. Run RSS URL Backfill
```bash
# Run the one-time backfill script to populate rss_url for existing shows
cd scripts
npx tsx backfillRssUrl.ts

# This script:
# - Finds all podcast_shows where rss_url IS NULL
# - Uses Spotify API + PodcastIndex to find RSS URLs
# - Updates the database with found RSS URLs
# - Provides detailed logging and error reporting
```

#### 3. Deploy Constraints (ONLY after successful backfill)
```bash
# Deploy the constraint migration ONLY after verifying backfill success
supabase db push --linked

# This applies:
# - 20250618002310_add_rss_url_constraints.sql (adds NOT NULL and UNIQUE constraints)
```

#### 4. Deploy Application Code
```bash
# Deploy the episode sync service and background job scheduling
# This includes the nightly cron job for checking new episodes
```

#### 5. Configure Episode Sync Background Job

The episode sync feature includes a nightly background job that automatically checks for new episodes. Configure the job using environment variables:

```bash
# Enable/disable the episode sync job (default: enabled)
EPISODE_SYNC_ENABLED=true

# Configure the schedule (default: midnight Pacific Time)
EPISODE_SYNC_CRON=0 0 * * *
EPISODE_SYNC_TIMEZONE=America/Los_Angeles
```

**Job Schedule Examples:**
```bash
# Every night at midnight PT (default)
EPISODE_SYNC_CRON=0 0 * * *
EPISODE_SYNC_TIMEZONE=America/Los_Angeles

# Every night at 2 AM ET  
EPISODE_SYNC_CRON=0 2 * * *
EPISODE_SYNC_TIMEZONE=America/New_York

# Every 6 hours
EPISODE_SYNC_CRON=0 */6 * * *

# Disable the job entirely
EPISODE_SYNC_ENABLED=false
```

**Manual Job Execution:**
```bash
# Trigger episode sync manually (for testing or one-time runs)
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('episode_sync');
"
```

**Monitoring:**
- Job execution logs include structured metadata for monitoring
- Check application logs for `BACKGROUND_JOB` and `episode_sync` entries
- Failed syncs are logged with detailed error information
- Metrics are emitted for job duration and success/failure rates

#### 6. Configure Transcript Worker Background Job

The transcript worker runs nightly to discover and store episode transcripts from the Taddy API. This job processes episodes published in the last 24 hours and fetches available transcripts.

```bash
# Enable/disable the transcript worker (default: enabled)
TRANSCRIPT_WORKER_ENABLED=true

# Configure the schedule (default: 1 AM Pacific Time)
TRANSCRIPT_WORKER_CRON=0 1 * * *

# Configure lookback window (default: 24 hours)
TRANSCRIPT_LOOKBACK=24

# Configure API usage limits (defaults optimized for Free tier)
TRANSCRIPT_MAX_REQUESTS=15            # Max Taddy API calls per run
TRANSCRIPT_CONCURRENCY=10             # Max simultaneous requests

# Enable advisory lock to prevent overlapping runs (default: enabled)
TRANSCRIPT_ADVISORY_LOCK=true
```

**Job Schedule Examples:**
```bash
# Every night at 1 AM PT (default)
TRANSCRIPT_WORKER_CRON=0 1 * * *

# Every night at 3 AM ET  
TRANSCRIPT_WORKER_CRON=0 3 * * *

# Every 12 hours
TRANSCRIPT_WORKER_CRON=0 */12 * * *

# Disable the job entirely
TRANSCRIPT_WORKER_ENABLED=false
```

**Manual Job Execution:**
```bash
# Trigger transcript worker manually (for testing or backfills)
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('transcript_worker');
"
```

**API Usage & Limits:**
- Uses Taddy Free API (500 requests/month limit)
- Default configuration uses max 15 requests per night (≈450/month)
- Respects rate limits with configurable concurrency
- Only processes episodes without existing transcripts (idempotent)
- Stores transcripts in Supabase Storage with metadata in `transcripts` table

**Monitoring:**
- Job execution logs include transcript counts and API usage
- Check application logs for `BACKGROUND_JOB` and `transcript_worker` entries
- Failed transcript fetches are logged with episode details
- Advisory lock prevents overlapping runs in multi-instance deployments

### Post-Deployment Cleanup

After successful deployment, the backfill script should be disabled to prevent accidental re-runs:

```bash
# Option 1: Move script to archive
mv scripts/backfillRssUrl.ts scripts/archive/backfillRssUrl.ts.completed

# Option 2: Add to .gitignore (if keeping for reference)
echo "scripts/backfillRssUrl.ts" >> .gitignore
```

**⚠️ Important**: Never run the backfill script in production after the initial deployment. It's designed for one-time use only.

## Token Storage Migration

**⚠️ Breaking Change**: The application migrated from Supabase Vault to encrypted column storage for Spotify tokens. This migration requires existing users to re-authenticate with Spotify.

### For Existing Production Users

If you have existing users who authenticated before the encrypted token migration (applied 2025-06-19), they will need to re-authenticate:

1. **Automatic Detection**: Users with invalid tokens will be automatically redirected to re-authenticate
2. **Manual Reset**: To manually reset a user's authentication status:
   ```sql
   UPDATE users 
   SET spotify_reauth_required = true, spotify_tokens_enc = NULL 
   WHERE id = 'user-id-here';
   ```
3. **User Experience**: Users will see a "Connect to Spotify" prompt on their next visit
4. **No Data Loss**: User subscriptions and preferences are preserved during re-authentication

### Migration Timeline

- **Before 2025-06-19**: Tokens stored in Supabase Vault
- **After 2025-06-19**: Tokens stored in encrypted columns using pgcrypto
- **Transition**: All vault data was safely migrated and vault infrastructure removed

### For New Deployments

New deployments automatically use encrypted column storage with no additional setup required beyond setting the `TOKEN_ENC_KEY` environment variable.

## Authentication

The application uses Supabase for authentication. Protected routes require a valid `sb-access-token` cookie or Bearer token in the Authorization header. 