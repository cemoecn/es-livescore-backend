/**
 * Sync Service
 * Syncs data from TheSports API to Supabase
 */

import { supabase } from '@/lib/supabase';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

interface ApiMatch {
    id: string;
    home_team_id?: string;
    away_team_id?: string;
    competition_id?: string;
    status_id?: number;
    match_time?: number;
    home_scores?: number[];
    away_scores?: number[];
    venue_id?: string;
    referee_id?: string;
    environment?: Record<string, unknown>;
    home_team?: {
        id: string;
        name: string;
        short_name?: string;
        logo?: string;
        country_id?: string;
    };
    away_team?: {
        id: string;
        name: string;
        short_name?: string;
        logo?: string;
        country_id?: string;
    };
    competition?: {
        id: string;
        name: string;
        short_name?: string;
        logo?: string;
        country_id?: string;
        primary_color?: string;
        secondary_color?: string;
    };
    incidents?: ApiIncident[];
}

interface ApiIncident {
    type: number;
    time?: number;
    position?: number;
    player_id?: string;
    player_name?: string;
    player2_id?: string;
    player2_name?: string;
    in_player_id?: string;
    in_player_name?: string;
    out_player_id?: string;
    out_player_name?: string;
    home_score?: number;
    away_score?: number;
}

// Status mapping from TheSports API
const STATUS_MAP: Record<number, string> = {
    0: 'scheduled',
    1: 'live',
    2: 'live',
    3: 'live',
    4: 'halftime',
    5: 'live',
    6: 'live',
    7: 'live',
    8: 'finished',
    9: 'finished',
    10: 'postponed',
    11: 'cancelled',
    12: 'interrupted',
    13: 'suspended',
};

async function fetchFromApi<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
    const url = new URL(`${API_URL}${endpoint}`);
    url.searchParams.set('user', USERNAME);
    url.searchParams.set('secret', API_KEY);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    try {
        const response = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error(`API Error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.err) {
            console.error(`API Error: ${data.err}`);
            return null;
        }

        return data.results || data.data || data;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

/**
 * Sync live matches from detail_live endpoint
 * The detail_live endpoint returns matches in this format:
 * { id, score: [matchId, statusId, homeScores[], awayScores[], minute, extra], stats, incidents, tlive }
 */
export async function syncLiveMatches(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    const matches = await fetchFromApi<Array<{
        id: string;
        score?: [string, number, number[], number[], number, string]; // [matchId, status, homeScores, awayScores, minute, extra]
        stats?: unknown[];
        incidents?: ApiIncident[];
        tlive?: unknown[];
    }>>('/v1/football/match/detail_live');

    if (!matches || !Array.isArray(matches)) {
        console.log('No matches from detail_live');
        return { synced: 0, errors: 1 };
    }

    console.log(`Processing ${matches.length} live matches from detail_live`);

    for (const match of matches) {
        try {
            // Parse score array: [matchId, statusId, homeScores[], awayScores[], minute, extra]
            const scoreData = match.score;
            const statusId = scoreData?.[1] ?? 1; // Default to live
            const homeScores = scoreData?.[2] ?? [0];
            const awayScores = scoreData?.[3] ?? [0];
            const minute = scoreData?.[4] ?? null;

            // All matches from detail_live are live/ongoing
            // Status 1-7 are various live states, 8 is finished
            const status = statusId === 4 ? 'halftime' :
                statusId === 8 ? 'finished' :
                    statusId >= 1 && statusId <= 7 ? 'live' : 'scheduled';

            console.log(`Match ${match.id}: status=${status}, statusId=${statusId}, score=${homeScores[0]}-${awayScores[0]}`);

            // Upsert match - all from detail_live should be live!
            const { error: matchError } = await supabase
                .from('matches')
                .upsert({
                    id: match.id,
                    home_team_id: null, // detail_live doesn't include team IDs
                    away_team_id: null,
                    competition_id: null,
                    status: status,
                    minute: minute,
                    home_score: homeScores[0] || 0,
                    away_score: awayScores[0] || 0,
                    start_time: new Date().toISOString(), // detail_live doesn't include start time
                    venue: null,
                    referee: null,
                    environment: null,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });

            if (matchError) {
                console.error('Match upsert error:', matchError);
                errors++;
                continue;
            }

            // Sync incidents if available
            if (match.incidents && Array.isArray(match.incidents) && match.incidents.length > 0) {
                // Delete old events for this match
                await supabase.from('match_events').delete().eq('match_id', match.id);

                // Insert new events
                const events = match.incidents.map((incident: ApiIncident) => ({
                    match_id: match.id,
                    type: incident.type,
                    time: incident.time,
                    position: incident.position,
                    player_id: incident.player_id,
                    player_name: incident.player_name,
                    player2_id: incident.player2_id,
                    player2_name: incident.player2_name,
                    in_player_id: incident.in_player_id,
                    in_player_name: incident.in_player_name,
                    out_player_id: incident.out_player_id,
                    out_player_name: incident.out_player_name,
                    home_score: incident.home_score,
                    away_score: incident.away_score,
                }));

                if (events.length > 0) {
                    const { error: eventsError } = await supabase
                        .from('match_events')
                        .insert(events);

                    if (eventsError) {
                        console.error('Events insert error:', eventsError);
                    }
                }
            }

            synced++;
        } catch (error) {
            console.error('Sync error for match:', match.id, error);
            errors++;
        }
    }

    return { synced, errors };
}

/**
 * Sync recent matches from recent/list endpoint
 * This endpoint includes team and competition data
 */
export async function syncDailyMatches(date: string): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Use recent/list which has team data instead of diary which may be empty
    const matches = await fetchFromApi<ApiMatch[]>('/v1/football/match/recent/list');
    if (!matches || !Array.isArray(matches)) {
        console.log('No matches from recent/list, trying date endpoint...');
        return { synced: 0, errors: 1 };
    }

    console.log(`Processing ${matches.length} matches from recent/list for team/competition data`);

    // Collect unique teams and competitions for upsert
    const teams = new Map<string, { id: string; name: string; short_name?: string; logo?: string; country_id?: string }>();
    const competitions = new Map<string, { id: string; name: string; short_name?: string; logo?: string; country_id?: string; primary_color?: string; secondary_color?: string }>();

    for (const match of matches) {
        if (match.home_team) teams.set(match.home_team.id, match.home_team);
        if (match.away_team) teams.set(match.away_team.id, match.away_team);
        if (match.competition) competitions.set(match.competition.id, match.competition);
    }

    // Upsert competitions
    if (competitions.size > 0) {
        const compData = Array.from(competitions.values()).map(c => ({
            id: c.id,
            name: c.name,
            short_name: c.short_name || null,
            logo: c.logo || null,
            country_id: c.country_id || null,
            primary_color: c.primary_color || null,
            secondary_color: c.secondary_color || null,
            updated_at: new Date().toISOString(),
        }));

        await supabase.from('competitions').upsert(compData, { onConflict: 'id' });
    }

    // Upsert teams
    if (teams.size > 0) {
        const teamData = Array.from(teams.values()).map(t => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name || null,
            logo: t.logo || null,
            country_id: t.country_id || null,
            updated_at: new Date().toISOString(),
        }));

        await supabase.from('teams').upsert(teamData, { onConflict: 'id' });
    }

    // Upsert matches
    for (const match of matches) {
        try {
            const { error } = await supabase
                .from('matches')
                .upsert({
                    id: match.id,
                    home_team_id: match.home_team_id || match.home_team?.id,
                    away_team_id: match.away_team_id || match.away_team?.id,
                    competition_id: match.competition_id || match.competition?.id,
                    status: STATUS_MAP[match.status_id || 0] || 'scheduled',
                    minute: null,
                    home_score: match.home_scores?.[0] || 0,
                    away_score: match.away_scores?.[0] || 0,
                    start_time: match.match_time ? new Date(match.match_time * 1000).toISOString() : new Date().toISOString(),
                    venue: match.venue_id || null,
                    referee: match.referee_id || null,
                    environment: match.environment || null,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });

            if (error) {
                errors++;
            } else {
                synced++;
            }
        } catch (error) {
            errors++;
        }
    }

    return { synced, errors };
}

/**
 * Sync standings from table/live endpoint
 */
export async function syncStandings(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    const tables = await fetchFromApi<Array<{ season_id: string; tables: Array<{ rows: Array<unknown> }> }>>('/v1/football/table/live');
    if (!tables || !Array.isArray(tables)) {
        return { synced: 0, errors: 1 };
    }

    for (const table of tables) {
        if (!table.tables || !Array.isArray(table.tables)) continue;

        for (const group of table.tables) {
            if (!group.rows || !Array.isArray(group.rows)) continue;

            for (const row of group.rows as Array<{
                team_id?: string;
                competition_id?: string;
                position?: number;
                played?: number;
                won?: number;
                drawn?: number;
                lost?: number;
                goals_for?: number;
                goals_against?: number;
                goal_difference?: number;
                points?: number;
                form?: string;
            }>) {
                try {
                    const { error } = await supabase
                        .from('standings')
                        .upsert({
                            competition_id: row.competition_id,
                            season_id: table.season_id,
                            team_id: row.team_id,
                            position: row.position,
                            played: row.played,
                            won: row.won,
                            drawn: row.drawn,
                            lost: row.lost,
                            goals_for: row.goals_for,
                            goals_against: row.goals_against,
                            goal_difference: row.goal_difference,
                            points: row.points,
                            form: row.form,
                            updated_at: new Date().toISOString(),
                        }, {
                            onConflict: 'competition_id,season_id,team_id',
                            ignoreDuplicates: false
                        });

                    if (error) {
                        errors++;
                    } else {
                        synced++;
                    }
                } catch {
                    errors++;
                }
            }
        }
    }

    return { synced, errors };
}

export const SyncService = {
    syncLiveMatches,
    syncDailyMatches,
    syncStandings,
};

export default SyncService;
