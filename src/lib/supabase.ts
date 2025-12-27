/**
 * Supabase Client for Backend
 * Uses service_role key for full database access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Create client only if credentials are available
// This prevents build errors when env vars aren't set
let supabase: SupabaseClient;

if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
} else {
    console.warn('Supabase credentials not configured. Using dummy client.');
    // Create a dummy client for build time - actual calls will fail gracefully
    supabase = createClient(
        'https://placeholder.supabase.co',
        'placeholder-key',
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );
}

export { supabase };

// Database types
export interface DbCountry {
    id: string;
    name: string;
    logo: string | null;
    updated_at: string;
}

export interface DbCompetition {
    id: string;
    name: string;
    short_name: string | null;
    logo: string | null;
    country_id: string | null;
    type: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    updated_at: string;
}

export interface DbTeam {
    id: string;
    name: string;
    short_name: string | null;
    logo: string | null;
    country_id: string | null;
    updated_at: string;
}

export interface DbMatch {
    id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    competition_id: string | null;
    status: string;
    minute: number | null;
    home_score: number;
    away_score: number;
    start_time: string;
    venue: string | null;
    referee: string | null;
    environment: Record<string, unknown> | null;
    updated_at: string;
}

export interface DbMatchEvent {
    id: number;
    match_id: string;
    type: number;
    time: number | null;
    position: number | null;
    player_id: string | null;
    player_name: string | null;
    player2_id: string | null;
    player2_name: string | null;
    in_player_id: string | null;
    in_player_name: string | null;
    out_player_id: string | null;
    out_player_name: string | null;
    home_score: number | null;
    away_score: number | null;
    created_at: string;
}

export interface DbStanding {
    id: number;
    competition_id: string | null;
    season_id: string | null;
    team_id: string | null;
    position: number | null;
    played: number | null;
    won: number | null;
    drawn: number | null;
    lost: number | null;
    goals_for: number | null;
    goals_against: number | null;
    goal_difference: number | null;
    points: number | null;
    form: string | null;
    updated_at: string;
}

export default supabase;
