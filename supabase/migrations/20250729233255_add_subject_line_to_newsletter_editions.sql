-- Migration: Add subject_line column to newsletter_editions table
-- Created: 2025-07-29T23:32:55Z (UTC)
-- Purpose: Store personalized subject lines for newsletter editions

-- =========================
-- UP Migration
-- =========================

-- Add subject_line column to newsletter_editions table
-- This column stores the AI-generated personalized subject line for each newsletter
-- It's nullable to support fallback behavior when subject generation fails
ALTER TABLE newsletter_editions
    ADD COLUMN IF NOT EXISTS subject_line TEXT NULL;

-- Add index on subject_line for potential future searching/filtering
CREATE INDEX IF NOT EXISTS idx_newsletter_editions_subject_line 
ON newsletter_editions (subject_line) 
WHERE deleted_at IS NULL AND subject_line IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN newsletter_editions.subject_line IS 'AI-generated personalized subject line for the newsletter edition (max 10 words)';

-- =========================
-- DOWN Migration (for reference only, not executed)
-- =========================
-- To roll back manually, run:
-- DROP INDEX IF EXISTS idx_newsletter_editions_subject_line;
-- ALTER TABLE newsletter_editions DROP COLUMN IF EXISTS subject_line;