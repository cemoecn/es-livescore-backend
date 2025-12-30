/**
 * GET /api/debug/current-seasons
 * Fetches current season IDs for our top leagues from TheSports API
 * Uses competition/detail endpoint which contains cur_season_id
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Our top league competition IDs
const TOP_LEAGUES = [
    { id: 'gy0or5jhg6qwzv3', name: 'Bundesliga' },
    { id: 'jednm9whz0ryox8', name: 'Premier League' },
    { id: 'vl7oqdehlyr510j', name: 'La Liga' },
    { id: '4zp5rzghp5q82w1', name: 'Serie A' },
    { id: 'yl5ergphnzr8k0o', name: 'Ligue 1' },
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const league of TOP_LEAGUES) {
            try {
                // Try competition/detail endpoint
                const detailUrl = `${API_URL}/v1/football/competition/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${league.id}`;
                const detailResponse = await fetch(detailUrl);
                const detailData = await detailResponse.json();

                // Also try to get season list for this competition
                const seasonUrl = `${API_URL}/v1/football/season/list?user=${USERNAME}&secret=${API_KEY}&competition_id=${league.id}`;
                const seasonResponse = await fetch(seasonUrl);
                const seasonData = await seasonResponse.json();

                results.push({
                    competitionId: league.id,
                    name: league.name,
                    // From competition/detail
                    detailCurSeasonId: detailData.results?.cur_season_id || null,
                    detailCurRound: detailData.results?.cur_round || null,
                    detailError: detailData.err || null,
                    // From season/list - get most recent season
                    seasons: (seasonData.results || []).slice(0, 3).map((s: any) => ({
                        id: s.id,
                        year: s.year,
                        name: s.name,
                    })),
                });
            } catch (error) {
                results.push({
                    competitionId: league.id,
                    name: league.name,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Build season ID mapping for easy copy-paste
        const seasonIdMap: Record<string, string> = {};
        for (const r of results) {
            if (r.detailCurSeasonId) {
                seasonIdMap[r.competitionId] = r.detailCurSeasonId;
            }
        }

        return NextResponse.json({
            success: true,
            results,
            seasonIdMap,
            codeToUse: `const CURRENT_SEASON_IDS: Record<string, string> = ${JSON.stringify(seasonIdMap, null, 4)};`,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
