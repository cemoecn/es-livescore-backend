-- Migration: Add match_stats table for storing team statistics
-- Run this in Supabase SQL Editor

-- Create match_stats table
CREATE TABLE IF NOT EXISTS match_stats (
    id SERIAL PRIMARY KEY,
    match_id TEXT NOT NULL,
    stat_type INTEGER NOT NULL,
    home_value INTEGER NOT NULL DEFAULT 0,
    away_value INTEGER NOT NULL DEFAULT 0,
    period TEXT DEFAULT 'full', -- 'full', 'first', 'second'
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, stat_type, period)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_match_stats_match_id ON match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_updated_at ON match_stats(updated_at);

-- Enable Row Level Security
ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read match_stats" 
ON match_stats FOR SELECT 
USING (true);

-- Allow service role to write
CREATE POLICY "Allow service write match_stats" 
ON match_stats FOR ALL 
USING (auth.role() = 'service_role');

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE match_stats;
