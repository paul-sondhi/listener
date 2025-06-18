-- Migration: Add RSS URL and episode check timestamp to podcast_shows
-- Created: 2025-06-18 00:22:22 UTC
-- Purpose: Add rss_url (nullable initially) and last_checked_episodes columns for episode sync feature

-- ► Add rss_url column (nullable initially, will add constraints after backfill)
alter table podcast_shows 
  add column rss_url text;

-- ► Add last_checked_episodes timestamp column
alter table podcast_shows 
  add column last_checked_episodes timestamptz;

-- ► Add comment for documentation
comment on column podcast_shows.rss_url is 'RSS feed URL for fetching podcast episodes';
comment on column podcast_shows.last_checked_episodes is 'Timestamp of last episode sync check'; 