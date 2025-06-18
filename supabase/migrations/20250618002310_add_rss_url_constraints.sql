-- Migration: Add constraints to rss_url column after backfill
-- Created: 2025-06-18 00:23:10 UTC
-- Purpose: Add unique not null constraint on rss_url after data backfill is complete

-- Note: This migration should be run AFTER the rss_url backfill process is complete
-- to ensure all existing podcast_shows have valid rss_url values

-- ► First, backfill null rss_url values with spotify_url values
UPDATE podcast_shows 
SET rss_url = spotify_url 
WHERE rss_url IS NULL AND spotify_url IS NOT NULL;

-- ► Remove any rows that still have null values in both columns (if any)
DELETE FROM podcast_shows 
WHERE rss_url IS NULL AND spotify_url IS NULL;

-- ► Add NOT NULL constraint to rss_url
alter table podcast_shows 
  alter column rss_url set not null;

-- ► Add unique constraint to rss_url
alter table podcast_shows 
  add constraint podcast_shows_rss_url_unique unique (rss_url); 