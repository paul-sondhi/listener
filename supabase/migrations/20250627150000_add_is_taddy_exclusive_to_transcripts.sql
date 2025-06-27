-- Add is_taddy_exclusive column to transcripts table
-- This column indicates whether the transcript was obtained through Taddy's exclusive content
ALTER TABLE transcripts 
ADD COLUMN is_taddy_exclusive BOOLEAN;

-- Add comment to document the column purpose
COMMENT ON COLUMN transcripts.is_taddy_exclusive IS 'Indicates if the transcript was obtained through Taddy exclusive content access';
