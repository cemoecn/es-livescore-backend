/**
 * GET /api/debug/test-stats
 * Debug endpoint to test TheSports team_stats API responses
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Test match ID - you can override with ?id=xxx query param
const DEFAULT_MATCH_ID = 'vjxm8ghe5gn1r6o';

export async function GET(request: NextRequest) {
    const matchId = request.nextUrl.searchParams.get('id') || DEFAULT_MATCH_ID;

    const results: Record<string, any> = {};

    // Test 1: team_stats/list (live matches)
    try {
        const listUrl = `${API_URL}/v1/football/match/team_stats/list?user=${USERNAME}&secret=${API_KEY}`;
        const listResponse = await fetch(listUrl, {
            headers: { 'Accept': 'application/json' },
        });
        const listData = await listResponse.json();

        results['team_stats_list'] = {
            status: listResponse.status,
            error: listData.err || null,
            hasData: !!listData.data,
            dataIsArray: Array.isArray(listData.data),
            dataLength: Array.isArray(listData.data) ? listData.data.length : 'N/A',
            sampleItem: Array.isArray(listData.data) && listData.data[0] ? {
                keys: Object.keys(listData.data[0]),
                sample: listData.data[0],
            } : null,
        };
    } catch (e) {
        results['team_stats_list'] = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // Test 2: team_stats/detail (historical matches)
    try {
        const detailUrl = `${API_URL}/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${matchId}`;
        const detailResponse = await fetch(detailUrl, {
            headers: { 'Accept': 'application/json' },
        });
        const detailData = await detailResponse.json();

        results['team_stats_detail'] = {
            url: detailUrl.replace(API_KEY, '***'),
            status: detailResponse.status,
            error: detailData.err || null,
            hasData: !!detailData.data,
            rawData: detailData.data,
            dataType: typeof detailData.data,
            isArray: Array.isArray(detailData.data),
            fullResponse: detailData, // Show full response structure
        };
    } catch (e) {
        results['team_stats_detail'] = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // Test 3: Check the stats from detail_live endpoint 
    try {
        const liveUrl = `${API_URL}/v1/football/match/detail_live?user=${USERNAME}&secret=${API_KEY}&id=${matchId}`;
        const liveResponse = await fetch(liveUrl, {
            headers: { 'Accept': 'application/json' },
        });
        const liveData = await liveResponse.json();

        results['detail_live_stats'] = {
            hasData: !!liveData.data,
            hasStats: liveData.data?.stats ? true : false,
            statsData: liveData.data?.stats || null,
            matchFound: !!liveData.data,
        };
    } catch (e) {
        results['detail_live_stats'] = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    // Test 4: Check /match/diary for today to compare IDs
    try {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
        const diaryUrl = `${API_URL}/v1/football/match/diary?user=${USERNAME}&secret=${API_KEY}&date=${today}`;
        const diaryResponse = await fetch(diaryUrl, {
            headers: { 'Accept': 'application/json' },
        });
        const diaryData = await diaryResponse.json();

        // Find sample matches from diary
        const diaryMatches = Array.isArray(diaryData.results) ? diaryData.results.slice(0, 5) : [];

        results['diary_comparison'] = {
            date: today,
            sampleMatchIds: diaryMatches.map((m: any) => ({
                id: m.id,
                homeTeamId: m.home_team_id,
            })),
            totalMatches: Array.isArray(diaryData.results) ? diaryData.results.length : 0,
            note: 'These IDs from /diary should match what we store in Supabase',
        };
    } catch (e) {
        results['diary_comparison'] = { error: e instanceof Error ? e.message : 'Unknown error' };
    }

    return NextResponse.json({
        success: true,
        matchId,
        results,
        timestamp: new Date().toISOString(),
    });
}

export const dynamic = 'force-dynamic';
