/**
 * GET /api/debug/test-teams
 * Tests the team endpoint to see what format the API returns
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    try {
        // Try different endpoint paths
        const endpointsToTest = [
            '/v1/football/team/additional/list',
            '/v1/football/team/list',
            '/v1/football/team/additional',
        ];

        const results: Record<string, unknown> = {};

        for (const endpoint of endpointsToTest) {
            const url = `${API_URL}${endpoint}?user=${USERNAME}&secret=${API_KEY}&page=1`;

            try {
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                });

                const data = await response.json();

                results[endpoint] = {
                    status: response.status,
                    hasData: !!data.data,
                    hasResults: !!data.results,
                    dataKeys: data.data ? Object.keys(data.data) : null,
                    resultsLength: data.data?.results?.length || data.results?.length || 0,
                    sample: data.data?.results?.[0] || data.results?.[0] || null,
                    error: data.err || null,
                };
            } catch (e) {
                results[endpoint] = {
                    error: e instanceof Error ? e.message : 'Unknown error',
                };
            }
        }

        return NextResponse.json({
            success: true,
            results,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
