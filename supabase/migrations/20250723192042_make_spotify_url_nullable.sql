-- Make spotify_url nullable in podcast_shows table
-- This allows OPML-imported shows that don't have Spotify URLs

-- Drop the NOT NULL constraint on spotify_url
ALTER TABLE podcast_shows
ALTER COLUMN spotify_url DROP NOT NULL;

-- Comment on the column to reflect the change
COMMENT ON COLUMN podcast_shows.spotify_url IS 'Spotify URL for the show (nullable for non-Spotify sources like OPML imports)';