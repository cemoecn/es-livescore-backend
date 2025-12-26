/**
 * TheSports.com API Type Definitions
 * Based on TheSports Football API Documentation
 */

// ============ Common Types ============

export interface TheSportsResponse<T> {
    code: number;
    message: string;
    data: T;
}

// ============ Team Types ============

export interface Team {
    id: string;
    name: string;
    short_name: string;
    logo: string;
    country_id: string;
    country_name: string;
}

// ============ Competition/League Types ============

export interface Competition {
    id: string;
    name: string;
    short_name: string;
    logo: string;
    country_id: string;
    country_name: string;
    country_logo: string;
    type: 'league' | 'cup' | 'international';
    current_season_id?: string;
    current_round?: number;
    total_rounds?: number;
}

export interface Season {
    id: string;
    competition_id: string;
    year: string;
    is_current: boolean;
    start_date: string;
    end_date: string;
}

// ============ Match Types ============

export type MatchStatus =
    | 'not_started'
    | 'first_half'
    | 'halftime'
    | 'second_half'
    | 'extra_time'
    | 'penalties'
    | 'finished'
    | 'postponed'
    | 'cancelled'
    | 'suspended'
    | 'awarded'
    | 'interrupted';

export interface Match {
    id: string;
    competition_id: string;
    competition: Competition;
    season_id: string;
    round: number;

    // Teams
    home_team_id: string;
    home_team: Team;
    away_team_id: string;
    away_team: Team;

    // Scores
    home_score: number | null;
    away_score: number | null;
    home_score_ht: number | null;  // Half-time
    away_score_ht: number | null;
    home_score_ft: number | null;  // Full-time
    away_score_ft: number | null;
    home_score_et: number | null;  // Extra-time
    away_score_et: number | null;
    home_score_pen: number | null; // Penalties
    away_score_pen: number | null;

    // Time
    start_time: string;  // ISO 8601 timestamp
    status: MatchStatus;
    minute: number | null;
    added_time: number | null;

    // Stats
    home_corners: number | null;
    away_corners: number | null;
    home_yellow_cards: number | null;
    away_yellow_cards: number | null;
    home_red_cards: number | null;
    away_red_cards: number | null;

    // Venue
    venue_id?: string;
    venue_name?: string;
}

// ============ Live Event Types ============

export type LiveEventType =
    | 'goal'
    | 'own_goal'
    | 'penalty_goal'
    | 'penalty_missed'
    | 'yellow_card'
    | 'red_card'
    | 'second_yellow'
    | 'substitution'
    | 'var_decision'
    | 'period_start'
    | 'period_end';

export interface LiveEvent {
    id: string;
    match_id: string;
    type: LiveEventType;
    minute: number;
    added_time?: number;
    team_id: string;
    player_id?: string;
    player_name?: string;
    assist_player_id?: string;
    assist_player_name?: string;
    description?: string;
    home_score?: number;
    away_score?: number;
}

// ============ Standing Types ============

export interface Standing {
    position: number;
    team_id: string;
    team: Team;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    goal_difference: number;
    points: number;
    form: string[];  // Last 5 results: W/D/L
    zone?: 'champions_league' | 'europa_league' | 'conference_league' | 'relegation' | 'promotion';
}

export interface StandingsTable {
    competition_id: string;
    season_id: string;
    round: number;
    standings: Standing[];
}

// ============ Stats Types ============

export interface MatchStats {
    match_id: string;
    home_possession: number;
    away_possession: number;
    home_shots: number;
    away_shots: number;
    home_shots_on_target: number;
    away_shots_on_target: number;
    home_corners: number;
    away_corners: number;
    home_fouls: number;
    away_fouls: number;
    home_offsides: number;
    away_offsides: number;
    home_yellow_cards: number;
    away_yellow_cards: number;
    home_red_cards: number;
    away_red_cards: number;
    home_passes: number;
    away_passes: number;
    home_pass_accuracy: number;
    away_pass_accuracy: number;
}

// ============ Player Types ============

export interface Player {
    id: string;
    name: string;
    short_name: string;
    photo: string;
    position: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
    nationality: string;
    nationality_logo: string;
    birth_date: string;
    height: number;
    weight: number;
    shirt_number?: number;
    team_id?: string;
    team?: Team;
}

// ============ Lineup Types ============

export interface LineupPlayer {
    player: Player;
    position_x: number;
    position_y: number;
    is_captain: boolean;
    shirt_number: number;
}

export interface Lineup {
    match_id: string;
    home_formation: string;
    away_formation: string;
    home_starting: LineupPlayer[];
    away_starting: LineupPlayer[];
    home_substitutes: Player[];
    away_substitutes: Player[];
}

// ============ WebSocket Event Types ============

export interface WSMatchUpdate {
    type: 'score_update' | 'status_change' | 'event' | 'stats_update';
    match_id: string;
    data: Partial<Match> | LiveEvent | MatchStats;
    timestamp: string;
}

// ============ API Request Types ============

export interface GetMatchesParams {
    date?: string;        // YYYY-MM-DD
    competition_id?: string;
    status?: 'live' | 'today' | 'finished' | 'upcoming';
    limit?: number;
    offset?: number;
}

export interface GetStandingsParams {
    competition_id: string;
    season_id?: string;
    round?: number;
}
