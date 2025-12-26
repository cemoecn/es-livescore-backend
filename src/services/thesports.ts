/**
 * TheSports.com API Service
 * Centralized HTTP client for all API calls
 */

import type {
    Competition,
    GetMatchesParams,
    GetStandingsParams,
    Lineup,
    Match,
    MatchStats,
    StandingsTable
} from '@/types/thesports';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

/**
 * Base fetch wrapper with authentication
 */
async function apiFetch<T>(
    endpoint: string,
    params: Record<string, string | number | undefined> = {}
): Promise<T> {
    const url = new URL(`${API_URL}${endpoint}`);

    // Add auth params
    url.searchParams.set('user', USERNAME);
    url.searchParams.set('secret', API_KEY);

    // Add other params
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        // Cache configuration
        next: {
            revalidate: 30, // Revalidate every 30 seconds for live data
        },
    });

    if (!response.ok) {
        throw new Error(`TheSports API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Handle error response format: {"err": "message"}
    if (data.err) {
        throw new Error(`TheSports API Error: ${data.err}`);
    }

    // Handle standard response format: {"code": 0, "message": "...", "data": ...}
    if (data.code !== undefined && data.code !== 0) {
        throw new Error(`TheSports API Error: ${data.message || 'Unknown error'}`);
    }

    return data.data ?? data;
}

// ============ Match Endpoints ============

/**
 * Get matches for a specific date or live matches
 */
export async function getMatches(params: GetMatchesParams = {}): Promise<Match[]> {
    // TheSports uses different endpoints for different statuses
    if (params.status === 'live') {
        return apiFetch<Match[]>('/v1/football/match/recent');
    }

    return apiFetch<Match[]>('/v1/football/match/diary', {
        date: params.date,
        competition_id: params.competition_id,
        limit: params.limit,
        offset: params.offset,
    });
}

/**
 * Get live matches only
 */
export async function getLiveMatches(): Promise<Match[]> {
    return apiFetch<Match[]>('/v1/football/match/recent');
}

/**
 * Get match details by ID
 */
export async function getMatchById(matchId: string): Promise<Match> {
    return apiFetch<Match>('/v1/football/match/detail', { id: matchId });
}

/**
 * Get match statistics
 */
export async function getMatchStats(matchId: string): Promise<MatchStats> {
    return apiFetch<MatchStats>('/v1/football/match/stats', { id: matchId });
}

/**
 * Get match lineup
 */
export async function getMatchLineup(matchId: string): Promise<Lineup> {
    return apiFetch<Lineup>('/v1/football/match/lineup', { id: matchId });
}

// ============ Competition Endpoints ============

/**
 * Get all competitions/leagues
 */
export async function getCompetitions(): Promise<Competition[]> {
    return apiFetch<Competition[]>('/v1/football/competition/list');
}

/**
 * Get competition details
 */
export async function getCompetitionById(competitionId: string): Promise<Competition> {
    return apiFetch<Competition>('/v1/football/competition/detail', { id: competitionId });
}

// ============ Standings Endpoints ============

/**
 * Get league standings
 */
export async function getStandings(params: GetStandingsParams): Promise<StandingsTable> {
    return apiFetch<StandingsTable>('/v1/football/standing', {
        competition_id: params.competition_id,
        season_id: params.season_id,
        round: params.round,
    });
}

// ============ Export API Object ============

export const TheSportsAPI = {
    // Matches
    getMatches,
    getLiveMatches,
    getMatchById,
    getMatchStats,
    getMatchLineup,

    // Competitions
    getCompetitions,
    getCompetitionById,

    // Standings
    getStandings,
};

export default TheSportsAPI;
