/**
 * Match Enrichment Service
 * Enriches raw match data with full team and competition details
 */

import {
    CacheService,
    CachedCompetition,
    CachedCountry,
    CachedTeam,
} from './cache';

// Enriched team type (what the frontend expects)
export interface EnrichedTeam {
    id: string;
    name: string;
    shortName: string;
    logo: string;
    country: string;
    countryLogo?: string;
}

// Enriched competition type
export interface EnrichedCompetition {
    id: string;
    name: string;
    shortName: string;
    logo: string;
    country: string;
    countryFlag?: string;
    type: 'league' | 'cup' | 'friendly';
    primaryColor?: string;
    secondaryColor?: string;
}

// Enriched match type (what the frontend expects)
export interface EnrichedMatch {
    id: string;
    homeTeam: EnrichedTeam;
    awayTeam: EnrichedTeam;
    score: { home: number; away: number } | null;
    status: 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'cancelled';
    minute: number | null;
    startTime: string;
    competition: EnrichedCompetition;
    venue: string;
    referee: string | null;
    environment?: {
        weather: number;
        temperature: string;
        humidity: string;
    };
}

// Raw match from TheSports API
export interface RawMatch {
    id: string;
    season_id: string;
    competition_id: string;
    home_team_id: string;
    away_team_id: string;
    status_id: number;
    match_time: number;
    venue_id: string;
    referee_id: string;
    home_scores: number[];
    away_scores: number[];
    home_position: string;
    away_position: string;
    environment?: {
        weather: number;
        temperature: string;
        humidity: string;
    };
}

// Status ID mapping
const STATUS_MAP: Record<number, EnrichedMatch['status']> = {
    0: 'scheduled',
    1: 'scheduled',
    2: 'live',       // First half
    3: 'halftime',
    4: 'live',       // Second half
    5: 'live',       // Overtime
    6: 'live',       // Overtime half-time
    7: 'live',       // Penalty shootout
    8: 'finished',
    9: 'scheduled',  // Delay
    10: 'cancelled',
    11: 'cancelled',
    12: 'cancelled',
    13: 'postponed',
    14: 'postponed',
};

/**
 * Calculate approximate match minute
 * Note: This is only used for API fallback when Supabase has no data
 * The primary path uses minute value directly from Supabase (set by WebSocket service)
 */
function calculateMinute(statusId: number, matchTime: number): number | null {
    if (statusId >= 2 && statusId <= 7) {
        const now = Math.floor(Date.now() / 1000);
        const elapsedSeconds = now - matchTime;
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);

        if (statusId === 3) return null; // Half-time - no minute
        if (statusId === 2) return Math.max(1, elapsedMinutes); // First half
        // For second half - matchTime should be second half kickoff, so just add 45
        if (statusId === 4) return Math.max(46, elapsedMinutes + 45);
        if (statusId >= 5) return elapsedMinutes + 90; // Overtime

        return Math.max(0, elapsedMinutes);
    }

    if (statusId === 8) return null; // Finished - no minute

    return null;
}

/**
 * Transform cached team to enriched team
 */
function enrichTeam(team: CachedTeam | undefined, teamId: string, country?: CachedCountry): EnrichedTeam {
    if (!team) {
        return {
            id: teamId,
            name: `Team ${teamId.substring(0, 8)}`,
            shortName: teamId.substring(0, 3).toUpperCase(),
            logo: '',
            country: '',
        };
    }

    return {
        id: team.id,
        name: team.name,
        shortName: team.short_name || team.name.substring(0, 3).toUpperCase(),
        logo: team.logo,
        country: country?.name || '',
        countryLogo: country?.logo,
    };
}

/**
 * Transform cached competition to enriched competition
 */
function enrichCompetition(comp: CachedCompetition | undefined, compId: string, country?: CachedCountry): EnrichedCompetition {
    if (!comp) {
        return {
            id: compId,
            name: `Competition ${compId.substring(0, 8)}`,
            shortName: compId.substring(0, 3).toUpperCase(),
            logo: '',
            country: '',
            type: 'league',
        };
    }

    let type: 'league' | 'cup' | 'friendly' = 'league';
    if (comp.type === 2) type = 'cup';
    if (comp.type === 3) type = 'friendly';

    return {
        id: comp.id,
        name: comp.name,
        shortName: comp.short_name || comp.name.substring(0, 3).toUpperCase(),
        logo: comp.logo,
        country: country?.name || '',
        countryFlag: country?.logo,
        type,
        primaryColor: comp.primary_color,
        secondaryColor: comp.secondary_color,
    };
}

/**
 * Enrich a single match with full team and competition details
 */
export function enrichMatch(rawMatch: RawMatch): EnrichedMatch {
    // Get cached data
    const homeTeam = CacheService.getTeamById(rawMatch.home_team_id);
    const awayTeam = CacheService.getTeamById(rawMatch.away_team_id);
    const competition = CacheService.getCompetitionById(rawMatch.competition_id);

    // Get countries
    const homeCountry = homeTeam ? CacheService.getCountryById(homeTeam.country_id) : undefined;
    const awayCountry = awayTeam ? CacheService.getCountryById(awayTeam.country_id) : undefined;
    const compCountry = competition ? CacheService.getCountryById(competition.country_id) : undefined;

    // Calculate status and minute
    const status = STATUS_MAP[rawMatch.status_id] || 'scheduled';
    const minute = calculateMinute(rawMatch.status_id, rawMatch.match_time);

    // Extract scores
    const hasScore = status === 'live' || status === 'halftime' || status === 'finished';
    const score = hasScore && rawMatch.home_scores && rawMatch.away_scores
        ? { home: rawMatch.home_scores[0] || 0, away: rawMatch.away_scores[0] || 0 }
        : null;

    return {
        id: rawMatch.id,
        homeTeam: enrichTeam(homeTeam, rawMatch.home_team_id, homeCountry),
        awayTeam: enrichTeam(awayTeam, rawMatch.away_team_id, awayCountry),
        score,
        status,
        minute,
        startTime: new Date(rawMatch.match_time * 1000).toISOString(),
        competition: enrichCompetition(competition, rawMatch.competition_id, compCountry),
        venue: '',
        referee: null,
        environment: rawMatch.environment,
    };
}

/**
 * Enrich multiple matches
 */
export async function enrichMatches(rawMatches: RawMatch[]): Promise<EnrichedMatch[]> {
    // Ensure caches are loaded before enriching
    await CacheService.ensureCachesLoaded();

    return rawMatches.map(enrichMatch);
}

export const EnrichmentService = {
    enrichMatch,
    enrichMatches,
};

export default EnrichmentService;
