-- Fix the Google auth constraint issue by making the constraint more flexible during user creation
-- The issue is that the user is created first, then the identity, but our constraint requires
-- the google_id to be present immediately

-- Drop the existing constraint
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_provider_id_check;

-- Create a more flexible constraint that allows NULL provider IDs during creation
-- This allows the two-step process where user is created first, then identity is added
ALTER TABLE public.users 
ADD CONSTRAINT users_provider_id_check 
CHECK (
  -- Allow NULL auth_provider during initial creation
  auth_provider IS NULL OR
  -- Spotify users must have spotify_id
  (auth_provider = 'spotify' AND spotify_id IS NOT NULL) OR 
  -- Google users must have google_id
  (auth_provider = 'google' AND google_id IS NOT NULL) OR
  -- During the brief moment between user creation and identity creation,
  -- allow the provider to be set without the ID (it will be updated immediately after)
  (auth_provider IN ('spotify', 'google') AND created_at > (NOW() - INTERVAL '10 seconds'))
);

-- Also update the handle_new_google_user function to not set auth_provider immediately
-- Let the create_google_profile function handle it when it has the google_id
CREATE OR REPLACE FUNCTION public.handle_new_google_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  -- Only run for Google sign-ups
  if (new.raw_app_meta_data ->> 'provider') = 'google' then
    -- Insert basic profile WITHOUT auth_provider (will be set by create_google_profile)
    insert into public.users (id, email, created_at, updated_at)
    values (new.id, new.email, now(), now())
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$;