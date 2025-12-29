/**
 * GET /api/debug/test-stats
 * Debug endpoint to test team_stats APIs with specific match IDs
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('match_id') || '4wyrn4h68j8jq86'; // AC Milan vs Verona

    const results: Record<string, any> = {};

    // Test all stats endpoints
    const endpoints = [
        { name: 'team_stats/list', url: `/v1/football/match/team_stats/list?user=${USERNAME}&secret=${API_KEY}` },
        { name: 'team_stats/detail (id)', url: `/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${matchId}` },
        { name: 'team_stats/detail (uuid)', url: `/v1/football/match/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${matchId}` },
        { name: 'half/team_stats/list', url: `/v1/football/match/half/team_stats/list?user=${USERNAME}&secret=${API_KEY}` },
        { name: 'half/team_stats/detail', url: `/v1/football/match/half/team_stats/detail?user=${USERNAME}&secret=${API_KEY}&id=${matchId}` },
        { name: 'detail_live', url: `/v1/football/match/detail_live?user=${USERNAME}&secret=${API_KEY}` },
    ];

    for (const ep of endpoints) {
        try {
            const response = await fetch(`${API_URL}${ep.url}`, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
            });

            const data = await response.json();

            // Check if match is in results
            let matchFound = false;
            let matchStats = null;

            if (data.results) {
                if (Array.isArray(data.results)) {
                    const match = data.results.find((r: any) => r.id === matchId);
                    if (match) {
                        matchFound = true;
                        matchStats = match.stats;
                    }
                }
            }

            results[ep.name] = {
                authorized: !data.err,
                error: data.err || null,
                code: data.code,
                resultsCount: Array.isArray(data.results) ? data.results.length : 'N/A',
                matchFound,
                matchStatsCount: matchStats ? matchStats.length : 0,
                sampleStats: matchStats?.slice(0, 3) || null,
                sampleMatchIds: Array.isArray(data.results) ? data.results.slice(0, 5).map((r: any) => r.id) : null,
            };
        } catch (e) {
            results[ep.name] = {
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }
    }

    return NextResponse.json({
        success: true,
        matchId,
        results,
        timestamp: new Date().toISOString(),
    });
}

export const dynamic = 'force-dynamic';
