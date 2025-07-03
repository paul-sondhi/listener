-- Create newsletter_edition_episodes join table
-- This table tracks which episodes were included in each newsletter edition
-- for traceability and analytics purposes

CREATE TABLE IF NOT EXISTS newsletter_edition_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    newsletter_edition_id UUID NOT NULL REFERENCES newsletter_editions(id) ON DELETE CASCADE,
    episode_id UUID NOT NULL REFERENCES episode_transcript_notes(episode_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique composite index to prevent duplicate episode entries per newsletter
-- This ensures data integrity and prevents accidental duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_edition_episodes_unique 
ON newsletter_edition_episodes (newsletter_edition_id, episode_id);

-- Create index on newsletter_edition_id for efficient lookups
-- This optimizes queries to find all episodes in a specific newsletter
CREATE INDEX IF NOT EXISTS idx_newsletter_edition_episodes_newsletter_id 
ON newsletter_edition_episodes (newsletter_edition_id);

-- Create index on episode_id for efficient lookups
-- This optimizes queries to find all newsletters that included a specific episode
CREATE INDEX IF NOT EXISTS idx_newsletter_edition_episodes_episode_id 
ON newsletter_edition_episodes (episode_id);

-- Add comment to document the table's purpose
COMMENT ON TABLE newsletter_edition_episodes IS 'Join table tracking which episodes were included in each newsletter edition for traceability'; 