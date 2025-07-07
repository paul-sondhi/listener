-- Migration: Replace sent boolean with sent_at TIMESTAMPTZ NULL in newsletter_editions
-- Created: 2025-07-07T02:02:24Z (UTC)

-- =========================
-- UP Migration
-- =========================
ALTER TABLE newsletter_editions
    DROP COLUMN IF EXISTS sent;

ALTER TABLE newsletter_editions
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL;

-- =========================
-- DOWN Migration (for reference only, not executed)
-- =========================
-- To roll back manually, run:
-- ALTER TABLE newsletter_editions
--     DROP COLUMN IF EXISTS sent_at;
-- ALTER TABLE newsletter_editions
--     ADD COLUMN IF NOT EXISTS sent BOOLEAN NOT NULL DEFAULT FALSE; 