-- Migration: Add episode_transcript_notes table for LIS-2 (Episode Notes Epic)
-- -------------------------------------------------------------
-- This table stores LLM-generated notes for podcast episodes, including
-- token usage, model info, and error/status tracking. Uniqueness is enforced
-- per episode (excluding soft-deleted rows).

CREATE TABLE episode_transcript_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id uuid NOT NULL REFERENCES podcast_episodes(id),
    transcript_id uuid NOT NULL REFERENCES transcripts(id),
    notes text,
    model text,
    input_tokens integer CHECK (input_tokens >= 0),
    output_tokens integer CHECK (output_tokens >= 0),
    status text, -- free-form status (e.g., 'pending', 'completed', 'failed')
    error_message text, -- error details if status = 'failed'
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

-- Enforce uniqueness of episode_id for non-deleted notes only
CREATE UNIQUE INDEX episode_transcript_notes_episode_id_unique_not_deleted
    ON episode_transcript_notes(episode_id)
    WHERE deleted_at IS NULL;

-- Add comments for future maintainers
COMMENT ON TABLE episode_transcript_notes IS 'Stores LLM-generated notes for podcast episodes, including model, token usage, and error/status tracking.';
COMMENT ON COLUMN episode_transcript_notes.episode_id IS 'FK to podcast_episodes.id; one note per episode (enforced for non-deleted rows)';
COMMENT ON COLUMN episode_transcript_notes.transcript_id IS 'FK to transcripts.id; links notes to the transcript used as input';
COMMENT ON COLUMN episode_transcript_notes.model IS 'LLM model/version used to generate notes (e.g., gemini-1.5-flash)';
COMMENT ON COLUMN episode_transcript_notes.input_tokens IS 'Number of input tokens sent to the LLM';
COMMENT ON COLUMN episode_transcript_notes.output_tokens IS 'Number of output tokens generated by the LLM';
COMMENT ON COLUMN episode_transcript_notes.status IS 'Processing status (free-form text, e.g., pending, completed, failed)';
COMMENT ON COLUMN episode_transcript_notes.error_message IS 'Error details if note generation failed';
COMMENT ON COLUMN episode_transcript_notes.deleted_at IS 'Soft delete timestamp; NULL means active row.'; 