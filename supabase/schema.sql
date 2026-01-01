-- ============================================================================
-- COMPLETE DATABASE SCHEMA FOR ES_LIVESCORE
-- Run this in Supabase SQL Editor to set up all tables
-- ============================================================================

-- 1. COUNTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS countries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo TEXT,
    continent TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table exists
ALTER TABLE countries ADD COLUMN IF NOT EXISTS continent TEXT;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_countries_continent ON countries(continent);

-- 2. COMPETITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS competitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    logo TEXT,
    country_id TEXT REFERENCES countries(id) ON DELETE SET NULL,
    type TEXT,
    priority INTEGER DEFAULT 999,
    primary_color TEXT,
    secondary_color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table exists
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS country_id TEXT;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 999;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_competitions_country ON competitions(country_id);
CREATE INDEX IF NOT EXISTS idx_competitions_priority ON competitions(priority);

-- 3. SEASONS TABLE (NEW)
-- ============================================================================
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    competition_id TEXT REFERENCES competitions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    year INTEGER,
    is_current BOOLEAN DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_seasons_competition ON seasons(competition_id);
CREATE INDEX IF NOT EXISTS idx_seasons_current ON seasons(is_current) WHERE is_current = TRUE;

-- 4. TEAMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    logo TEXT,
    country_id TEXT REFERENCES countries(id) ON DELETE SET NULL,
    founded INTEGER,
    venue TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table exists
ALTER TABLE teams ADD COLUMN IF NOT EXISTS country_id TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS founded INTEGER;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index
CREATE INDEX IF NOT EXISTS idx_teams_country ON teams(country_id);

-- 5. PLAYERS TABLE (NEW)
-- ============================================================================
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    position TEXT,
    nationality TEXT,
    birth_date DATE,
    photo TEXT,
    jersey_number INTEGER,
    market_value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_nationality ON players(nationality);

-- 6. MATCHES TABLE (should exist, ensure columns)
-- ============================================================================
-- This table should already exist, just ensure all columns are present
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_team_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_team_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id TEXT;

-- 7. ROW LEVEL SECURITY (Optional but recommended)
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY IF NOT EXISTS "Public read access" ON countries FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read access" ON competitions FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read access" ON seasons FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read access" ON teams FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read access" ON players FOR SELECT USING (true);

-- ============================================================================
-- VERIFICATION QUERIES (run after schema creation)
-- ============================================================================
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('countries', 'competitions', 'seasons', 'teams', 'players')
-- ORDER BY table_name, ordinal_position;
