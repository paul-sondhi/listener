# RSS URL Update Scripts

This directory contains scripts to update podcast_shows table with proper RSS feed URLs.

## Scripts Overview

### `updateAllRssUrls.ts`
- **Purpose**: Updates ALL existing podcast_shows rows with proper RSS URLs
- **Use case**: Fix database where rss_url contains incorrect Spotify URLs
- **Process**: 
  1. Queries all shows in podcast_shows table
  2. For each show, calls Spotify API to get actual title
  3. Searches PodcastIndex and iTunes for RSS feed URL
  4. Updates database with real RSS URL (or keeps Spotify URL as fallback)
  5. Updates title with actual show name

### `runUpdateAllRssUrls.sh`
- **Purpose**: Safe wrapper script to run the TypeScript update script
- **Features**:
  - Validates environment variables
  - Shows production warnings
  - Requires user confirmation
  - Logs execution details

## Usage

### Prerequisites
1. Required environment variables:
   ```bash
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   PODCASTINDEX_KEY=your_podcastindex_key  
   PODCASTINDEX_SECRET=your_podcastindex_secret
   USER_AGENT=Listener-App/1.0  # Optional, will be set automatically
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Script

#### Option 1: Using the shell wrapper (recommended)
```bash
# From project root directory
./scripts/runUpdateAllRssUrls.sh
```

#### Option 2: Running TypeScript directly
```bash
# From project root directory
tsx scripts/updateAllRssUrls.ts
# or
ts-node scripts/updateAllRssUrls.ts
```

## Important Considerations

### Rate Limiting
- Script processes shows in batches of 10
- 5-second delay between batches
- 1.5-second delay between individual shows
- Estimated time: 1-2 minutes per 10 shows

### API Calls Made
For each podcast show:
1. **Spotify API**: Get show metadata and title
2. **PodcastIndex API**: Search for RSS feed
3. **iTunes API**: Fallback search if PodcastIndex fails

### Production Safety
- Script includes production warnings
- Requires explicit user confirmation
- Validates all environment variables
- Comprehensive error handling and logging

### Expected Results
- **RSS feeds found**: Shows updated with real RSS URLs
- **No RSS feed found**: Shows keep Spotify URL as fallback
- **API failures**: Individual shows may fail but script continues
- **Database errors**: Stops execution to prevent data corruption

## Example Output

```
🚀 RSS URL Update Script Starting...
🔄 Starting RSS URL update process for ALL podcast_shows...
📊 Querying all podcast_shows...
📋 Found 25 shows to process
🔄 Processing in batches of 10 with 5s delays

🔄 Processing batch 1/3 (shows 1-10)
[1/25] Processing: The Daily
  Title from Spotify: "the daily"
  Found RSS feed: https://feeds.nytimes.com/nyt/rss/TheDailyTalk
  ✅ Updated with RSS feed: https://feeds.nytimes.com/nyt/rss/TheDailyTalk

[2/25] Processing: Joe Rogan Experience
  Title from Spotify: "the joe rogan experience"
  No RSS feed found, keeping Spotify URL as fallback
  ✅ Updated (no RSS found, using Spotify URL): https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk

📊 RSS URL Update Summary:
  Total shows processed: 25
  Successful updates: 25
  Failed updates: 0
  RSS feeds found: 18
  RSS feeds not found (using Spotify URL): 7
  Duration: 2m 45s

🎉 RSS URL update completed successfully!
✅ Database is now ready with proper RSS URLs
```

## Troubleshooting

### Common Issues

1. **Environment variables missing**
   ```
   ❌ Missing required environment variables:
      - PODCASTINDEX_KEY
   ```
   **Solution**: Set missing variables in `.env.local`

2. **API rate limits**
   ```
   ❌ Failed: PodcastIndex search failed with status 429
   ```
   **Solution**: Wait and re-run, script includes delays but external APIs may have limits

3. **Database connection issues**
   ```
   ❌ Database update failed: Connection timeout
   ```
   **Solution**: Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

4. **Spotify API issues**
   ```
   ❌ Failed to fetch show from Spotify API
   ```
   **Solution**: Invalid Spotify URL in database or Spotify API issues

### Recovery
- Script tracks all errors and continues processing
- Failed shows are logged with specific error messages
- Can be re-run safely (will update existing records)
- Consider running failed shows individually if needed

## Related Scripts

- `backfillRssUrl.ts`: Original script for NULL rss_url values only
- `runProductionBackfill.sh`: Previous production backfill script
- These new scripts handle ALL rows, including incorrectly populated ones 