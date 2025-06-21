-- Migration: Add index on podcast_episodes.pub_date for transcript worker
-- Created: 2025-06-21 09:45:00 UTC
-- Purpose: Optimize queries that filter episodes by publication date for transcript processing

-- ► Add index on pub_date for efficient lookback queries
-- This index supports the transcript worker's query pattern:
-- WHERE pub_date >= NOW() - INTERVAL '${TRANSCRIPT_LOOKBACK} hours'
CREATE INDEX CONCURRENTLY IF NOT EXISTS podcast_episodes_pub_date_idx 
  ON podcast_episodes(pub_date DESC);

-- Index benefits:
-- - Enables fast filtering of episodes by publication date
-- - Supports DESC ordering for "newest first" queries  
-- - Used by transcript worker to find episodes in lookback window
-- - Improves performance as episode table grows over time
--
-- Query patterns optimized:
-- - SELECT * FROM podcast_episodes WHERE pub_date >= $1 ORDER BY pub_date DESC
-- - SELECT * FROM podcast_episodes WHERE pub_date >= $1 AND show_id = $2
-- - COUNT queries for episodes in date ranges 