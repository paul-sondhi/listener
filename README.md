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

## Authentication

The application uses Supabase for authentication. Protected routes require a valid `sb-access-token` cookie or Bearer token in the Authorization header. 