/**
 * GET /api/debug/season-ids
 * Gets current season IDs for top leagues directly from TheSports API
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

const TOP_LEAGUE_IDS = [
    'gy0or5jhg6qwzv3', // Bundesliga
    'jednm9whz0ryox8', // Premier League
    'vl7oqdehlyr510j', // La Liga
    '4zp5rzghp5q82w1', // Serie A
    'yl5ergphnzr8k0o', // Ligue 1
];

export async function GET() {
    try {
        // Fetch competition details from TheSports API (includes cur_season_id)
        const results: any[] = [];

        for (const compId of TOP_LEAGUE_IDS) {
            try {
                // Use season/list to get all seasons for this competition
                const response = await fetch(
                    `${API_URL}/v1/football/season/list?user=${USERNAME}&secret=${API_KEY}&competition_id=${compId}`
                );
                const data = await response.json();

                // Get seasons array
                const seasons = data.results || data.data || [];

                // Sort by year descending to get latest season
                const sortedSeasons = [...seasons].sort((a: any, b: any) =>
                    parseInt(b.year || '0') - parseInt(a.year || '0')
                );

                const currentSeason = sortedSeasons[0];

                if (currentSeason) {
                    results.push({
                        id: compId,
                        season_id: currentSeason.id,
                        year: currentSeason.year,
                    });
                } else {
                    results.push({ id: compId, error: 'No seasons found', rawCount: seasons.length });
                }
            } catch (e) {
                results.push({ id: compId, error: String(e) });
            }
        }

        // Format as a ready-to-use object
        const seasonIds: Record<string, string> = {};
        for (const comp of results) {
            if (comp.season_id) {
                seasonIds[comp.id] = comp.season_id;
            }
        }

        return NextResponse.json({
            success: true,
            competitions: results,
            seasonIds,
            codeToUse: `const SEASON_IDS: Record<string, string> = ${JSON.stringify(seasonIds, null, 4)};`,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
