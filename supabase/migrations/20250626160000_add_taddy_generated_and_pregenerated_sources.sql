-- Migration: Extend allowed transcript sources to include Taddy variants
-- Created: 2025-06-26 16:00:00 UTC
-- Context: Implements tasks/tasks-new-taddy-pregenerated-status.md step 1
-- Adds `taddy_generated` (on-demand) and `taddy_pregenerated` (cached) provenance.

-- 1️⃣ Drop existing check constraint so we can redefine it
ALTER TABLE transcripts
DROP CONSTRAINT IF EXISTS transcripts_source_check;

-- 2️⃣ Re-create the check constraint with the expanded source list
ALTER TABLE transcripts
ADD CONSTRAINT transcripts_source_check
CHECK (source IN (
  'podcaster',
  'taddy',            -- legacy value (on-demand + pregenerated)
  'taddy_generated',  -- Business tier: on-demand generation
  'taddy_pregenerated' -- Business tier: already existed when we queried
));

-- 3️⃣ Update column comment for clarity
COMMENT ON COLUMN transcripts.source IS
  'Provenance for transcript: podcaster (RSS), taddy_generated (on-demand), taddy_pregenerated (cached), or legacy taddy'; 