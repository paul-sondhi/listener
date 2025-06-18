# Listener

A podcast transcription service that integrates with Spotify.

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

2. Create a `.env` file with the following variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   PORT=3000
   
   # Episode Sync Configuration (optional)
   EPISODE_SYNC_ENABLED=true
   EPISODE_SYNC_CRON=0 0 * * *
   EPISODE_SYNC_TIMEZONE=America/Los_Angeles
   ```

3. Start the development environment:
   ```bash
   npm run dev
   ```

## Development Commands

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

# Check what jobs are available
cd packages/server
npx tsx -e "
import { runJob } from './services/backgroundJobs.js';
console.log('Available jobs: episode_sync, daily_subscription_refresh, vault_cleanup, key_rotation');
"
```

## API Endpoints

- `GET /api/transcribe?url=<spotify_url>` - Transcribe a podcast episode
- `POST /api/store-spotify-tokens` - Store Spotify authentication tokens
- `POST /api/sync-spotify-shows` - Sync user's Spotify podcast subscriptions

## Database Schema

The application uses Supabase (PostgreSQL) with the following core tables:

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

## Deployment

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

### Post-Deployment Cleanup

After successful deployment, the backfill script should be disabled to prevent accidental re-runs:

```bash
# Option 1: Move script to archive
mv scripts/backfillRssUrl.ts scripts/archive/backfillRssUrl.ts.completed

# Option 2: Add to .gitignore (if keeping for reference)
echo "scripts/backfillRssUrl.ts" >> .gitignore
```

**⚠️ Important**: Never run the backfill script in production after the initial deployment. It's designed for one-time use only.

## Authentication

The application uses Supabase for authentication. Protected routes require a valid `sb-access-token` cookie or Bearer token in the Authorization header. 