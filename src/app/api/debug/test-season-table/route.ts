/**
 * GET /api/debug/test-season-table
 * Tests the season/recent/table/detail endpoint with different season IDs
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const seasonId = searchParams.get('season_id');

        // If no season_id provided, test multiple endpoints
        if (!seasonId) {
            // Test table/live first to see what's currently available
            const liveUrl = `${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}`;
            const liveResponse = await fetch(liveUrl);
            const liveData = await liveResponse.json();

            return NextResponse.json({
                success: true,
                message: 'Use ?season_id=XXX to test specific season',
                tableLiveCount: liveData.data?.length || 0,
                tableLiveSamples: (liveData.data || []).slice(0, 5).map((t: any) => ({
                    season_id: t.season_id,
                    firstTeam: t.tables?.[0]?.rows?.[0]?.team_id,
                    rowCount: t.tables?.[0]?.rows?.length,
                })),
            });
        }

        // Test with provided season_id
        const url = `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;
        const response = await fetch(url);
        const data = await response.json();

        // Parse the response
        const tables = data.results?.tables || [];
        const rows = tables[0]?.rows || [];

        return NextResponse.json({
            success: true,
            seasonId,
            code: data.code,
            hasResults: !!data.results,
            tablesCount: tables.length,
            rowsCount: rows.length,
            topTeams: rows.slice(0, 5).map((r: any) => ({
                position: r.position,
                team_id: r.team_id,
                points: r.points,
                played: r.total,
            })),
            promotions: data.results?.promotions || [],
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
