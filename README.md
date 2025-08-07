# Listener

An automated podcast transcription and newsletter service that integrates with Spotify to deliver personalized daily email digests of your favorite podcasts.

## Overview

Listener automatically:
- Syncs your Spotify podcast subscriptions
- Fetches transcripts for new episodes
- Generates AI-powered episode summaries
- Creates personalized daily newsletters
- Delivers content via email every weekday morning

Built for simplicity and designed to serve ~100 users, Listener prioritizes ease of use over scale.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Vite
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth + Spotify OAuth
- **AI**: Google Gemini 1.5 Flash
- **Email**: Resend
- **Transcripts**: Taddy API + Deepgram fallback
- **Hosting**: Render (production)

## Project Structure

```
listener/
├── packages/
│   ├── server/          # Express.js backend
│   ├── client/          # React frontend
│   └── shared/          # Shared TypeScript types
├── supabase/
│   └── migrations/      # Database migrations
├── prompts/             # AI prompt templates
├── scripts/             # Development & deployment scripts
└── config/              # Configuration files
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Supabase CLI
- Spotify Developer Account
- API Keys: Taddy, Gemini, Resend

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd listener
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

   Required variables:
   ```bash
   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Spotify
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   
   # APIs
   TADDY_API_KEY=your_taddy_api_key
   GEMINI_API_KEY=your_gemini_api_key
   RESEND_API_KEY=your_resend_api_key
   
   # Email
   SEND_FROM_EMAIL=noreply@yourdomain.com
   TEST_RECEIVER_EMAIL=test@example.com
   
   # Security
   JWT_SECRET=your_jwt_secret
   TOKEN_ENC_KEY=your_32_char_encryption_key
   ```

3. **Initialize database**
   ```bash
   npm run supabase:start
   npm run db:reset
   ```

4. **Generate TypeScript types**
   ```bash
   npm run codegen
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   Access the app at http://localhost:5173

## Core Features

### User Authentication
- Spotify OAuth integration
- Google OAuth support
- Encrypted token storage
- Automatic token refresh

### Podcast Management
- Automatic Spotify subscription sync
- OPML file import support
- RSS feed discovery and matching
- Manual RSS URL overrides

### Content Pipeline
1. **Episode Discovery**: RSS feed monitoring for new episodes
2. **Transcript Fetching**: Taddy API with Deepgram fallback
3. **Note Generation**: AI-powered summaries using Gemini
4. **Newsletter Creation**: Daily digest compilation
5. **Email Delivery**: Automated weekday morning sends

### Background Jobs

All jobs run automatically via node-cron:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `daily_subscription_refresh` | Midnight PT | Sync Spotify subscriptions |
| `episode_sync` | 1 AM PT | Check RSS feeds for new episodes |
| `transcript_worker` | 1 AM PT | Fetch episode transcripts |
| `notes_worker` | 2 AM PT | Generate episode summaries |
| `edition_worker` | 3 AM PT | Create newsletter editions |
| `send_newsletter` | 5 AM PT Mon-Fri | Send email newsletters |

## Development

### Commands

```bash
# Development
npm run dev                  # Start full dev environment
npm run build                # Build all packages
npm run type-check           # TypeScript validation
npm run lint                 # ESLint check

# Testing
npm test                     # Unit tests
npm run test:integration     # Integration tests
npm run test:all            # All tests with coverage

# Database
npm run db:reset            # Reset local database
supabase migration new <name> # Create new migration

# Manual job execution (from packages/server)
npx tsx -e "import { runJob } from './services/backgroundJobs.js'; await runJob('transcript_worker');"
```

### Testing Modes

Most background workers support L10 testing mode for development:

```bash
# Reprocess last 10 transcripts
TRANSCRIPT_WORKER_L10=true npx tsx jobs/transcriptWorker.ts

# Regenerate last 10 episode notes
NOTES_WORKER_L10=true npx tsx jobs/noteGenerator.ts

# Test newsletter generation
EDITION_WORKER_L10=true npx tsx jobs/editionGenerator.ts

# Test email sending (sends to TEST_RECEIVER_EMAIL)
SEND_WORKER_L10=true npx tsx jobs/sendNewsletterWorker.ts
```

### Adding Features

1. **New API endpoint**: Add route in `packages/server/routes/`
2. **Database changes**: Create migration in `supabase/migrations/`
3. **Background job**: Add to `packages/server/services/backgroundJobs.ts`
4. **Shared types**: Define in `packages/shared/src/types/`

## Production Deployment

### Environment Variables

Configure these in your production environment (e.g., Render):

```bash
# Enable all workers
DAILY_SUBSCRIPTION_REFRESH_ENABLED=true
EPISODE_SYNC_ENABLED=true
TRANSCRIPT_WORKER_ENABLED=true
NOTES_WORKER_ENABLED=true
EDITION_WORKER_ENABLED=true
SEND_WORKER_ENABLED=true

# API tier configuration
TRANSCRIPT_TIER=business

# Worker limits
TRANSCRIPT_MAX_REQUESTS=15
NOTES_MAX_CONCURRENCY=30
```

### Database Migrations

Migrations are automatically applied during deployment. For manual migration:

```bash
supabase db push --linked
```

### Monitoring

Key metrics to track:
- Job execution logs: Look for `BACKGROUND_JOB` entries
- Transcript success rate
- Newsletter generation count
- Email delivery status
- API quota usage (Taddy, Gemini)

## Architecture

### Data Flow

```
Spotify API → User Subscriptions → RSS Feeds → New Episodes
     ↓              ↓                  ↓            ↓
   OAuth      Database Storage    Episode Sync  Taddy API
                                                     ↓
                                              Transcript Storage
                                                     ↓
                                               Gemini AI Notes
                                                     ↓
                                             Newsletter Edition
                                                     ↓
                                              Email Delivery
```

### Database Schema

Key tables:
- `users` - User accounts with encrypted Spotify tokens
- `podcast_shows` - Podcast metadata and RSS URLs
- `podcast_episodes` - Individual episodes
- `user_podcast_subscriptions` - User's subscribed shows
- `transcripts` - Episode transcript metadata
- `episode_transcript_notes` - AI-generated summaries
- `newsletter_editions` - Generated newsletters
- `newsletter_edition_episodes` - Episode tracking

## API Documentation

### Public Endpoints

- `GET /api/health` - Service health check
- `POST /api/auth/spotify` - Spotify OAuth callback
- `POST /api/auth/google` - Google OAuth callback

### Authenticated Endpoints

- `GET /api/user/stats` - User statistics and subscription info
- `POST /api/sync-spotify-shows` - Manual subscription refresh
- `POST /api/opml/upload` - Import OPML podcast list
- `GET /api/transcribe?url=<spotify_url>` - Transcribe specific episode

## Troubleshooting

### Common Issues

**Jobs not running**: Check environment variables are set correctly
```bash
echo $TRANSCRIPT_WORKER_ENABLED
echo $TRANSCRIPT_WORKER_CRON
```

**Token refresh failures**: User needs to re-authenticate
```sql
UPDATE users SET spotify_reauth_required = true WHERE id = 'user-id';
```

**Missing transcripts**: Check Taddy API quota and logs
```bash
# View transcript worker logs
grep "TRANSCRIPT_WORKER" app.log
```

**Email not sending**: Verify Resend configuration
```bash
# Test email configuration
SEND_WORKER_L10=true npx tsx jobs/sendNewsletterWorker.ts
```

## Contributing

1. Follow existing code patterns and conventions
2. Write tests for new features
3. Update TypeScript types as needed
4. Run `npm run lint` and `npm test` before committing
5. Create clear commit messages

## License

ISC