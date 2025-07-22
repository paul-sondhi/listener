-- Add support for Google authentication alongside existing Spotify auth
-- This migration adds auth provider tracking and Google-specific fields

-- Add auth_provider column to track which OAuth provider was used
-- Default to 'spotify' for all existing users to maintain backward compatibility
ALTER TABLE public.users 
ADD COLUMN auth_provider text NOT NULL DEFAULT 'spotify';

-- Add google_id column to store Google user IDs (similar to spotify_id)
ALTER TABLE public.users 
ADD COLUMN google_id text;

-- Create unique index on google_id to prevent duplicates
CREATE UNIQUE INDEX users_google_id_key ON public.users(google_id);

-- Add check constraint to ensure users have at least one provider ID
ALTER TABLE public.users 
ADD CONSTRAINT users_provider_id_check 
CHECK (
  (auth_provider = 'spotify' AND spotify_id IS NOT NULL) OR 
  (auth_provider = 'google' AND google_id IS NOT NULL)
);

-- Create function to handle new Google user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_google_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  -- Only run for Google sign-ups
  if (new.raw_app_meta_data ->> 'provider') = 'google' then
    -- Insert basic profile with Google provider
    insert into public.users (id, email, auth_provider, created_at, updated_at)
    values (new.id, new.email, 'google', now(), now())
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$;

-- Create function to update Google ID after identity is created
CREATE OR REPLACE FUNCTION public.create_google_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if new.provider = 'google' then
    insert into public.users (id, email, google_id, auth_provider, created_at, updated_at)
    values (
      new.user_id,                              -- auth.users.id
      coalesce(new.identity_data ->> 'email', ''), 
      new.id,                                   -- auth.identities.id (Google ID)
      'google',
      now(), 
      now()
    )
    on conflict (id)
    do update set
      email = excluded.email,
      google_id = excluded.google_id,
      auth_provider = excluded.auth_provider,
      updated_at = now();
  end if;
  return new;
end;
$function$;

-- Update existing Spotify profile creation function to set auth_provider
CREATE OR REPLACE FUNCTION public.create_spotify_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if new.provider = 'spotify' then
    insert into public.users (id, email, spotify_id, auth_provider, created_at, updated_at)
    values (
      new.user_id,                              -- auth.users.id
      coalesce(new.identity_data ->> 'email', ''), 
      new.id,                                   -- auth.identities.id (Spotify ID)
      'spotify',
      now(), 
      now()
    )
    on conflict (id)
    do update set
      email = excluded.email,
      spotify_id = excluded.spotify_id,
      auth_provider = excluded.auth_provider,
      updated_at = now();
  end if;
  return new;
end;
$function$;

-- Update existing Spotify user handler to set auth_provider
CREATE OR REPLACE FUNCTION public.handle_new_spotify_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  -- Run only for Spotify sign-ups
  if (new.raw_app_meta_data ->> 'provider') = 'spotify' then
    -- Insert basic profile with Spotify provider
    insert into public.users (id, email, auth_provider, created_at, updated_at)
    values (new.id, new.email, 'spotify', now(), now())
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$;

-- Create triggers for Google authentication
-- These mirror the existing Spotify triggers

-- Trigger on auth.users table to create profile when user signs up with Google
CREATE TRIGGER handle_new_google_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_google_user();

-- Trigger on auth.identities table to update google_id when identity is created
CREATE TRIGGER create_google_profile_trigger
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.create_google_profile();

-- Add comment to document the auth provider values
COMMENT ON COLUMN public.users.auth_provider IS 'OAuth provider used for authentication: spotify or google';
COMMENT ON COLUMN public.users.google_id IS 'Google user ID from OAuth (auth.identities.id for Google provider)';