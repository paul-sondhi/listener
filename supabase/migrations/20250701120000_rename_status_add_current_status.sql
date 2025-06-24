-- Migration: Rename status column and add current_status and error_details
-- Created: 2025-07-01 12:00:00 UTC

-- 1️⃣ Rename existing status column → initial_status
ALTER TABLE transcripts
  RENAME COLUMN status TO initial_status;

-- 2️⃣ Add new columns
ALTER TABLE transcripts
  ADD COLUMN current_status VARCHAR NOT NULL;

ALTER TABLE transcripts
  ADD COLUMN error_details TEXT NULL;

-- 3️⃣ Drop old check constraint on status values (if any)
ALTER TABLE transcripts
  DROP CONSTRAINT IF EXISTS transcripts_status_check;

-- 4️⃣ Add updated check constraints for both status columns
ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_initial_status_check
  CHECK (initial_status IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error'));

ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_current_status_check
  CHECK (current_status IN ('full', 'partial', 'processing', 'no_transcript_found', 'no_match', 'error')); 