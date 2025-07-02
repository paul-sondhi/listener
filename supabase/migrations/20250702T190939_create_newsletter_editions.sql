-- Create newsletter_editions table
-- This table stores generated newsletter editions for users
-- Each user can have one edition per date (enforced by unique index)

CREATE TABLE IF NOT EXISTS newsletter_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    edition_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('generated', 'error', 'no_notes_found')),
    user_email TEXT NOT NULL,
    content TEXT, -- NULL when status = 'no_notes_found' or 'error'
    model TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    sent BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create unique composite index to prevent duplicate editions per user per date
-- This ensures idempotence for the edition generator worker
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_editions_user_date 
ON newsletter_editions (user_id, edition_date) 
WHERE deleted_at IS NULL;

-- Create index on user_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_editions_user_id 
ON newsletter_editions (user_id) 
WHERE deleted_at IS NULL;

-- Create index on edition_date for date-based queries
CREATE INDEX IF NOT EXISTS idx_newsletter_editions_date 
ON newsletter_editions (edition_date) 
WHERE deleted_at IS NULL;

-- Create index on status for filtering by status
CREATE INDEX IF NOT EXISTS idx_newsletter_editions_status 
ON newsletter_editions (status) 
WHERE deleted_at IS NULL;

-- Add updated_at trigger to auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_newsletter_editions_updated_at 
    BEFORE UPDATE ON newsletter_editions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 