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

interface LiveMatchScore {
    id: string;
    score?: [string, number, number[], number[], number | string, string];
}

/**
 * Sync live match STATUS only (score, minute, status)
 * Does NOT create new matches or update team names
 * Team names come from syncDailyMatches
 */
export async function syncLiveMatches(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log('[Sync] Fetching live matches...');

    const matches = await fetchFromApi<LiveMatchScore[]>('/v1/football/match/detail_live');

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
        console.log('[Sync] No live matches found');
        return { synced: 0, errors: 0 };
    }

    console.log(`[Sync] Updating ${matches.length} live matches (score/status only)`);

    for (const match of matches) {
        try {
            const score = match.score;
            if (!score || !Array.isArray(score)) continue;

            const statusId = score[1] ?? 1;
            const homeScores = score[2] ?? [0];
            const awayScores = score[3] ?? [0];
            const rawMinute = score[4];

            const status = STATUS_MAP[statusId] || 'live';
            const minute = calculateMinute(rawMinute, statusId);

            // UPDATE existing match only - don't create new ones
            const { error, count } = await supabase
                .from('matches')
                .update({
                    status: status,
                    minute: minute,
                    home_score: homeScores[0] || 0,
                    away_score: awayScores[0] || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', match.id);

            if (error) {
                errors++;
            } else if (count && count > 0) {
                synced++;
            }
        } catch {
            errors++;
        }
    }

    console.log(`[Sync] Live update complete: ${synced} updated, ${errors} errors`);
    return { synced, errors };
}

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

/**
 * DAILY SYNC: Creates/updates matches WITH team names
 * This is the main function that populates team data!
 */
export async function syncDailyMatches(date: string): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log(`[Sync] Starting daily sync for ${date}`);

    // 1. Fetch matches for the date
    const apiDate = date.replace(/-/g, '');
    console.log(`[Sync] Fetching diary matches for ${apiDate}...`);

    const diaryMatches = await fetchFromApi<DiaryMatch[]>('/v1/football/match/diary', { date: apiDate });

    if (!diaryMatches || !Array.isArray(diaryMatches) || diaryMatches.length === 0) {
        console.log('[Sync] No diary matches found');
        return { synced: 0, errors: 0 };
    }

    console.log(`[Sync] Found ${diaryMatches.length} diary matches`);

    // 2. Collect all team and competition IDs
    const teamIds = new Set<string>();
    const compIds = new Set<string>();

    for (const m of diaryMatches) {
        if (m.home_team_id) teamIds.add(m.home_team_id);
        if (m.away_team_id) teamIds.add(m.away_team_id);
        if (m.competition_id) compIds.add(m.competition_id);
    }

    console.log(`[Sync] Need ${teamIds.size} teams and ${compIds.size} competitions`);

    // 3. Fetch team and competition details
    const teamsMap = new Map<string, { name: string; logo?: string }>();
    const compsMap = new Map<string, { name: string; logo?: string; country?: string }>();

    // Fetch teams (batch by 100)
    const teamIdArray = Array.from(teamIds);
    for (let i = 0; i < teamIdArray.length; i += 100) {
        const batch = teamIdArray.slice(i, i + 100).join(',');
        const teamData = await fetchFromApi<Array<{ id: string; name: string; logo?: string }>>('/v1/football/team/additional/list', { uuid: batch });
        if (teamData && Array.isArray(teamData)) {
            for (const t of teamData) {
                teamsMap.set(t.id, { name: t.name, logo: t.logo });
            }
        }
    }

    // Fetch competitions (batch by 100)
    const compIdArray = Array.from(compIds);
    for (let i = 0; i < compIdArray.length; i += 100) {
        const batch = compIdArray.slice(i, i + 100).join(',');
        const compData = await fetchFromApi<Array<{ id: string; name: string; short_name?: string; logo?: string; country_id?: string }>>('/v1/football/competition/additional/list', { uuid: batch });
        if (compData && Array.isArray(compData)) {
            for (const c of compData) {
                compsMap.set(c.id, { name: c.short_name || c.name, logo: c.logo, country: c.country_id });
            }
        }
    }

    console.log(`[Sync] Loaded ${teamsMap.size} teams, ${compsMap.size} competitions from API`);

    // 4. Upsert matches with denormalized team names
    for (const match of diaryMatches) {
        try {
            const homeTeam = teamsMap.get(match.home_team_id || '') || { name: 'TBD', logo: '' };
            const awayTeam = teamsMap.get(match.away_team_id || '') || { name: 'TBD', logo: '' };
            const comp = compsMap.get(match.competition_id || '') || { name: 'Unknown', logo: '', country: '' };

            const statusId = match.status_id ?? 0;
            const status = STATUS_MAP[statusId] || 'scheduled';

            const { error } = await supabase.from('matches').upsert({
                id: match.id,
                // DENORMALIZED team names - this is the key!
                home_team_name: homeTeam.name,
                home_team_logo: homeTeam.logo || '',
                away_team_name: awayTeam.name,
                away_team_logo: awayTeam.logo || '',
                competition_name: comp.name,
                competition_logo: comp.logo || '',
                competition_country: comp.country || '',
                // IDs for reference
                home_team_id: match.home_team_id || null,
                away_team_id: match.away_team_id || null,
                competition_id: match.competition_id || null,
                // Match data
                status: status,
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

    console.log(`[Sync] Daily sync complete: ${synced} matches synced, ${errors} errors`);

    // 5. Now update live scores for any currently live matches
    const liveResult = await syncLiveMatches();
    console.log(`[Sync] Live update: ${liveResult.synced} updated`);

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
