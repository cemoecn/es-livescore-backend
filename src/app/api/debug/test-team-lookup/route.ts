/**
 * GET /api/debug/test-team-lookup
 * Tests team lookup from TheSports API
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Team IDs from Bundesliga standings
const TEST_TEAM_IDS = [
    'yl5ergphjy2r8k0', // Position 1 (Bayern)
    '4zp5rzghe4nq82w', // Position 2 (Dortmund)
    'z318q66hdleqo9j', // Position 4
    'kdj2ryoh3wyq1zp', // Position 5
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const teamId of TEST_TEAM_IDS) {
            try {
                const url = `${API_URL}/v1/football/team/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${teamId}`;
                const response = await fetch(url);
                const data = await response.json();

                results.push({
                    teamId,
                    hasResults: !!data.results,
                    name: data.results?.name,
                    shortName: data.results?.short_name,
                    logo: data.results?.logo ? 'yes' : 'no',
                    code: data.code,
                    error: data.err,
                });
            } catch (err) {
                results.push({
                    teamId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
