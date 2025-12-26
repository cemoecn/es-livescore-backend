/**
 * GET /api/debug/test-endpoints
 * Tests various TheSports API endpoints to see what's available
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Get a sample team and match ID
const SAMPLE_TEAM_ID = 'p3glrw7he0gqdyj'; // Red Bull Salzburg from cache
const SAMPLE_MATCH_ID = 'vjxm8ghe5gn1r6o';
const SAMPLE_COMPETITION_ID = 'yl5ergphyvr8k0o';

export async function GET() {
    const endpointsToTest = [
        // === ENDPOINTS FROM TheSportsAPI.pdf ===
        // Real-time data - should contain incidents, stats, score
        { path: '/v1/football/match/detail_live', params: {} },
        // Historical match stats/incidents
        { path: '/v1/football/match/live/history', params: { id: SAMPLE_MATCH_ID } },
        // Lineup detail
        { path: '/v1/football/match/lineup/detail', params: { id: SAMPLE_MATCH_ID } },
        // Match trend
        { path: '/v1/football/match/trend/live', params: {} },
        { path: '/v1/football/match/trend/detail', params: { id: SAMPLE_MATCH_ID } },
        // Team stats
        { path: '/v1/football/match/team_stats/list', params: {} },
        { path: '/v1/football/match/team_stats/detail', params: { id: SAMPLE_MATCH_ID } },
        // Player stats
        { path: '/v1/football/match/player_stats/list', params: {} },
        { path: '/v1/football/match/player_stats/detail', params: { id: SAMPLE_MATCH_ID } },
        // Match analysis (H2H)
        { path: '/v1/football/match/analysis', params: { id: SAMPLE_MATCH_ID } },
        // Season standings
        { path: '/v1/football/season/recent/table/detail', params: {} },
        { path: '/v1/football/table/live', params: {} },

        // === ORIGINAL TEST ENDPOINTS ===
        { path: '/v1/football/team/squad/list', params: { team: SAMPLE_TEAM_ID } },
        { path: '/v1/football/match/incident/list', params: { id: SAMPLE_MATCH_ID } },
        { path: '/v1/football/match/lineup/list', params: { id: SAMPLE_MATCH_ID } },
    ];

    const results: Record<string, unknown> = {};

    for (const endpoint of endpointsToTest) {
        const url = new URL(`${API_URL}${endpoint.path}`);
        url.searchParams.set('user', USERNAME);
        url.searchParams.set('secret', API_KEY);

        Object.entries(endpoint.params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        try {
            const response = await fetch(url.toString(), {
                headers: { 'Accept': 'application/json' },
            });

            const data = await response.json();

            const hasData = !!(data.data || data.results);
            const error = data.err || null;
            const sampleData = data.data?.results?.[0] || data.results?.[0] || data.data || null;

            results[endpoint.path] = {
                status: response.status,
                authorized: !error,
                hasData,
                error,
                dataType: sampleData ? typeof sampleData : null,
                sampleKeys: sampleData && typeof sampleData === 'object' ? Object.keys(sampleData).slice(0, 10) : null,
            };
        } catch (e) {
            results[endpoint.path] = {
                status: 0,
                authorized: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            };
        }
    }

    return NextResponse.json({
        success: true,
        results,
        timestamp: new Date().toISOString(),
    });
}

export const dynamic = 'force-dynamic';
