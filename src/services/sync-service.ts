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
            const rawMinute = scoreData?.[4];

            // Parse minute - can be number or string like "45+2"
            let parsedMinute: number | null = null;
            if (typeof rawMinute === 'number') {
                parsedMinute = rawMinute;
            } else if (typeof rawMinute === 'string') {
                const minuteStr = rawMinute as string;
                if (minuteStr.includes('+')) {
                    const parts = minuteStr.split('+');
                    parsedMinute = parseInt(parts[0], 10) + parseInt(parts[1], 10);
                } else {
                    parsedMinute = parseInt(minuteStr, 10);
                }
                if (isNaN(parsedMinute)) parsedMinute = null;
            }

            // CRITICAL: Adjust minute based on match status
            // According to TheSports docs, minute resets for each half!
            let minute: number | null = null;
            if (parsedMinute !== null) {
                if (statusId === 5 || statusId === 6) {
                    // Second half - add 45 to get actual match minute
                    minute = parsedMinute + 45;
                } else if (statusId === 7) {
                    // Extra time - add 90
                    minute = parsedMinute + 90;
                } else {
                    // First half (1,2) or other - use as is
                    minute = parsedMinute;
                }
            }

            // All matches from detail_live are live/ongoing
            // Status 1-7 are various live states, 8 is finished
            const status = statusId === 4 ? 'halftime' :
                statusId === 8 ? 'finished' :
                    statusId >= 1 && statusId <= 7 ? 'live' : 'scheduled';

            console.log(`Match ${match.id}: status=${status}, statusId=${statusId}, rawMinute=${rawMinute}, adjustedMinute=${minute}`);

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
 * Sync daily matches, teams, and competitions to Supabase
 * This is the main sync function that should run daily
 * It creates matches with proper team_ids so WebSocket can UPDATE them
 */
export async function syncDailyMatches(date: string): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log(`[Sync] Starting daily sync for date: ${date}`);

    // 1. First sync teams and competitions (reference data)
    console.log('[Sync] Syncing teams and competitions...');

    const allTeams: Array<{ id: string; name: string; short_name?: string; logo?: string; country_id?: string }> = [];
    const allComps: Array<{ id: string; name: string; short_name?: string; logo?: string; country_id?: string; primary_color?: string; secondary_color?: string }> = [];

    // Fetch teams
    for (let page = 1; page <= 100; page++) {
        const url = `${API_URL}/v1/football/team/additional/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        try {
            const response = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
            if (!response.ok) break;
            const data = await response.json();
            if (data.err) break;
            const teams = data.results || data.data?.results || [];
            if (teams.length === 0) break;
            allTeams.push(...teams);
            if (teams.length < 1000) break;
        } catch {
            break;
        }
    }

    // Fetch competitions  
    for (let page = 1; page <= 10; page++) {
        const url = `${API_URL}/v1/football/competition/additional/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        try {
            const response = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
            if (!response.ok) break;
            const data = await response.json();
            if (data.err) break;
            const comps = data.results || data.data?.results || [];
            if (comps.length === 0) break;
            allComps.push(...comps);
            if (comps.length < 1000) break;
        } catch {
            break;
        }
    }

    console.log(`[Sync] Loaded ${allTeams.length} teams and ${allComps.length} competitions from API`);

    // Write teams to Supabase in batches
    if (allTeams.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < allTeams.length; i += batchSize) {
            const batch = allTeams.slice(i, i + batchSize).map(t => ({
                id: t.id,
                name: t.name,
                short_name: t.short_name || null,
                logo: t.logo || null,
                country_id: t.country_id || null,
                updated_at: new Date().toISOString(),
            }));

            const { error } = await supabase.from('teams').upsert(batch, { onConflict: 'id' });
            if (error) {
                console.error(`[Sync] Teams batch error:`, error.message);
                errors += batch.length;
            } else {
                synced += batch.length;
            }
        }
        console.log(`[Sync] Synced ${allTeams.length} teams`);
    }

    // Write competitions to Supabase
    if (allComps.length > 0) {
        const compData = allComps.map(c => ({
            id: c.id,
            name: c.name,
            short_name: c.short_name || null,
            logo: c.logo || null,
            country_id: c.country_id || null,
            primary_color: c.primary_color || null,
            secondary_color: c.secondary_color || null,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('competitions').upsert(compData, { onConflict: 'id' });
        if (error) {
            console.error('[Sync] Competitions error:', error.message);
            errors += compData.length;
        } else {
            synced += compData.length;
            console.log(`[Sync] Synced ${compData.length} competitions`);
        }
    }

    // 2. Now sync MATCHES for the day WITH team_ids
    console.log(`[Sync] Syncing matches for ${date}...`);
    const apiDate = date.replace(/-/g, '');

    const matchesResponse = await fetchFromApi<Array<ApiMatch>>('/v1/football/match/diary', { date: apiDate });

    if (matchesResponse && Array.isArray(matchesResponse)) {
        console.log(`[Sync] Found ${matchesResponse.length} matches for ${date}`);

        // Get all existing match IDs to check which need INSERT vs UPDATE
        const matchIds = matchesResponse.map(m => m.id);
        const { data: existingMatches } = await supabase
            .from('matches')
            .select('id')
            .in('id', matchIds);

        const existingIds = new Set((existingMatches || []).map(m => m.id));

        for (const match of matchesResponse) {
            try {
                const statusId = match.status_id ?? 0;
                const status = STATUS_MAP[statusId] || 'scheduled';

                if (existingIds.has(match.id)) {
                    // Match exists - ONLY update team_ids and start_time
                    // DO NOT touch status, minute, score (WebSocket handles those)
                    const { error } = await supabase
                        .from('matches')
                        .update({
                            home_team_id: match.home_team_id || null,
                            away_team_id: match.away_team_id || null,
                            competition_id: match.competition_id || null,
                            start_time: match.match_time ? new Date(match.match_time * 1000).toISOString() : undefined,
                        })
                        .eq('id', match.id);

                    if (error) {
                        errors++;
                    } else {
                        synced++;
                    }
                } else {
                    // New match - INSERT with all data
                    const { error } = await supabase
                        .from('matches')
                        .insert({
                            id: match.id,
                            home_team_id: match.home_team_id || null,
                            away_team_id: match.away_team_id || null,
                            competition_id: match.competition_id || null,
                            status: status,
                            minute: null,
                            home_score: match.home_scores?.[0] || 0,
                            away_score: match.away_scores?.[0] || 0,
                            start_time: match.match_time ? new Date(match.match_time * 1000).toISOString() : new Date().toISOString(),
                            venue: null,
                            referee: null,
                            environment: null,
                            updated_at: new Date().toISOString(),
                        });

                    if (error) {
                        errors++;
                    } else {
                        synced++;
                    }
                }
            } catch (err) {
                console.error(`[Sync] Match ${match.id} exception:`, err);
                errors++;
            }
        }
        console.log(`[Sync] Synced ${matchesResponse.length} matches for ${date}`);
    } else {
        console.log(`[Sync] No matches found for ${date}`);
    }

    console.log(`[Sync] Daily sync completed: synced=${synced}, errors=${errors}`);
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
