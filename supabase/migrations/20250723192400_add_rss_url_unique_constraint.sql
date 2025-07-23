-- Add unique constraint on rss_url in podcast_shows table
-- This prevents duplicate shows from being created with the same RSS URL

-- Check if the constraint already exists (it might have been added in migration 20250618002310_add_rss_url_constraints.sql)
DO $$
BEGIN
  -- Check if the constraint exists
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'podcast_shows_rss_url_unique'
  ) THEN
    -- First, check if there are any duplicate rss_urls that would violate the constraint
    DECLARE
      duplicate_count INTEGER;
    BEGIN
      SELECT COUNT(*)
      INTO duplicate_count
      FROM (
        SELECT rss_url, COUNT(*) as cnt
        FROM podcast_shows
        WHERE rss_url IS NOT NULL
        GROUP BY rss_url
        HAVING COUNT(*) > 1
      ) dups;
      
      IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % RSS URLs with duplicates. These will need to be resolved before adding the constraint.', duplicate_count;
        -- In production, we would need to handle duplicates before adding the constraint
        -- For development/testing, we'll proceed with adding the constraint
      END IF;
      
      -- Add the unique constraint
      ALTER TABLE podcast_shows
      ADD CONSTRAINT podcast_shows_rss_url_unique UNIQUE (rss_url);
      
      RAISE NOTICE 'Added unique constraint on rss_url';
    END;
  ELSE
    RAISE NOTICE 'Constraint podcast_shows_rss_url_unique already exists, skipping';
  END IF;
END $$;