-- Migration: Add source column and processing status to transcripts table
-- Created: 2025-06-22 12:56:57 UTC
-- Purpose: Support Business tier transcript retrieval with provenance tracking

-- ► Add source column to track transcript origin (podcaster vs Taddy)
ALTER TABLE transcripts 
ADD COLUMN source text NULL;

-- ► Add check constraint for source values
ALTER TABLE transcripts 
ADD CONSTRAINT transcripts_source_check 
CHECK (source IN ('podcaster', 'taddy'));

-- ► Extend existing status constraint to include 'processing'
-- First drop the existing constraint
ALTER TABLE transcripts 
DROP CONSTRAINT transcripts_status_check;

-- Add new constraint with processing status
ALTER TABLE transcripts 
ADD CONSTRAINT transcripts_status_check 
CHECK (status IN ('pending', 'available', 'error', 'processing'));

-- ► Remove NOT NULL constraint from storage_path to allow NULL when processing
ALTER TABLE transcripts 
ALTER COLUMN storage_path DROP NOT NULL;

-- ► Add conditional constraint for storage_path
-- storage_path can only be NULL when status = 'processing'
ALTER TABLE transcripts 
ADD CONSTRAINT transcripts_storage_path_conditional_check 
CHECK (status = 'processing' OR storage_path IS NOT NULL);

-- ► Comments for future reference
COMMENT ON COLUMN transcripts.source IS 'Origin of transcript: podcaster (from RSS feed) or taddy (auto-generated)';
COMMENT ON CONSTRAINT transcripts_storage_path_conditional_check ON transcripts IS 'storage_path may only be NULL when status is processing'; 