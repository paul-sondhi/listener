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

3. Start the server:
   ```bash
   npm start
   ```

## API Endpoints

- `GET /api/transcribe?url=<spotify_url>` - Transcribe a podcast episode
- `POST /api/store-spotify-tokens` - Store Spotify authentication tokens
- `POST /api/sync-spotify-shows` - Sync user's Spotify podcast subscriptions

## Authentication

The application uses Supabase for authentication. Protected routes require a valid `sb-access-token` cookie or Bearer token in the Authorization header. 