/**
 * GET /api/debug/find-bundesliga-season
 * Tries multiple potential Bundesliga season IDs to find the current one
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Various season IDs to test - trying different patterns
const TEST_SEASON_IDS = [
    'e4wyrn4hgxyq86p', // Currently used - shows 11 games
    'l965mkyhjpxr1ge', // Premier League 2024/25 - shows 19 games
    // Try variations based on known ID patterns
    'e4wyrn4hgayq86p',
    'e4wyrn4hgbyq86p',
    'e4wyrn4hgcyq86p',
    'e4wyrn4hgdyq86p',
    'e4wyrn4hgeyq86p',
    'e4wyrn4hgfyq86p',
    'e4wyrn4hggyq86p',
    'e4wyrn4hghyq86p',
    'e4wyrn4hgiyq86p',
    'e4wyrn4hgjyq86p',
    'e4wyrn4hgkyq86p',
    'e4wyrn4hglyq86p',
    'e4wyrn4hgmyq86p',
    'e4wyrn4hgnyq86p',
    'e4wyrn4hgoyq86p',
    'e4wyrn4hgpyq86p',
    'e4wyrn4hgqyq86p',
    'e4wyrn4hgryq86p',
    'e4wyrn4hgsyq86p',
    'e4wyrn4hgtyq86p',
    'e4wyrn4hguyq86p',
    'e4wyrn4hgvyq86p',
    'e4wyrn4hgwyq86p',
    'e4wyrn4hgyyq86p',
    'e4wyrn4hgzyq86p',
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const seasonId of TEST_SEASON_IDS) {
            try {
                const url = `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;
                const response = await fetch(url);
                const data = await response.json();

                const tables = data.results?.tables || [];
                const rows = tables[0]?.rows || [];

                if (rows.length > 0) {
                    const topTeam = rows[0];
                    results.push({
                        seasonId,
                        teamCount: rows.length,
                        topTeamPoints: topTeam.points,
                        gamesPlayed: topTeam.total,
                        // If 18 teams and more than 11 games, could be current Bundesliga
                        possibleBundesliga: rows.length === 18 && topTeam.total > 11,
                    });
                }
            } catch (e) {
                // Ignore errors for invalid season IDs
            }
        }

        return NextResponse.json({
            success: true,
            testedCount: TEST_SEASON_IDS.length,
            foundCount: results.length,
            results: results.sort((a, b) => b.gamesPlayed - a.gamesPlayed),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
