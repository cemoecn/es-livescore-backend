/**
 * GET /api/debug/full-standings-test
 * Tests both season table endpoints and tries to find working season_ids
 * Using the "Season standing(all season)" endpoint: /v1/football/season/table/detail
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Just test Bundesliga first
const BUNDESLIGA_COMPETITION_ID = 'gy0or5jhg6qwzv3';

// Try common season_id patterns - these are guesses based on what we've seen
// TheSports uses 17-char IDs like 'e4wyrn4hgxyq86p'
const TEST_SEASON_IDS = [
    'e4wyrn4hgxyq86p', // Previously found for Bundesliga 2024/25
    'l965mkyhjpxr1ge', // Found in table/live earlier
];

export async function GET() {
    try {
        const results: any[] = [];

        // Approach 1: Try table/live
        const liveUrl = `${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}`;
        const liveResponse = await fetch(liveUrl);
        const liveData = await liveResponse.json();
        results.push({
            endpoint: 'table/live',
            code: liveData.code,
            count: liveData.data?.length || 0,
        });

        // Approach 2: Try recent table endpoint with test season_ids
        for (const seasonId of TEST_SEASON_IDS) {
            // Try "newest season" endpoint
            const recentUrl = `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;
            const recentResponse = await fetch(recentUrl);
            const recentData = await recentResponse.json();

            results.push({
                endpoint: 'season/recent/table/detail',
                seasonId,
                code: recentData.code,
                hasResults: !!recentData.results,
                tablesCount: recentData.results?.tables?.length || 0,
                rowsCount: recentData.results?.tables?.[0]?.rows?.length || 0,
                firstTeam: recentData.results?.tables?.[0]?.rows?.[0],
            });

            // Try "all season" endpoint
            const allUrl = `${API_URL}/v1/football/season/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;
            const allResponse = await fetch(allUrl);
            const allData = await allResponse.json();

            results.push({
                endpoint: 'season/table/detail',
                seasonId,
                code: allData.code,
                hasResults: !!allData.results,
                tablesCount: allData.results?.tables?.length || 0,
                rowsCount: allData.results?.tables?.[0]?.rows?.length || 0,
                firstTeam: allData.results?.tables?.[0]?.rows?.[0],
            });
        }

        // Approach 3: Get seasons list and find the 2024/25 season
        const seasonsUrl = `${API_URL}/v1/football/season/list?user=${USERNAME}&secret=${API_KEY}`;
        const seasonsResponse = await fetch(seasonsUrl);
        const seasonsData = await seasonsResponse.json();

        // Look for 2024 or 2024/25 seasons
        const recentSeasons = (seasonsData.results || [])
            .filter((s: any) => s.year?.includes('2024') || s.year?.includes('2025'))
            .slice(0, 10);

        results.push({
            endpoint: 'season/list (2024/2025 filter)',
            count: recentSeasons.length,
            seasons: recentSeasons,
        });

        return NextResponse.json({ success: true, results });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
