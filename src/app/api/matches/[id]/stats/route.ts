/**
 * GET /api/matches/[id]/stats
 * Returns match statistics (possession, shots, fouls, etc.)
 * 
 * Uses TheSports API:
 * - /match/team_stats/list - for LIVE matches (stats updated within 120s)
 * - /match/team_stats/detail?id=X - for HISTORICAL/FINISHED matches (within 30 days)
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Stat type mapping from TheSports API to display labels
const STAT_LABELS: Record<number, { label: string; isPercentage?: boolean }> = {
    1: { label: 'Schüsse', isPercentage: false },
    2: { label: 'Schüsse aufs Tor', isPercentage: false },
    4: { label: 'Fouls', isPercentage: false },
    5: { label: 'Eckstöße', isPercentage: false },
    6: { label: 'Abseits', isPercentage: false },
    7: { label: 'Ballbesitz', isPercentage: true },
    8: { label: 'Gelbe Karten', isPercentage: false },
    9: { label: 'Rote Karten', isPercentage: false },
    10: { label: 'Paraden', isPercentage: false },
    11: { label: 'Einwürfe', isPercentage: false },
    12: { label: 'Freistöße', isPercentage: false },
    13: { label: 'Torschüsse geblockt', isPercentage: false },
    14: { label: 'Großchancen', isPercentage: false },
    15: { label: 'Pässe', isPercentage: false },
    16: { label: 'Passgenauigkeit', isPercentage: true },
    17: { label: 'Tackles', isPercentage: false },
    18: { label: 'Zweikämpfe gewonnen', isPercentage: true },
    19: { label: 'Angriffe', isPercentage: false },
    20: { label: 'Gefährliche Angriffe', isPercentage: false },
};

// Stats we want to display and their order
const DISPLAY_STATS = [7, 14, 1, 2, 10, 5, 4, 15, 17, 12];

interface StatItem {
    label: string;
    homeValue: number;
    awayValue: number;
    isPercentage: boolean;
}

function parseStats(statsData: any[]): StatItem[] {
    if (!Array.isArray(statsData)) return [];

    const statsMap = new Map<number, { home: number; away: number }>();

    for (const stat of statsData) {
        // stat format: [type, home_value, away_value] or {type, home, away}
        let type: number;
        let home: number;
        let away: number;

        if (Array.isArray(stat)) {
            [type, home, away] = stat;
        } else {
            type = stat.type;
            home = stat.home ?? stat.home_value ?? 0;
            away = stat.away ?? stat.away_value ?? 0;
        }

        statsMap.set(type, { home, away });
    }

    const result: StatItem[] = [];
    for (const statType of DISPLAY_STATS) {
        const values = statsMap.get(statType);
        const labelInfo = STAT_LABELS[statType];

        if (values && labelInfo) {
            result.push({
                label: labelInfo.label,
                homeValue: values.home,
                awayValue: values.away,
                isPercentage: labelInfo.isPercentage ?? false,
            });
        }
    }

    return result;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Check for 'live' query param to determine which API to use
        const isLive = request.nextUrl.searchParams.get('live') === 'true';

        let fullStats: StatItem[] = [];

        if (isLive) {
            // LIVE MATCHES: Use team_stats/list (returns all matches with recent updates)
            const listUrl = `${API_URL}/v1/football/match/team_stats/list?user=${USERNAME}&secret=${API_KEY}`;
            const listResponse = await fetch(listUrl, {
                headers: { 'Accept': 'application/json' },
            });

            if (listResponse.ok) {
                const listData = await listResponse.json();
                if (!listData.err && listData.data) {
                    // Find our match in the list
                    const matches = Array.isArray(listData.data) ? listData.data : [];
                    const matchStats = matches.find((m: any) => m.id === id || m.match_id === id);

                    if (matchStats) {
                        const statsArray = matchStats.stats || matchStats.team_stats || [];
                        fullStats = parseStats(statsArray);
                    }
                }
            }
        } else {
            // HISTORICAL/FINISHED MATCHES: Use team_stats/detail with match ID
            const detailUrl = `${API_URL}/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${id}`;
            const detailResponse = await fetch(detailUrl, {
                headers: { 'Accept': 'application/json' },
            });

            if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (!detailData.err && detailData.data) {
                    // Data structure: { data: [[type, home, away], ...] } or nested
                    const statsArray = Array.isArray(detailData.data) ? detailData.data : detailData.data.stats ?? [];
                    fullStats = parseStats(statsArray);
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                full: fullStats,
                firstHalf: [], // Can be added later if half-time API works
                secondHalf: [],
            },
            matchId: id,
            isLive,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching match stats:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: {
                    full: [],
                    firstHalf: [],
                    secondHalf: [],
                },
            },
            { status: 500 }
        );
    }
}

// Revalidate every 30 seconds for live matches
export const revalidate = 30;
