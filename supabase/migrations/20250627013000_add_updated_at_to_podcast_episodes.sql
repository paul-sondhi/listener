-- Add updated_at column to podcast_episodes and update automatically on UPDATE

-- ① Add the column with a default value of now()
ALTER TABLE public.podcast_episodes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ② Create or replace helper function to bump updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ③ Attach trigger to podcast_episodes (fires for each UPDATE including upserts)
DROP TRIGGER IF EXISTS podcast_episodes_set_updated_at ON public.podcast_episodes;
CREATE TRIGGER podcast_episodes_set_updated_at
BEFORE UPDATE ON public.podcast_episodes
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at(); 