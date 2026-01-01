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
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'continent') THEN
        ALTER TABLE countries ADD COLUMN continent TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'updated_at') THEN
        ALTER TABLE countries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_countries_continent ON countries(continent);

-- 2. COMPETITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS competitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    logo TEXT,
    country_id TEXT,
    type TEXT,
    priority INTEGER DEFAULT 999,
    primary_color TEXT,
    secondary_color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'country_id') THEN
        ALTER TABLE competitions ADD COLUMN country_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'priority') THEN
        ALTER TABLE competitions ADD COLUMN priority INTEGER DEFAULT 999;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'primary_color') THEN
        ALTER TABLE competitions ADD COLUMN primary_color TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'secondary_color') THEN
        ALTER TABLE competitions ADD COLUMN secondary_color TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'updated_at') THEN
        ALTER TABLE competitions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_competitions_country ON competitions(country_id);
CREATE INDEX IF NOT EXISTS idx_competitions_priority ON competitions(priority);

-- 3. SEASONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    competition_id TEXT,
    name TEXT NOT NULL,
    year INTEGER,
    is_current BOOLEAN DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_competition ON seasons(competition_id);

-- 4. TEAMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    logo TEXT,
    country_id TEXT,
    founded INTEGER,
    venue TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'country_id') THEN
        ALTER TABLE teams ADD COLUMN country_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'founded') THEN
        ALTER TABLE teams ADD COLUMN founded INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'venue') THEN
        ALTER TABLE teams ADD COLUMN venue TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'updated_at') THEN
        ALTER TABLE teams ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teams_country ON teams(country_id);

-- 5. PLAYERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    team_id TEXT,
    position TEXT,
    nationality TEXT,
    birth_date DATE,
    photo TEXT,
    jersey_number INTEGER,
    market_value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);

-- 6. MATCHES TABLE (ensure columns exist)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'season_id') THEN
        ALTER TABLE matches ADD COLUMN season_id TEXT;
    END IF;
END $$;

-- ============================================================================
-- DONE! Run this verification query to confirm:
-- ============================================================================
SELECT table_name, COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name IN ('countries', 'competitions', 'seasons', 'teams', 'players')
GROUP BY table_name
ORDER BY table_name;
