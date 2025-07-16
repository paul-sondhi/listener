-- Add created_at column to podcast_shows table
ALTER TABLE podcast_shows 
ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;