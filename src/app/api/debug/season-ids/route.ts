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
                const response = await fetch(
                    `${API_URL}/v1/football/competition/page?user=${USERNAME}&secret=${API_KEY}&uuid=${compId}`
                );
                const data = await response.json();

                if (data.results) {
                    results.push({
                        id: compId,
                        name: data.results.name,
                        cur_season_id: data.results.cur_season_id,
                        cur_round: data.results.cur_round,
                    });
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
