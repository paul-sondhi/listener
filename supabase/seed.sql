-- Supabase Local Development Seed Data
-- This file populates the local database with test data for development

-- Note: This seed data is only for local development
-- Production data should never be seeded from this file

-- Insert test users (these will be linked to auth.users via triggers)
-- Note: In real usage, users are created through Supabase Auth
-- This is just for testing database relationships

-- Example podcast subscriptions for development testing
-- Note: These reference test user IDs that would exist in auth.users
-- In practice, users sign up through your app's auth flow

-- Test data for podcast shows and subscriptions (new schema)
-- Currently empty since users are created through Supabase Auth
-- Uncomment and modify the lines below to add test data after setting up test auth users

-- Example with new schema (podcast_shows + user_podcast_subscriptions):
-- INSERT INTO public.podcast_shows (rss_url, title, description) VALUES
--   ('https://example-podcast-feed.xml', 'Example Podcast', 'A test podcast')
-- ON CONFLICT (rss_url) DO NOTHING;
-- 
-- INSERT INTO public.user_podcast_subscriptions (user_id, show_id, status) VALUES
--   ('example-user-uuid-1', (SELECT id FROM podcast_shows WHERE rss_url = 'https://example-podcast-feed.xml'), 'active')
-- ON CONFLICT (user_id, show_id) DO NOTHING;

-- You can add more seed data here as your schema grows
-- Example: test episodes, user preferences, etc. 