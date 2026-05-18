-- Add messages column to sessions table for persisting chat history
-- Run this in your Supabase dashboard SQL Editor

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN sessions.messages IS 'Array of chat messages for this session, each with id, role, content, and optional generation data';
