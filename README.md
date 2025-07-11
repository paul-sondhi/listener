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
   GEMINI_API_KEY=your_gemini_api_key      # For episode notes generation
   
   # Email Service (Resend)
   RESEND_API_KEY=your_resend_api_key      # For sending newsletter emails
   SEND_FROM_EMAIL=your_sender_email       # Email address to send from
   TEST_RECEIVER_EMAIL=test@example.com    # Test email for L10 mode
   
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
   # Re-check toggle (strict boolean): "true" => re-submit last 10, "false" => normal mode
   TRANSCRIPT_WORKER_L10D=false          # Pause worker entirely with TRANSCRIPT_WORKER_ENABLED=false
   
   # RSS Feed Matching (Optional - defaults provided)
   RSS_MATCH_THRESHOLD=0.8               # Minimum similarity score for RSS feed matching (0.0-1.0)
   RSS_MATCH_TITLE_WEIGHT=0.4            # Weight for title similarity in scoring (0.0-1.0)
   RSS_MATCH_DESCRIPTION_WEIGHT=0.4      # Weight for description similarity in scoring (0.0-1.0)
   RSS_MATCH_PUBLISHER_WEIGHT=0.2        # Weight for publisher similarity in scoring (0.0-1.0)
   
   # Newsletter Worker (Optional - defaults provided)
   SEND_WORKER_ENABLED=true              # Enable nightly newsletter sending
   SEND_WORKER_CRON=0 5 * * 1-5          # Run at 5 AM Mon-Fri
   SEND_LOOKBACK=24                      # Hours to look back for editions
   SEND_WORKER_L10=false                 # Testing mode (send to test email)
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

# Regenerate TypeScript types after migrations
supabase gen types typescript --local > packages/shared/src/types/database.ts
```

#### Newsletter Editions Migration

The `newsletter_editions` table stores generated newsletter content for users. Each user can have one edition per date.

**Migration File**: `20250702190939_create_newsletter_editions.sql`

**Key Features**:
- Unique constraint on `(user_id, edition_date)` to prevent duplicates
- Soft delete support with `deleted_at` column
- Status tracking (`generated`, `error`, `no_notes_found`)
- Automatic timestamp updates with triggers

**Local Development**:
```bash
# Apply the migration locally
supabase db push

# Verify the table was created
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d newsletter_editions"

# Run integration tests
npm run test:all -- packages/server/lib/db/__tests__/newsletterEditions.migration.test.ts
```

**Production Deployment**:
- The migration will be automatically applied by the CI/CD pipeline
- No manual intervention required
- Types will be regenerated automatically

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

# Manually trigger newsletter worker
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('send_newsletter');
"

# Check what jobs are available
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
console.log('Available jobs: episode_sync, daily_subscription_refresh, transcript_worker, send_newsletter');
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

### Gemini Client Utility

The Gemini client provides a simple interface for generating episode notes from transcripts using Google's Gemini 1.5 Flash model.

**Location**: `packages/server/lib/llm/gemini.ts`

**Usage**:
```typescript
import { generateEpisodeNotes } from '../lib/llm/gemini.js';

// Generate episode notes from a transcript
try {
  const result = await generateEpisodeNotes(transcriptText);
  console.log('Generated notes:', result.notes);
  console.log('Model used:', result.model);
} catch (error) {
  if (error instanceof GeminiAPIError) {
    console.error('Gemini API error:', error.message);
    console.error('Status code:', error.statusCode);
    console.error('Response body:', error.responseBody);
  }
}
```

**Environment Requirements**:
- `GEMINI_API_KEY` - Required API key from Google AI Studio
- `GEMINI_MODEL_NAME` - Optional model override (defaults to `models/gemini-1.5-flash-latest`)
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

### Send Newsletter Worker

The `SendNewsletterWorker` sends daily email newsletters to users containing synthesized content from their podcast episodes. It processes newsletter editions and sends them via email using the Resend API.

**Location**: `packages/server/jobs/sendNewsletterWorker.ts`

**Features**:
- **Sequential Email Sending**: Processes editions one at a time for reliability
- **Normal Mode**: Sends to real users and updates `sent_at` timestamp
- **L10 Test Mode**: Sends to test email without updating `sent_at` for testing
- **Subject Line Generation**: Creates formatted subjects like "Listener Recap: July 8, 2025"
- **Placeholder Injection**: Injects user email, date, episode count, and footer text
- **Error Handling**: Skips editions with empty content and logs warnings
- **Structured Logging**: Comprehensive logging with job IDs and metadata

**Environment Configuration**:
```bash
# Email Service (Required)
RESEND_API_KEY=your_resend_api_key      # Resend API key
SEND_FROM_EMAIL=your_sender_email       # Email address to send from
TEST_RECEIVER_EMAIL=test@example.com    # Test email for L10 mode

# Worker Configuration (Optional - defaults provided)
SEND_WORKER_ENABLED=true                # Enable nightly newsletter sending
SEND_WORKER_CRON=0 5 * * 1-5           # Run at 5 AM Mon-Fri
SEND_LOOKBACK=24                        # Hours to look back for editions
SEND_WORKER_L10=false                   # Testing mode (send to test email)
```

**Usage**:
```bash
# Normal mode - send to real users
npx tsx jobs/sendNewsletterWorker.ts

# Testing mode - send last 10 editions to test email
SEND_WORKER_L10=true npx tsx jobs/sendNewsletterWorker.ts
```

**Testing**: Comprehensive integration tests covering normal mode, L10 mode, email parameter verification, and error handling scenarios.

### Newsletter Editions Helper

The `newsletter-editions` helper provides a type-safe, commented API for reading and writing newsletter edition rows in the `newsletter_editions` table. It encapsulates all DB access and validation logic for this feature.

**Location**: `packages/server/lib/db/newsletter-editions.ts`

**Shared Type**: `NewsletterEdition` (import from `@listener/shared`)

**Usage Example:**
```typescript
import {
  insertNewsletterEdition,
  upsertNewsletterEdition,
  updateNewsletterEditionStatus,
  getByUserAndDate,
  softDelete,
  CreateNewsletterEditionParams,
  NewsletterEdition // type
} from '@listener/shared';

// Insert a new edition
const edition = await insertNewsletterEdition({
  user_id: 'user-uuid',
  edition_date: '2025-07-04',
  status: 'generated',
  content: '<p>Newsletter HTML</p>',
  model: 'gemini-1.5-flash'
});

// Upsert (insert or update on conflict)
const upserted = await upsertNewsletterEdition({ ... });

// Update status
await updateNewsletterEditionStatus(edition.id, 'error', 'LLM failed');

// Fetch by user/date
const row = await getByUserAndDate('user-uuid', '2025-07-04');

// Soft delete
await softDelete(edition.id);
```

**Type Export:**
```typescript
// Import the shared type for type-safety
import type { NewsletterEdition } from '@listener/shared';
```

**Migration Note:**
- After running a migration that changes the `newsletter_editions` table, always regenerate types:
  ```bash
  supabase gen types typescript --local > packages/shared/src/types/database.ts
  ```
- The shared type is always exported from `packages/shared/src/types/index.ts` for easy import.

### Newsletter Edition Episodes Helper

The `newsletter-edition-episodes` helper provides a type-safe, commented API for managing the join table that tracks which episodes were included in each newsletter edition. This enables traceability from newsletter editions back to their source episodes.

**Location**: `packages/server/lib/db/newsletter-edition-episodes.ts`

**Shared Type**: `NewsletterEditionEpisode` (import from `@listener/shared`)

**Table Schema**:
```sql
CREATE TABLE newsletter_edition_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_edition_id uuid NOT NULL REFERENCES newsletter_editions(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES episode_transcript_notes(episode_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(newsletter_edition_id, episode_id)
);
```

**Key Features**:
- **Traceability**: Track which episodes were used in each newsletter edition
- **Cascade Deletes**: When a newsletter edition or episode transcript note is deleted, links are automatically removed
- **Duplicate Prevention**: Unique constraint prevents linking the same episode to the same newsletter multiple times
- **Efficient Queries**: Indexes on both foreign keys for fast lookups

**Usage Example:**
```typescript
import {
  insertNewsletterEditionEpisode,
  insertNewsletterEditionEpisodes,
  getEpisodesByNewsletterId,
  getNewslettersByEpisodeId,
  deleteNewsletterEditionEpisodes,
  isEpisodeLinkedToNewsletter,
  getEpisodeCountByNewsletterId,
  CreateNewsletterEditionEpisodeParams,
  CreateNewsletterEditionEpisodesParams
} from '../lib/db/newsletter-edition-episodes.js';

// Link a single episode to a newsletter edition
const link = await insertNewsletterEditionEpisode({
  newsletter_edition_id: 'edition-uuid',
  episode_id: 'episode-uuid'
});

// Link multiple episodes to a newsletter edition
const links = await insertNewsletterEditionEpisodes({
  newsletter_edition_id: 'edition-uuid',
  episode_ids: ['episode-1', 'episode-2', 'episode-3']
});

// Get all episodes included in a newsletter edition
const episodes = await getEpisodesByNewsletterId('edition-uuid');

// Get all newsletter editions that included a specific episode
const editions = await getNewslettersByEpisodeId('episode-uuid');

// Check if an episode is linked to a newsletter
const isLinked = await isEpisodeLinkedToNewsletter('edition-uuid', 'episode-uuid');

// Get episode count for a newsletter edition
const count = await getEpisodeCountByNewsletterId('edition-uuid');

// Remove all episode links for a newsletter edition
const deletedCount = await deleteNewsletterEditionEpisodes('edition-uuid');
```

**Integration with Newsletter Editions**:
```typescript
import { insertNewsletterEditionWithEpisodes } from '../lib/db/newsletter-editions.js';

// Create newsletter edition and link episodes atomically
const result = await insertNewsletterEditionWithEpisodes({
  user_id: 'user-uuid',
  edition_date: '2025-01-27',
  status: 'generated',
  content: '<p>Newsletter content</p>',
  model: 'gemini-pro',
  episode_ids: ['episode-1', 'episode-2'] // Automatically creates links
});

console.log(`Created newsletter with ${result.episode_count} episodes`);
```

**Type Export:**
```typescript
// Import the shared type for type-safety
import type { NewsletterEditionEpisode } from '@listener/shared';
```

**Migration File**: `20250703094053_create_newsletter_edition_episodes.sql`

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

# Transcript Status Columns (vNEXT July 2025)

The `transcripts` table now distinguishes between the **first** status observed (`initial_status`) and the **live** status (`current_status`).

* `initial_status` – what the worker discovered **on the first attempt**. Immutable after creation **except** when re-checking is enabled (see `TRANSCRIPT_WORKER_L10D`).
* `current_status`  – the up-to-date status that can evolve across worker runs.
* `error_details`   – optional text with provider error messages (populated only when `current_status='error'`).

Allowed status values (superset of provider states):

| Status                | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `full`                | Complete verbatim transcript obtained                               |
| `partial`             | Transcript exists but is missing ≥5 % of content                    |
| `processing`          | Transcript requested; provider has not finished generating it yet   |
| `no_transcript_found` | Provider has **no** transcript for this episode                     |
| `no_match`            | The episode could not be matched in provider catalogue              |
| `error`               | Unexpected provider or network failure (see `error_details`)        |

❌ **Legacy statuses** `available`, `pending`, `not_found` have been removed. Any references in code or docs should be updated.

In **re-check mode** (`TRANSCRIPT_WORKER_L10D=true`) the worker *overwrites* both `initial_status` and `current_status` for the last 10 episodes per show, ensuring stale or erroneous states are refreshed.

#### 7. Configure Episode-Notes Worker Background Job

The episode-notes worker runs nightly to generate structured episode notes from transcripts using Gemini 1.5 Flash. This job processes transcripts created in the last 24 hours and generates notes that will be used for newsletter generation.

```bash
# Enable/disable the episode-notes worker (default: enabled)
NOTES_WORKER_ENABLED=true

# Configure lookback window (default: 24 hours)
NOTES_LOOKBACK_HOURS=24

# Configure Gemini API concurrency (default: 30 simultaneous calls)
NOTES_MAX_CONCURRENCY=30

# Configure prompt template file (default: prompts/episode-notes.md)
NOTES_PROMPT_PATH=prompts/episode-notes.md

# Testing mode: process most recent transcripts regardless of existing notes
NOTES_WORKER_L10=false

# Number of recent transcripts to process in L10 mode (default: 10)
NOTES_WORKER_L10_COUNT=10
```

**Job Configuration Examples:**
```bash
# Standard production configuration (default)
NOTES_LOOKBACK_HOURS=24
NOTES_MAX_CONCURRENCY=30
NOTES_WORKER_L10=false

# Conservative configuration (slower, lower API usage)
NOTES_LOOKBACK_HOURS=24
NOTES_MAX_CONCURRENCY=10
NOTES_WORKER_L10=false

# Testing configuration (overwrites last 10 notes)
NOTES_LOOKBACK_HOURS=24
NOTES_MAX_CONCURRENCY=5
NOTES_WORKER_L10=true

# Testing configuration (overwrites last 25 notes)
NOTES_LOOKBACK_HOURS=24
NOTES_MAX_CONCURRENCY=5
NOTES_WORKER_L10=true
NOTES_WORKER_L10_COUNT=25

# Disable the job entirely
NOTES_WORKER_ENABLED=false
```

**Manual Job Execution:**
```bash
# Trigger episode-notes worker manually (for testing or backfills)
cd packages/server
npx tsx jobs/noteGenerator.ts

# Run in testing mode (last 10 transcripts)
NOTES_WORKER_L10=true npx tsx jobs/noteGenerator.ts

# Run in testing mode (last 25 transcripts)
NOTES_WORKER_L10=true NOTES_WORKER_L10_COUNT=25 npx tsx jobs/noteGenerator.ts
```

**Prompt Customization:**
The episode notes generation uses a customizable prompt template:

```bash
# Default location
prompts/episode-notes.md

# Custom location
NOTES_PROMPT_PATH=custom-prompts/my-episode-notes.md
```

To customize the generated notes:
1. Edit `prompts/episode-notes.md` (or your custom prompt file)
2. Modify the instructions, format, or focus areas
3. Test with `NOTES_WORKER_L10=true` to regenerate notes for recent episodes
4. Deploy the updated prompt file

**API Usage & Costs:**
- Uses Google Gemini 1.5 Flash API for note generation
- Default configuration: max 30 concurrent API calls
- Processes only transcripts without existing notes (idempotent)
- Stores generated notes in `episode_transcript_notes` table
- Each transcript generates one set of notes (approximately 200-400 words)

**Monitoring:**
- Job execution logs include note generation counts and timing
- Check application logs for `EPISODE_NOTES_WORKER` entries
- Failed note generation attempts are logged with error details
- Notes are stored with `status='done'` or `status='error'`

**Dependencies:**
- Requires Gemini API key (`GEMINI_API_KEY`)
- Depends on transcript worker output (transcripts must exist first)
- Uses Supabase Storage to download transcript files

#### 8. Configure Newsletter Edition Worker Background Job

The newsletter edition worker runs nightly to generate personalized newsletter editions from episode notes using Gemini 1.5 Flash. This job processes episode notes created in the last 24 hours and generates user-specific newsletters that synthesize multiple episodes into cohesive content.

```bash
# Enable/disable the newsletter edition worker (default: enabled)
EDITION_WORKER_ENABLED=true

# Configure lookback window (default: 24 hours)
EDITION_LOOKBACK_HOURS=24

# Configure prompt template file (default: prompts/newsletter-edition.md)
EDITION_PROMPT_PATH=prompts/newsletter-edition.md

# Testing mode: overwrite the last 10 newsletter editions regardless of user
EDITION_WORKER_L10=false
```

**Job Configuration Examples:**
```bash
# Standard production configuration (default)
EDITION_LOOKBACK_HOURS=24
EDITION_WORKER_L10=false

# Conservative configuration (smaller lookback window)
EDITION_LOOKBACK_HOURS=12
EDITION_WORKER_L10=false

# Testing configuration (overwrites last 3 editions)
EDITION_LOOKBACK_HOURS=24
EDITION_WORKER_L10=true

# Disable the job entirely
EDITION_WORKER_ENABLED=false
```

**Manual Job Execution:**
```bash
# Trigger newsletter edition worker manually (for testing or backfills)
cd packages/server
npx tsx jobs/editionGenerator.ts

# Run in testing mode (last 10 editions)
EDITION_WORKER_L10=true npx tsx jobs/editionGenerator.ts
```

**Prompt Customization:**
The newsletter generation uses a customizable prompt template:

```bash
# Default location
prompts/newsletter-edition.md

# Custom location
EDITION_PROMPT_PATH=custom-prompts/my-newsletter-edition.md
```

To customize the generated newsletters:
1. Edit `prompts/newsletter-edition.md` (or your custom prompt file)
2. Modify the instructions, format, or focus areas
3. Test with `EDITION_WORKER_L10=true` to regenerate newsletters for recent editions
4. Deploy the updated prompt file

**API Usage & Costs:**
- Uses Google Gemini 1.5 Flash API for newsletter generation
- Processes only users with active subscriptions and new episode notes
- Stores generated newsletters in `newsletter_editions` table
- Each user generates one newsletter edition per day (approximately 800-1200 words)
- Tracks which episodes were used in `newsletter_edition_episodes` join table

**Monitoring:**
- Job execution logs include newsletter generation counts and timing
- Check application logs for `NEWSLETTER_EDITION_WORKER` entries
- Failed newsletter generation attempts are logged with error details
- Newsletters are stored with `status='done'`, `status='error'`, or `status='no_content_found'`

**Dependencies:**
- Requires Gemini API key (`GEMINI_API_KEY`)
- Depends on episode notes worker output (notes must exist first)
- Requires user podcast subscriptions to determine content scope
- Uses `sanitize-html` for content sanitization before storage

#### 9. Cron Setup & Troubleshooting

The application uses internal cron jobs managed by the `node-cron` library within the main server process. All background jobs are configured via environment variables and run automatically in production.

**Job Schedule Overview:**
```bash
# Daily subscription refresh (midnight PT)
DAILY_SUBSCRIPTION_REFRESH_CRON=0 0 * * *

# Episode sync (1 hour after subscription refresh)
EPISODE_SYNC_CRON=0 1 * * *

# Transcript worker (1 hour after episode sync)
TRANSCRIPT_WORKER_CRON=0 1 * * *

# Notes worker (1 hour after transcript worker)
NOTES_WORKER_CRON=0 2 * * *

# Newsletter edition worker (1 hour after notes worker)
EDITION_WORKER_CRON=0 3 * * *
```

**Production Deployment (Render):**

1. **Environment Variables Setup:**
   ```bash
   # In Render dashboard → Environment → Environment Variables
   
   # Enable all background jobs
DAILY_SUBSCRIPTION_REFRESH_ENABLED=true
EPISODE_SYNC_ENABLED=true
TRANSCRIPT_WORKER_ENABLED=true
NOTES_WORKER_ENABLED=true
EDITION_WORKER_ENABLED=true

# Configure job schedules (Pacific Time)
DAILY_SUBSCRIPTION_REFRESH_CRON=0 0 * * *
EPISODE_SYNC_CRON=0 1 * * *
TRANSCRIPT_WORKER_CRON=0 1 * * *
NOTES_WORKER_CRON=0 2 * * *
EDITION_WORKER_CRON=0 3 * * *

# Job-specific configuration
TRANSCRIPT_TIER=business
TRANSCRIPT_LOOKBACK=24
TRANSCRIPT_MAX_REQUESTS=15
TRANSCRIPT_CONCURRENCY=10

NOTES_LOOKBACK_HOURS=24
NOTES_MAX_CONCURRENCY=30
NOTES_PROMPT_PATH=prompts/episode-notes.md

EDITION_LOOKBACK_HOURS=24
EDITION_PROMPT_PATH=prompts/newsletter-edition.md
   ```

2. **Timezone Configuration:**
   ```bash
   # All cron schedules use Pacific Time (PT)
   # Cron format: minute hour day-of-month month day-of-week
   # Example: 0 2 * * * = 2:00 AM PT daily
   ```

3. **Manual Job Execution (Production):**
   ```bash
   # Via Render shell or SSH access
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
await runJob('daily_subscription_refresh');
await runJob('episode_sync');
await runJob('transcript_worker');
await runJob('notes_worker');
await runJob('edition_worker');
"
   ```

**Troubleshooting Common Issues:**

1. **Jobs Not Running:**
   ```bash
   # Check if jobs are enabled
echo $DAILY_SUBSCRIPTION_REFRESH_ENABLED
echo $EPISODE_SYNC_ENABLED
echo $TRANSCRIPT_WORKER_ENABLED
echo $NOTES_WORKER_ENABLED
echo $EDITION_WORKER_ENABLED

# Check cron schedules
echo $DAILY_SUBSCRIPTION_REFRESH_CRON
echo $EPISODE_SYNC_CRON
echo $TRANSCRIPT_WORKER_CRON
echo $NOTES_WORKER_CRON
echo $EDITION_WORKER_CRON
   ```

2. **Job Execution Failures:**
   ```bash
   # Check application logs for job execution
   # Look for these log patterns:
   # - "Starting scheduled [job_name] job"
   # - "BACKGROUND_JOBS: Starting scheduled [job_name] job"
   # - "Job [job_name] completed successfully"
   # - "Job [job_name] failed"
   
   # Common error patterns:
   # - "Database connection failed"
   # - "API rate limit exceeded"
   # - "Missing required environment variable"
   ```

3. **Database Connection Issues:**
   ```bash
   # Verify database connection
   # Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   # Ensure database is accessible from Render
   
   # Test connection manually
   cd packages/server
   npx tsx -e "
   import { createClient } from '@supabase/supabase-js';
   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
   const { data, error } = await supabase.from('users').select('count').limit(1);
   console.log('DB connection test:', error ? 'FAILED' : 'SUCCESS');
   "
   ```

4. **API Rate Limiting:**
   ```bash
   # For transcript worker (Taddy API)
   # Reduce concurrency and max requests
   TRANSCRIPT_CONCURRENCY=5
   TRANSCRIPT_MAX_REQUESTS=10
   
   # For notes worker (Gemini API)
   # Reduce concurrency
   NOTES_MAX_CONCURRENCY=10
   
   # Check API quotas
   # Taddy Business: 1,000 transcriptions, 350,000 API requests
   # Gemini: Check Google AI Studio dashboard
   ```

5. **Job Timing Issues:**
   ```bash
   # Verify timezone settings
   # All jobs run in Pacific Time (PT)
   # Adjust schedules if needed:
   
   # For Eastern Time (ET) - add 3 hours
   TRANSCRIPT_WORKER_CRON=0 4 * * *  # 4 AM ET = 1 AM PT
NOTES_WORKER_CRON=0 5 * * *       # 5 AM ET = 2 AM PT
EDITION_WORKER_CRON=0 6 * * *     # 6 AM ET = 3 AM PT
   
   # For UTC - subtract 8 hours (or add 16)
   TRANSCRIPT_WORKER_CRON=0 9 * * *  # 9 AM UTC = 1 AM PT
NOTES_WORKER_CRON=0 10 * * *      # 10 AM UTC = 2 AM PT
EDITION_WORKER_CRON=0 11 * * *    # 11 AM UTC = 3 AM PT
   ```

6. **Storage and File Issues:**
   ```bash
   # Check Supabase Storage buckets
   # Ensure transcripts bucket exists and is accessible
   
   # Verify storage permissions
   # Service role key should have storage access
   
   # Check file paths in database
   # Look for missing or malformed storage_path values
   ```

7. **Memory and Performance:**
   ```bash
   # Monitor memory usage during job execution
   # Large transcript files can consume significant memory
   
   # Reduce concurrency if memory issues occur
   TRANSCRIPT_CONCURRENCY=5
   NOTES_MAX_CONCURRENCY=15
   
   # Check for memory leaks in long-running jobs
   # Monitor heap usage in application logs
   ```

**Monitoring and Alerting:**

1. **Log Monitoring:**
   ```bash
   # Key log patterns to monitor:
   # - "Job [job_name] completed successfully"
   # - "Job [job_name] failed with error"
   # - "BACKGROUND_JOBS: Starting scheduled [job_name] job"
   # - "EPISODE_NOTES_WORKER: Starting notes worker"
# - "TRANSCRIPT_WORKER: Starting transcript worker"
# - "NEWSLETTER_EDITION_WORKER: Starting edition worker"
   ```

2. **Success Metrics:**
   ```bash
   # Daily subscription refresh: Users processed count
   # Episode sync: New episodes discovered count
   # Transcript worker: Transcripts processed count
# Notes worker: Notes generated count
# Newsletter edition worker: Newsletters generated count
   
   # Check these in application logs after each job run
   ```

3. **Error Tracking:**
   ```bash
   # Monitor error rates and types
   # Common errors to track:
   # - Database connection failures
   # - API rate limit exceeded
   # - Missing environment variables
   # - File download failures
   # - Gemini API errors
   ```

**Emergency Procedures:**

1. **Disable All Jobs:**
   ```bash
   # Set all job enabled flags to false
   DAILY_SUBSCRIPTION_REFRESH_ENABLED=false
   EPISODE_SYNC_ENABLED=false
   TRANSCRIPT_WORKER_ENABLED=false
NOTES_WORKER_ENABLED=false
EDITION_WORKER_ENABLED=false
   ```

2. **Manual Recovery:**
   ```bash
   # Run jobs manually in correct order
   # 1. Daily subscription refresh
   # 2. Episode sync
   # 3. Transcript worker
# 4. Notes worker
# 5. Newsletter edition worker
   
   cd packages/server
   npx tsx -e "
   import { runJob } from './services/backgroundJobs.js';
   await runJob('daily_subscription_refresh');
   await runJob('episode_sync');
   await runJob('transcript_worker');
   await runJob('notes_worker');
   "
   ```

3. **Database Recovery:**
   ```bash
   # Check for failed job states
   # Clear advisory locks if needed
   # Reset job statuses if necessary
   ```

## Post-Deployment Cleanup

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