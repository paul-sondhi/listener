-- Migration: Rename status column and add current_status and error_details
-- Created: 2025-07-01 12:00:00 UTC

-- 1️⃣ Rename existing status column → initial_status
ALTER TABLE transcripts
  RENAME COLUMN status TO initial_status;

-- 2️⃣ Add new columns (current_status initially NULL so we can backfill)
ALTER TABLE transcripts
  ADD COLUMN current_status VARCHAR NULL,
  ADD COLUMN error_details TEXT NULL;

-- 3️⃣ Drop old check constraint on status values (if any)
ALTER TABLE transcripts
  DROP CONSTRAINT IF EXISTS transcripts_status_check;

-- 4️⃣ Backfill current_status with the existing initial_status values
UPDATE transcripts
  SET current_status = initial_status;

-- 5️⃣ Migrate legacy value `not_found` → `no_transcript_found` in both columns
UPDATE transcripts
  SET initial_status  = 'no_transcript_found'
  WHERE initial_status = 'not_found';

UPDATE transcripts
  SET current_status  = 'no_transcript_found'
  WHERE current_status = 'not_found';

-- 5️⃣.b Map additional legacy values to the new vocabulary
-- → 'pending'  → 'processing' (was an in-progress state)
-- → 'available' → 'full'      (assume full transcript when marked available)
UPDATE transcripts
  SET initial_status  = 'processing'
  WHERE initial_status = 'pending';

UPDATE transcripts
  SET current_status  = 'processing'
  WHERE current_status = 'pending';

UPDATE transcripts
  SET initial_status  = 'full'
  WHERE initial_status = 'available';

UPDATE transcripts
  SET current_status  = 'full'
  WHERE current_status = 'available';

-- If any unexpected status values remain, coerce them to 'error' so constraints pass safely
UPDATE transcripts
  SET initial_status = 'error'
  WHERE initial_status NOT IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error');

UPDATE transcripts
  SET current_status = 'error'
  WHERE current_status NOT IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error');

-- 6️⃣ Enforce NOT NULL on current_status now that data is populated
ALTER TABLE transcripts
  ALTER COLUMN current_status SET NOT NULL;

-- 7️⃣ Add updated check constraints for both status columns
ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_initial_status_check
  CHECK (initial_status IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error'));

ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_current_status_check
  CHECK (current_status IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error')); 