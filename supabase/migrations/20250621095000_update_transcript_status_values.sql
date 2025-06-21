-- Migration: Update transcript status values to match PRD requirements
-- Created: 2025-06-21 09:50:00 UTC
-- Purpose: Change transcript status enum to support transcript worker status values

-- The PRD specifies these status values for the transcript worker:
-- - 'full': Complete transcript successfully stored
-- - 'partial': Incomplete transcript successfully stored
-- - 'not_found': Episode found but no transcript available
-- - 'no_match': Episode not found in Taddy database
-- - 'error': API error or processing failure

-- Step 1: Drop the existing check constraint
ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_status_check;

-- Step 2: Update existing status values to new format
-- Map 'pending' -> 'error' (these were failed states)
-- Map 'available' -> 'full' (these were successful states, assume full quality)
-- Map 'error' -> 'error' (unchanged)
UPDATE transcripts 
SET status = CASE 
  WHEN status = 'pending' THEN 'error'
  WHEN status = 'available' THEN 'full'
  ELSE status
END;

-- Step 3: Add new check constraint with updated status values
ALTER TABLE transcripts 
ADD CONSTRAINT transcripts_status_check 
CHECK (status IN ('full', 'partial', 'not_found', 'no_match', 'error'));

-- Step 4: Add comment explaining status values
COMMENT ON COLUMN transcripts.status IS 'Transcript processing status: full (complete transcript), partial (incomplete transcript), not_found (no transcript), no_match (episode not found), error (processing failed)'; 