-- Add triggers for automatic user profile creation on Spotify sign-up

-- Trigger on auth.users table to create profile when user signs up with Spotify
CREATE TRIGGER handle_new_spotify_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_spotify_user();

-- Trigger on auth.identities table to update spotify_id when identity is created
CREATE TRIGGER create_spotify_profile_trigger
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.create_spotify_profile();
