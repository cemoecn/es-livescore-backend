-- Migration: Denormalize matches table
-- Run this in Supabase SQL Editor

-- Add team name columns
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_team_name TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_team_name TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_team_logo TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_team_logo TEXT;

-- Add competition columns
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_name TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_logo TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_country TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
