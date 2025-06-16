-- Migration: Create podcast core tables and enable pgcrypto extension
-- Created: 2025-01-16 19:00:40 UTC
-- Purpose: Add podcast_shows and podcast_episodes tables with proper relationships

-- ► Enable pgcrypto extension (idempotent)
create extension if not exists pgcrypto;

-- ► podcast_shows: Master list of podcast shows
create table podcast_shows (
  id            uuid primary key default gen_random_uuid(),
  rss_url       text not null unique,
  title         text,
  description   text,
  image_url     text,
  etag          text,                -- enables HTTP 304 conditional requests
  last_modified timestamptz,         -- enables HTTP 304 conditional requests
  last_fetched  timestamptz,
  last_updated  timestamptz default timezone('utc', now())
);

-- ► podcast_episodes: Episodes for each show
create table podcast_episodes (
  id           uuid primary key default gen_random_uuid(),
  show_id      uuid not null
                 references podcast_shows(id)
                 on delete cascade,
  guid         text not null,        -- GUID from RSS feed
  episode_url  text not null,        -- audio enclosure URL
  title        text,
  description  text,
  pub_date     timestamptz,
  duration_sec int4,
  created_at   timestamptz default timezone('utc', now()),
  unique(show_id, guid)              -- prevent duplicate episodes per show
);

-- ► Index for fast "latest episodes for a show" queries
create index podcast_episodes_show_pub_idx
  on podcast_episodes(show_id, pub_date desc); 