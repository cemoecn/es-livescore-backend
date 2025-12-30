/**
 * GET /api/debug/test-table
 * Tests the table/live endpoint to see standings data structure
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competition_id') || 'gy0or5jhg6qwzv3'; // Default: Bundesliga

    try {
        // Try table/live endpoint first
        const liveUrl = `${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}`;
        const liveResponse = await fetch(liveUrl);
        const liveData = await liveResponse.json();

        // Try season/recent/table/detail
        const seasonUrl = `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}`;
        const seasonResponse = await fetch(seasonUrl);
        const seasonData = await seasonResponse.json();

        // Filter for our competition if possible
        let relevantLiveData = liveData.data;
        let relevantSeasonData = seasonData.data;

        if (Array.isArray(liveData.data)) {
            relevantLiveData = liveData.data.filter((t: any) =>
                t.competition_id === competitionId || t.season_id?.includes(competitionId)
            );
        }

        return NextResponse.json({
            success: true,
            competitionId,
            tableLive: {
                count: Array.isArray(liveData.data) ? liveData.data.length : 'not array',
                filtered: relevantLiveData?.length || 0,
                sample: Array.isArray(liveData.data) ? liveData.data[0] : liveData.data,
                relevantSample: Array.isArray(relevantLiveData) && relevantLiveData.length > 0 ? relevantLiveData[0] : null,
            },
            seasonTable: {
                count: Array.isArray(seasonData.data) ? seasonData.data.length : 'not array',
                sample: Array.isArray(seasonData.data) ? seasonData.data[0] : seasonData.data,
            },
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
