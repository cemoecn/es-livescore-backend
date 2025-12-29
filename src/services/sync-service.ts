/**
 * Simplified Sync Service
 * Uses /match/recent/list API (recommended) + Cache Service for team names
 */

import { supabase } from '@/lib/supabase';
import { ensureCachesLoaded, getCacheStats, getCompetitionById, getCountryById, getTeamById } from './cache';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Status mapping from TheSports API (based on official documentation)
const STATUS_MAP: Record<number, string> = {
    0: 'cancelled',   // Abnormal (suggest hiding)
    1: 'scheduled',   // Not started
    2: 'live',        // First half
    3: 'halftime',    // Half-time
    4: 'live',        // Second half
    5: 'live',        // Overtime
    6: 'live',        // Overtime (deprecated)
    7: 'live',        // Penalty Shoot-out
    8: 'finished',    // End
    9: 'postponed',   // Delay
    10: 'suspended',  // Interrupt
    11: 'suspended',  // Cut in half
    12: 'cancelled',  // Cancel
    13: 'scheduled',  // To be determined
};

// TOP 10 LEAGUES - Only sync these competitions
const TOP_LEAGUE_IDS = new Set([
    // England
    'jednm9whz0ryox8', // Premier League
    'l965mkyh32r1ge4', // Championship (corrected)
    // Germany
    'gy0or5jhg6qwzv3', // Bundesliga (corrected)
    // Spain  
    'vl7oqdehlyr510j', // La Liga
    // Italy
    '4zp5rzghp5q82w1', // Serie A
    // France
    'yl5ergphnzr8k0o', // Ligue 1 (corrected)
    // Netherlands
    'vl7oqdeheyr510j', // Eredivisie
    // Portugal
    '9vjxm8ghx2r6odg', // Primeira Liga (corrected)
    // UEFA
    'z8yomo4h7wq0j6l', // Champions League
    '56ypq3nh0xmd7oj', // Europa League
    'p4jwq2gh754m0ve', // Conference League
]);

// Fallback logos for competitions (in case API doesn't provide one)
const COMPETITION_LOGOS: Record<string, string> = {
    'z8yomo4h7wq0j6l': 'https://img.thesports.com/football/competition/ac05535bde17129cb598311242b3afba.png', // Champions League
    '56ypq3nh0xmd7oj': 'https://img.thesports.com/football/competition/1792ba5a12171fedc6d543bdf173f37c.png', // Europa League
    'p4jwq2gh754m0ve': 'https://img.thesports.com/football/competition/88637a74a2cbd634b8b9504a60d711cd.png', // Conference League
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

            const { error } = await supabase
                .from('matches')
                .update({
                    status: status,
                    minute: minute,
                    home_score: homeScores[0] || 0,
                    away_score: awayScores[0] || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', match.id);

            if (!error) synced++;
            else errors++;
        } catch {
            errors++;
        }
    }

    console.log(`[Sync] Live update: ${synced} updated, ${errors} errors`);
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
 * DAILY SYNC: Fetches from /match/diary API
 * Uses date parameter (YYYYMMDD format) for direct date query - much faster!
 */
export async function syncDailyMatches(date: string): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    console.log(`[Sync] Starting daily sync for ${date}`);

    // 1. Load caches first
    console.log('[Sync] Loading team/competition caches...');
    await ensureCachesLoaded();

    const stats = getCacheStats();
    console.log(`[Sync] Cache stats: ${stats.teams} teams, ${stats.competitions} competitions`);

    // 2. Fetch from /match/diary with date parameter (YYYYMMDD format)
    const apiDate = date.replace(/-/g, ''); // Convert 2025-12-28 to 20251228
    console.log(`[Sync] Fetching matches from /match/diary for ${apiDate}...`);

    const diaryMatches = await fetchFromApi<DiaryMatch[]>('/v1/football/match/diary', { date: apiDate });

    if (!diaryMatches || !Array.isArray(diaryMatches) || diaryMatches.length === 0) {
        console.log('[Sync] No diary matches found');
        return { synced: 0, errors: 0 };
    }

    console.log(`[Sync] Found ${diaryMatches.length} total matches for ${date}`);

    // 3. Filter by TOP_LEAGUE_IDS
    const topLeagueMatches = diaryMatches.filter(m =>
        m.competition_id && TOP_LEAGUE_IDS.has(m.competition_id)
    );

    console.log(`[Sync] Filtered to ${topLeagueMatches.length} top league matches`);

    if (topLeagueMatches.length === 0) {
        return { synced: 0, errors: 0 };
    }

    // 4. Collect unique teams and competitions for upsert
    const teamsToUpsert = new Map<string, { id: string; name: string; short_name: string | null; logo: string | null; country_id: string | null }>();
    const compsToUpsert = new Map<string, { id: string; name: string; short_name: string | null; logo: string | null; country_id: string | null; primary_color: string | null; secondary_color: string | null }>();

    for (const match of topLeagueMatches) {
        // Collect home team
        if (match.home_team_id) {
            const team = getTeamById(match.home_team_id);
            if (team && !teamsToUpsert.has(team.id)) {
                teamsToUpsert.set(team.id, {
                    id: team.id,
                    name: team.name,
                    short_name: team.short_name || null,
                    logo: team.logo || null,
                    country_id: team.country_id || null,
                });
            }
        }
        // Collect away team
        if (match.away_team_id) {
            const team = getTeamById(match.away_team_id);
            if (team && !teamsToUpsert.has(team.id)) {
                teamsToUpsert.set(team.id, {
                    id: team.id,
                    name: team.name,
                    short_name: team.short_name || null,
                    logo: team.logo || null,
                    country_id: team.country_id || null,
                });
            }
        }
        // Collect competition
        if (match.competition_id) {
            const comp = getCompetitionById(match.competition_id);
            if (comp && !compsToUpsert.has(comp.id)) {
                compsToUpsert.set(comp.id, {
                    id: comp.id,
                    name: comp.name,
                    short_name: comp.short_name || null,
                    logo: comp.logo || COMPETITION_LOGOS[comp.id] || null,
                    country_id: comp.country_id || null,
                    primary_color: comp.primary_color || null,
                    secondary_color: comp.secondary_color || null,
                });
            }
        }
    }

    // 5. Upsert teams to Supabase
    if (teamsToUpsert.size > 0) {
        console.log(`[Sync] Upserting ${teamsToUpsert.size} teams...`);
        const teamsArray = Array.from(teamsToUpsert.values()).map(t => ({
            ...t,
            updated_at: new Date().toISOString(),
        }));
        const { error: teamsError } = await supabase.from('teams').upsert(teamsArray, { onConflict: 'id' });
        if (teamsError) {
            console.error('[Sync] Teams upsert error:', teamsError.message);
        }
    }

    // 6. Upsert competitions to Supabase
    if (compsToUpsert.size > 0) {
        console.log(`[Sync] Upserting ${compsToUpsert.size} competitions...`);
        const compsArray = Array.from(compsToUpsert.values()).map(c => ({
            ...c,
            updated_at: new Date().toISOString(),
        }));
        const { error: compsError } = await supabase.from('competitions').upsert(compsArray, { onConflict: 'id' });
        if (compsError) {
            console.error('[Sync] Competitions upsert error:', compsError.message);
        }
    }

    // 7. Upsert matches with team names from cache
    for (const match of topLeagueMatches) {
        try {
            const homeTeam = getTeamById(match.home_team_id || '');
            const awayTeam = getTeamById(match.away_team_id || '');
            const comp = getCompetitionById(match.competition_id || '');
            const country = comp?.country_id ? getCountryById(comp.country_id) : undefined;

            const statusId = match.status_id ?? 0;
            let status = STATUS_MAP[statusId] || 'scheduled';

            // IMPORTANT: If match hasn't started yet (match_time > now), force status to 'scheduled'
            const now = Math.floor(Date.now() / 1000);
            if (match.match_time && match.match_time > now) {
                status = 'scheduled';
            }

            const { error } = await supabase.from('matches').upsert({
                id: match.id,
                home_team_name: homeTeam?.name || 'TBD',
                home_team_logo: homeTeam?.logo || '',
                away_team_name: awayTeam?.name || 'TBD',
                away_team_logo: awayTeam?.logo || '',
                competition_name: comp?.short_name || comp?.name || 'Unknown',
                competition_logo: comp?.logo || COMPETITION_LOGOS[match.competition_id || ''] || '',
                competition_country: country?.name || '',
                home_team_id: match.home_team_id || null,
                away_team_id: match.away_team_id || null,
                competition_id: match.competition_id || null,
                status: status,
                home_score: match.home_scores?.[0] || 0,
                away_score: match.away_scores?.[0] || 0,
                start_time: match.match_time ? new Date(match.match_time * 1000).toISOString() : new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            if (error) {
                if (errors < 3) console.error(`[Sync] Match ${match.id} error:`, error.message);
                errors++;
            } else {
                synced++;
            }
        } catch {
            errors++;
        }
    }

    console.log(`[Sync] Daily sync complete: ${synced} matches synced, ${errors} errors`);

    // NOTE: Live score updates are now handled exclusively by WebSocket (MQTT)
    // Do NOT call syncLiveMatches() here as it would overwrite real-time WebSocket data
    // with potentially stale HTTP API data

    return { synced, errors };
}

/**
 * SYNC ALL DAYS: Syncs last 7 days + today + next 7 days (15 days total)
 */
export async function syncAllDays(): Promise<{ totalSynced: number; totalErrors: number; days: number }> {
    console.log('[Sync] Starting 15-day sync...');

    let totalSynced = 0;
    let totalErrors = 0;
    const today = new Date();

    // Sync -7 to +7 days (15 days total)
    for (let offset = -7; offset <= 7; offset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);
        const dateStr = date.toISOString().split('T')[0];

        const result = await syncDailyMatches(dateStr);
        totalSynced += result.synced;
        totalErrors += result.errors;
    }

    console.log(`[Sync] 15-day sync complete: ${totalSynced} matches, ${totalErrors} errors`);
    return { totalSynced, totalErrors, days: 15 };
}

/**
 * WebSocket update - ONLY updates score/minute/status
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
    syncAllDays,
    updateMatchLive,
};

export default SyncService;
