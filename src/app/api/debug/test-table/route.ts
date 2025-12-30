/**
 * GET /api/debug/test-table
 * Tests the table/live endpoint to see standings data structure
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Top League IDs
const TOP_LEAGUE_IDS = [
    'gy0or5jhg6qwzv3', // Bundesliga
    'jednm9whz0ryox8', // Premier League
    'vl7oqdehlyr510j', // La Liga
    '4zp5rzghp5q82w1', // Serie A
    'yl5ergphnzr8k0o', // Ligue 1
];

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competition_id') || 'gy0or5jhg6qwzv3'; // Default: Bundesliga

    try {
        // Try table/live endpoint
        const liveUrl = `${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}`;
        const liveResponse = await fetch(liveUrl);
        const liveData = await liveResponse.json();

        // Try to find data for our competition
        let relevantData = null;
        const allData = liveData.data || liveData.results || liveData;

        // Check if it's an object with season_id keys
        if (allData && typeof allData === 'object' && !Array.isArray(allData)) {
            // It might be keyed by season_id
            const keys = Object.keys(allData);
            for (const key of keys) {
                const entry = allData[key];
                if (entry?.competition_id === competitionId || key.includes(competitionId)) {
                    relevantData = entry;
                    break;
                }
            }

            return NextResponse.json({
                success: true,
                competitionId,
                dataType: 'object',
                keyCount: keys.length,
                sampleKeys: keys.slice(0, 5),
                firstValue: keys.length > 0 ? allData[keys[0]] : null,
                relevantData: relevantData,
            });
        }

        // Check if it's an array
        if (Array.isArray(allData)) {
            relevantData = allData.find((item: any) =>
                item.competition_id === competitionId
            );
            return NextResponse.json({
                success: true,
                competitionId,
                dataType: 'array',
                arrayLength: allData.length,
                relevantData: relevantData,
                sampleItem: allData[0],
            });
        }

        return NextResponse.json({
            success: true,
            competitionId,
            dataType: typeof allData,
            rawSample: JSON.stringify(allData).slice(0, 2000),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
