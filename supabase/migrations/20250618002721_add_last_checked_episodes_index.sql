-- Migration: Add index on last_checked_episodes for efficient querying
-- Created: 2025-06-18 00:27:21 UTC
-- Purpose: Add index to support efficient queries on last_checked_episodes for future variable scheduling

-- ► Add index on last_checked_episodes for efficient queries
-- This will help with queries like "shows that haven't been checked in X hours"
-- or "shows ordered by last check time" for variable scheduling
create index podcast_shows_last_checked_episodes_idx 
  on podcast_shows(last_checked_episodes);

-- ► Add comment for documentation
comment on index podcast_shows_last_checked_episodes_idx is 'Index for efficient queries on episode sync timestamps'; 