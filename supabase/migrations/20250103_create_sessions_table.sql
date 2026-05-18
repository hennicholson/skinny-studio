-- Create sessions table for storing user creative sessions
-- Run this in your Supabase dashboard SQL Editor

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whop_user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'planning',
  brief_context JSONB,
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_sessions_whop_user ON sessions(whop_user_id);

-- Comment for documentation
COMMENT ON TABLE sessions IS 'Stores user creative sessions for guided workflows (product shoots, music releases, etc.)';
