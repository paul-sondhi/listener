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

-- Test data for podcast subscriptions
-- Replace with actual test podcast URLs and user UUIDs from your auth.users table
INSERT INTO public.podcast_subscriptions (user_id, podcast_url, status) VALUES
  -- Example entries - replace user_id with actual auth.users UUIDs after they exist
  -- ('example-user-uuid-1', 'https://example-podcast-feed.xml', 'active'),
  -- ('example-user-uuid-2', 'https://another-podcast-feed.xml', 'active'),
  -- ('example-user-uuid-1', 'https://third-podcast-feed.xml', 'inactive')
  
  -- For now, leaving empty since users are created through Supabase Auth
  -- Add test data here after setting up test auth users
ON CONFLICT (user_id, podcast_url) DO NOTHING;

-- You can add more seed data here as your schema grows
-- Example: test episodes, user preferences, etc. 