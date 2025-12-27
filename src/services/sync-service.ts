/**
 * Simplified Sync Service
 * Syncs matches directly with team names - NO JOINs needed!
 */

import { supabase } from '@/lib/supabase';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Status mapping from TheSports API
const STATUS_MAP: Record<number, string> = {
    0: 'scheduled',
    1: 'live',      // First half
    2: 'live',      // First half injury time
    3: 'live',      // First half extra
    4: 'halftime',  // Half-time
    5: 'live',      // Second half
    6: 'live',      // Second half injury time
    7: 'live',      // Extra time
    8: 'finished',  // Full time
    9: 'finished',  // After extra time
    10: 'postponed',
    11: 'cancelled',
    12: 'interrupted',
    13: 'suspended',
};

interface LiveMatchData {
    id: string;
    home_team_id?: string;
    away_team_id?: string;
    competition_id?: string;
    home_team?: { id: string; name: string; logo?: string };
    away_team?: { id: string; name: string; logo?: string };
    competition?: { id: string; name: string; short_name?: string; logo?: string; country_id?: string };
    score?: [string, number, number[], number[], number | string, string];
}

/**
 * Fetch from TheSports API
 */
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
            console.error(`[Sync] API Error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.err) {
            console.error(`[Sync] API Error: ${data.err}`);
            return null;
        }

        return data.results || data.data || data;
    } catch (error) {
        console.error('[Sync] Fetch error:', error);
        return null;
    }
}

/**
 * Calculate match minute based on status
 */
function calculateMinute(rawMinute: number | string | undefined, statusId: number): number | null {
    if (rawMinute === undefined || rawMinute === null) return null;

    let minute = typeof rawMinute === 'string' ? parseInt(rawMinute, 10) : rawMinute;
    if (isNaN(minute)) return null;

    // Add 45 for second half, 90 for extra time
    if (statusId === 5 || statusId === 6) {
        minute = minute + 45;
    } else if (statusId === 7) {
        minute = minute + 90;
    }

    return minute;
}

/**
 * MAIN SYNC: Fetches live matches with team names and saves denormalized
 */
export async function syncLiveMatches(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log('[Sync] Fetching live matches from detail_live...');

    const matches = await fetchFromApi<LiveMatchData[]>('/v1/football/match/detail_live');

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
        console.log('[Sync] No live matches found');
        return { synced: 0, errors: 0 };
    }

    console.log(`[Sync] Processing ${matches.length} live matches`);

    for (const match of matches) {
        try {
            const score = match.score;
            const statusId = score?.[1] ?? 1;
            const homeScores = score?.[2] ?? [0];
            const awayScores = score?.[3] ?? [0];
            const rawMinute = score?.[4];

            const status = STATUS_MAP[statusId] || 'live';
            const minute = calculateMinute(rawMinute, statusId);

            // DENORMALIZED - save team names directly!
            const { error } = await supabase.from('matches').upsert({
                id: match.id,
                // Team data - DIRECT!
                home_team_name: match.home_team?.name || 'TBD',
                home_team_logo: match.home_team?.logo || '',
                away_team_name: match.away_team?.name || 'TBD',
                away_team_logo: match.away_team?.logo || '',
                // Competition data - DIRECT!
                competition_name: match.competition?.name || 'Unknown',
                competition_logo: match.competition?.logo || '',
                // Keep IDs for reference
                home_team_id: match.home_team_id || match.home_team?.id || null,
                away_team_id: match.away_team_id || match.away_team?.id || null,
                competition_id: match.competition_id || match.competition?.id || null,
                // Match state
                status: status,
                minute: minute,
                home_score: homeScores[0] || 0,
                away_score: awayScores[0] || 0,
                start_time: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            if (error) {
                console.error(`[Sync] Match ${match.id} error:`, error.message);
                errors++;
            } else {
                synced++;
            }
        } catch (err) {
            console.error(`[Sync] Match error:`, err);
            errors++;
        }
    }

    console.log(`[Sync] Live sync complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
}

/**
 * DAILY SYNC: Fetches scheduled matches for a date
 */
export async function syncDailyMatches(date: string): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log(`[Sync] Starting daily sync for ${date}`);

    // First sync live matches (they have team names!)
    const liveResult = await syncLiveMatches();
    synced += liveResult.synced;
    errors += liveResult.errors;

    // Then sync scheduled matches for the date
    const apiDate = date.replace(/-/g, '');
    console.log(`[Sync] Fetching diary matches for ${apiDate}...`);

    interface DiaryMatch {
        id: string;
        home_team_id?: string;
        away_team_id?: string;
        competition_id?: string;
        status_id?: number;
        match_time?: number;
        home_scores?: number[];
        away_scores?: number[];
    }

    const diaryMatches = await fetchFromApi<DiaryMatch[]>('/v1/football/match/diary', { date: apiDate });

    if (diaryMatches && Array.isArray(diaryMatches) && diaryMatches.length > 0) {
        console.log(`[Sync] Found ${diaryMatches.length} diary matches`);

        // Need to fetch team names for these matches
        // Build a cache of team IDs we need
        const teamIds = new Set<string>();
        const compIds = new Set<string>();

        for (const m of diaryMatches) {
            if (m.home_team_id) teamIds.add(m.home_team_id);
            if (m.away_team_id) teamIds.add(m.away_team_id);
            if (m.competition_id) compIds.add(m.competition_id);
        }

        // Fetch team details
        console.log(`[Sync] Fetching ${teamIds.size} teams and ${compIds.size} competitions...`);

        const teamsMap = new Map<string, { name: string; logo?: string }>();
        const compsMap = new Map<string, { name: string; logo?: string }>();

        // Fetch teams in batches
        const teamIdArray = Array.from(teamIds);
        for (let i = 0; i < teamIdArray.length; i += 100) {
            const batch = teamIdArray.slice(i, i + 100).join(',');
            const teamData = await fetchFromApi<Array<{ id: string; name: string; logo?: string }>>('/v1/football/team/additional/list', { uuid: batch });
            if (teamData) {
                for (const t of teamData) {
                    teamsMap.set(t.id, { name: t.name, logo: t.logo });
                }
            }
        }

        // Fetch competitions
        const compIdArray = Array.from(compIds);
        for (let i = 0; i < compIdArray.length; i += 100) {
            const batch = compIdArray.slice(i, i + 100).join(',');
            const compData = await fetchFromApi<Array<{ id: string; name: string; logo?: string }>>('/v1/football/competition/additional/list', { uuid: batch });
            if (compData) {
                for (const c of compData) {
                    compsMap.set(c.id, { name: c.name, logo: c.logo });
                }
            }
        }

        console.log(`[Sync] Loaded ${teamsMap.size} teams, ${compsMap.size} competitions`);

        // Now upsert diary matches with team names
        for (const match of diaryMatches) {
            try {
                const homeTeam = teamsMap.get(match.home_team_id || '') || { name: 'TBD', logo: '' };
                const awayTeam = teamsMap.get(match.away_team_id || '') || { name: 'TBD', logo: '' };
                const comp = compsMap.get(match.competition_id || '') || { name: 'Unknown', logo: '' };

                const statusId = match.status_id ?? 0;
                const status = STATUS_MAP[statusId] || 'scheduled';

                const { error } = await supabase.from('matches').upsert({
                    id: match.id,
                    // DENORMALIZED team names
                    home_team_name: homeTeam.name,
                    home_team_logo: homeTeam.logo || '',
                    away_team_name: awayTeam.name,
                    away_team_logo: awayTeam.logo || '',
                    competition_name: comp.name,
                    competition_logo: comp.logo || '',
                    // IDs for reference
                    home_team_id: match.home_team_id || null,
                    away_team_id: match.away_team_id || null,
                    competition_id: match.competition_id || null,
                    // Match data
                    status: status,
                    minute: null,
                    home_score: match.home_scores?.[0] || 0,
                    away_score: match.away_scores?.[0] || 0,
                    start_time: match.match_time ? new Date(match.match_time * 1000).toISOString() : new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });

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

    console.log(`[Sync] Daily sync complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
}

/**
 * WebSocket update - ONLY updates score/minute/status
 * Does NOT overwrite team names!
 */
export async function updateMatchLive(
    matchId: string,
    status: string,
    minute: number | null,
    homeScore: number,
    awayScore: number
): Promise<void> {
    const { error } = await supabase
        .from('matches')
        .update({
            status,
            minute,
            home_score: homeScore,
            away_score: awayScore,
            updated_at: new Date().toISOString(),
        })
        .eq('id', matchId);

    if (error) {
        console.error(`[Sync] Update error for ${matchId}:`, error.message);
    }
}

export const SyncService = {
    syncLiveMatches,
    syncDailyMatches,
    updateMatchLive,
};

export default SyncService;
