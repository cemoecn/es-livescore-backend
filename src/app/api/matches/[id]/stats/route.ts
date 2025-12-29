/**
 * GET /api/matches/:id/stats
 * Returns team statistics for a match
 * Fetches from TheSports API and caches in Supabase
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Stat type mapping from TheSports API
// Based on WebSocket stats format: { type, home, away }
const STAT_TYPE_MAP: Record<number, { label: string; labelDe: string; isPercentage?: boolean }> = {
    1: { label: 'Possession', labelDe: 'Ballbesitz', isPercentage: true },
    2: { label: 'Shots', labelDe: 'Schüsse' },
    3: { label: 'Shots on Target', labelDe: 'Schüsse aufs Tor' },
    4: { label: 'Fouls', labelDe: 'Fouls' },
    5: { label: 'Corner Kicks', labelDe: 'Eckstöße' },
    6: { label: 'Offsides', labelDe: 'Abseits' },
    7: { label: 'Yellow Cards', labelDe: 'Gelbe Karten' },
    8: { label: 'Red Cards', labelDe: 'Rote Karten' },
    9: { label: 'Free Kicks', labelDe: 'Freistöße' },
    10: { label: 'Saves', labelDe: 'Paraden' },
    11: { label: 'Passes', labelDe: 'Pässe' },
    12: { label: 'Pass Accuracy', labelDe: 'Passgenauigkeit', isPercentage: true },
    13: { label: 'Tackles', labelDe: 'Tackles' },
    14: { label: 'Attacks', labelDe: 'Angriffe' },
    15: { label: 'Dangerous Attacks', labelDe: 'Gefährliche Angriffe' },
    16: { label: 'Crosses', labelDe: 'Flanken' },
    17: { label: 'Interceptions', labelDe: 'Abfangaktionen' },
    18: { label: 'Clearances', labelDe: 'Klärungsaktionen' },
    19: { label: 'Blocked Shots', labelDe: 'Geblockte Schüsse' },
    20: { label: 'Big Chances', labelDe: 'Großchancen' },
    21: { label: 'Dribbles', labelDe: 'Dribblings' },
    22: { label: 'Duels Won', labelDe: 'Zweikämpfe gewonnen' },
    23: { label: 'Aerials Won', labelDe: 'Luftduelle gewonnen' },
    24: { label: 'Long Balls', labelDe: 'Lange Bälle' },
    25: { label: 'Goal Kicks', labelDe: 'Abstöße' },
    26: { label: 'Throw-ins', labelDe: 'Einwürfe' },
};

// Cache expiry time (60 seconds for live matches)
const CACHE_TTL_MS = 60 * 1000;

interface StatRow {
    type: number;
    label: string;
    homeValue: number;
    awayValue: number;
    isPercentage?: boolean;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: matchId } = await params;

        if (!matchId) {
            return NextResponse.json({ success: false, error: 'Match ID required' }, { status: 400 });
        }

        // 1. Check Supabase cache first
        const { data: cachedStats, error: cacheError } = await supabase
            .from('match_stats')
            .select('*')
            .eq('match_id', matchId)
            .order('stat_type', { ascending: true });

        // If we have recent cached stats (less than 60s old), return them
        if (!cacheError && cachedStats && cachedStats.length > 0) {
            const newestStat = cachedStats[0];
            const cacheAge = Date.now() - new Date(newestStat.updated_at).getTime();

            if (cacheAge < CACHE_TTL_MS) {
                console.log(`[Stats] Returning cached stats for ${matchId} (age: ${Math.round(cacheAge / 1000)}s)`);
                return NextResponse.json({
                    success: true,
                    matchId,
                    stats: formatStats(cachedStats),
                    cached: true,
                    cacheAge: Math.round(cacheAge / 1000),
                });
            }
        }

        // 2. Fetch fresh stats from TheSports API
        console.log(`[Stats] Fetching fresh stats for ${matchId}`);
        const apiStats = await fetchStatsFromAPI(matchId);

        if (!apiStats || apiStats.length === 0) {
            // Return cached stats if available, even if stale
            if (cachedStats && cachedStats.length > 0) {
                return NextResponse.json({
                    success: true,
                    matchId,
                    stats: formatStats(cachedStats),
                    cached: true,
                    stale: true,
                });
            }
            return NextResponse.json({ success: true, matchId, stats: [] });
        }

        // 3. Upsert stats to Supabase
        await upsertStats(matchId, apiStats);

        // 4. Return formatted stats
        return NextResponse.json({
            success: true,
            matchId,
            stats: apiStats,
            cached: false,
        });
    } catch (error) {
        console.error('[Stats] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

async function fetchStatsFromAPI(matchId: string): Promise<StatRow[]> {
    try {
        // Try team_stats/list first (for live/recent matches with stats changed in last 120s)
        // This endpoint returns stats in the simple { type, home, away } format
        let url = `${API_URL}/v1/football/match/team_stats/list?user=${USERNAME}&secret=${API_KEY}`;

        console.log(`[Stats] Trying team_stats/list...`);
        let response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        if (response.ok) {
            const data = await response.json();
            if (data.code === 0 && data.results) {
                // Find our match in the results
                const matchData = findMatchInResults(data.results, matchId);
                if (matchData && matchData.stats && matchData.stats.length > 0) {
                    console.log(`[Stats] Found ${matchData.stats.length} stats in team_stats/list`);
                    return parseSimpleStats(matchData.stats);
                }
            }
        }

        // Fallback: Try detail_live endpoint which has stats for all live matches
        console.log(`[Stats] Trying detail_live...`);
        url = `${API_URL}/v1/football/match/detail_live?user=${USERNAME}&secret=${API_KEY}`;

        response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        if (response.ok) {
            const data = await response.json();
            if (data.code === 0 && data.results) {
                const matchData = findMatchInResults(data.results, matchId);
                if (matchData && matchData.stats && matchData.stats.length > 0) {
                    console.log(`[Stats] Found ${matchData.stats.length} stats in detail_live`);
                    return parseSimpleStats(matchData.stats);
                }
            }
        }

        // Last resort: Try team_stats/detail endpoint with uuid parameter
        // This endpoint returns stats directly as an array of team objects (not wrapped in match)
        console.log(`[Stats] Trying team_stats/detail...`);
        url = `${API_URL}/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}`;

        response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[Stats] team_stats/detail response code: ${data.code}, results length: ${Array.isArray(data.results) ? data.results.length : 'N/A'}`);

            if (data.code === 0 && data.results && Array.isArray(data.results) && data.results.length >= 2) {
                const firstItem = data.results[0];

                // Check if it's the detailed team format with team_id, ball_possession, etc.
                if (firstItem && 'team_id' in firstItem && 'ball_possession' in firstItem) {
                    console.log(`[Stats] Found detailed team stats for ${matchId}`);
                    return parseDetailedStats(data.results[0], data.results[1]);
                }
                // Check if it's simple format with type, home, away
                else if (firstItem && 'type' in firstItem && 'home' in firstItem) {
                    console.log(`[Stats] Found simple stats for ${matchId}`);
                    return parseSimpleStats(data.results);
                }
            }
        }

        // Try live/history endpoint for finished matches (last 30 days)
        console.log(`[Stats] Trying live/history...`);
        url = `${API_URL}/v1/football/match/live/history?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}`;

        response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[Stats] live/history response code: ${data.code}`);

            if (data.code === 0 && data.results) {
                // results is an object with {id, score, stats, incidents, tlive}
                const matchResult = data.results;
                if (matchResult.stats && Array.isArray(matchResult.stats) && matchResult.stats.length >= 2) {
                    const firstItem = matchResult.stats[0];
                    if (firstItem && 'team_id' in firstItem) {
                        console.log(`[Stats] Found stats in live/history for ${matchId}`);
                        return parseDetailedStats(matchResult.stats[0], matchResult.stats[1]);
                    }
                }
            }
        }

        console.log(`[Stats] No stats found for ${matchId}`);
        return [];
    } catch (error) {
        console.error('[Stats] Fetch error:', error);
        return [];
    }
}

// Helper to find match in various result structures
function findMatchInResults(results: any, matchId: string): any | null {
    if (Array.isArray(results)) {
        return results.find((r: any) => r.id === matchId);
    } else if (results && typeof results === 'object') {
        if (results.id === matchId) {
            return results;
        }
        // Check nested results arrays
        for (const key of Object.keys(results)) {
            if (Array.isArray(results[key])) {
                const found = results[key].find((r: any) => r.id === matchId);
                if (found) return found;
            }
        }
    }
    return null;
}

// Parse simple stats format: [{ type, home, away }, ...]
function parseSimpleStats(stats: Array<{ type: number; home: number; away: number }>): StatRow[] {
    return stats
        .filter(stat => STAT_TYPE_MAP[stat.type]) // Only include known types
        .map(stat => ({
            type: stat.type,
            label: STAT_TYPE_MAP[stat.type]?.labelDe || `Typ ${stat.type}`,
            homeValue: stat.home || 0,
            awayValue: stat.away || 0,
            isPercentage: STAT_TYPE_MAP[stat.type]?.isPercentage,
        }))
        .sort((a, b) => a.type - b.type); // Sort by type for consistent ordering
}

// Parse detailed stats format with team objects
function parseDetailedStats(homeStats: any, awayStats: any): StatRow[] {
    const stats: StatRow[] = [];

    // Ball possession
    if (homeStats.ball_possession !== undefined) {
        stats.push({
            type: 1,
            label: 'Ballbesitz',
            homeValue: homeStats.ball_possession || 0,
            awayValue: awayStats.ball_possession || 0,
            isPercentage: true,
        });
    }

    // Shots
    if (homeStats.shots !== undefined) {
        stats.push({
            type: 2,
            label: 'Schüsse',
            homeValue: homeStats.shots || 0,
            awayValue: awayStats.shots || 0,
        });
    }

    // Shots on target
    if (homeStats.shots_on_target !== undefined) {
        stats.push({
            type: 3,
            label: 'Schüsse aufs Tor',
            homeValue: homeStats.shots_on_target || 0,
            awayValue: awayStats.shots_on_target || 0,
        });
    }

    // Corner kicks
    if (homeStats.corner_kicks !== undefined) {
        stats.push({
            type: 5,
            label: 'Eckstöße',
            homeValue: homeStats.corner_kicks || 0,
            awayValue: awayStats.corner_kicks || 0,
        });
    }

    // Fouls
    if (homeStats.fouls !== undefined) {
        stats.push({
            type: 4,
            label: 'Fouls',
            homeValue: homeStats.fouls || 0,
            awayValue: awayStats.fouls || 0,
        });
    }

    // Yellow cards
    if (homeStats.yellow_cards !== undefined) {
        stats.push({
            type: 7,
            label: 'Gelbe Karten',
            homeValue: homeStats.yellow_cards || 0,
            awayValue: awayStats.yellow_cards || 0,
        });
    }

    // Red cards
    if (homeStats.red_cards !== undefined) {
        stats.push({
            type: 8,
            label: 'Rote Karten',
            homeValue: homeStats.red_cards || 0,
            awayValue: awayStats.red_cards || 0,
        });
    }

    // Offsides
    if (homeStats.offsides !== undefined) {
        stats.push({
            type: 6,
            label: 'Abseits',
            homeValue: homeStats.offsides || 0,
            awayValue: awayStats.offsides || 0,
        });
    }

    // Passes
    if (homeStats.passes !== undefined) {
        stats.push({
            type: 11,
            label: 'Pässe',
            homeValue: homeStats.passes || 0,
            awayValue: awayStats.passes || 0,
        });
    }

    // Tackles
    if (homeStats.tackles !== undefined) {
        stats.push({
            type: 13,
            label: 'Tackles',
            homeValue: homeStats.tackles || 0,
            awayValue: awayStats.tackles || 0,
        });
    }

    return stats;
}

async function upsertStats(matchId: string, stats: StatRow[]): Promise<void> {
    try {
        const rows = stats.map(stat => ({
            match_id: matchId,
            stat_type: stat.type,
            home_value: stat.homeValue,
            away_value: stat.awayValue,
            period: 'full',
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from('match_stats')
            .upsert(rows, {
                onConflict: 'match_id,stat_type,period',
            });

        if (error) {
            console.error('[Stats] Upsert error:', error.message);
        }
    } catch (error) {
        console.error('[Stats] Upsert error:', error);
    }
}

function formatStats(cachedStats: any[]): StatRow[] {
    return cachedStats.map(stat => {
        const typeInfo = STAT_TYPE_MAP[stat.stat_type] || { label: `Type ${stat.stat_type}`, labelDe: `Typ ${stat.stat_type}` };
        return {
            type: stat.stat_type,
            label: typeInfo.labelDe,
            homeValue: stat.home_value,
            awayValue: stat.away_value,
            isPercentage: typeInfo.isPercentage,
        };
    });
}

export const dynamic = 'force-dynamic';
