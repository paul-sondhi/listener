-- Migration: Update storage_path constraint for new transcript status vocabulary
-- Created: 2025-07-05 23:59:00 UTC

-- 👇 Drop legacy constraint that only allowed NULL when status = 'processing'
ALTER TABLE transcripts
  DROP CONSTRAINT IF EXISTS transcripts_storage_path_conditional_check;

-- 👇 Re-create constraint so that storage_path rules are driven by *current_status*
--    • For transcript rows whose current_status is 'full' or 'partial', a file *must* exist → storage_path NOT NULL and not empty
--    • For rows in 'processing', 'no_transcript_found', 'no_match', or 'error', the file may be   absent → storage_path NULL or empty string
--    This matches the dual-column status model introduced in tasks-prd-6.2.
ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_storage_path_conditional_check
  CHECK (
    (current_status IN ('full', 'partial') AND storage_path IS NOT NULL AND storage_path <> '') OR
    (current_status IN ('processing', 'no_transcript_found', 'no_match', 'error') AND (storage_path IS NULL OR storage_path = ''))
  );

-- Optional: add a comment for future maintainers
COMMENT ON CONSTRAINT transcripts_storage_path_conditional_check ON transcripts IS
  'Enforces that transcripts with usable text (full/partial) always have an accompanying storage_path; all other statuses permit NULL or empty paths.'; 