-- Rename column rss_url -> spotify_url on podcast_shows
-- Created 2025-06-17 22:15 UTC to align schema with codebase

alter table if exists podcast_shows
    rename column rss_url to spotify_url;

-- Rename the auto-generated unique index for clarity
alter index if exists podcast_shows_rss_url_key
    rename to podcast_shows_spotify_url_key; 