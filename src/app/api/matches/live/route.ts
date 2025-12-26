/**
 * GET /api/matches/live
 * Returns all currently live matches with full team details
 */

import { EnrichmentService, type RawMatch } from '@/services/enrichment';
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET() {
    try {
        // Fetch raw matches from TheSports API
        const url = `${API_URL}/v1/football/match/recent/list?user=${USERNAME}&secret=${API_KEY}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.err) {
            throw new Error(data.err);
        }

        const rawMatches: RawMatch[] = data.data?.results || data.results || [];

        // Enrich matches with team/competition details
        const enrichedMatches = await EnrichmentService.enrichMatches(rawMatches);

        // Filter to only live matches (status 2-7)
        const liveMatches = enrichedMatches.filter(
            m => m.status === 'live' || m.status === 'halftime'
        );

        return NextResponse.json({
            success: true,
            data: liveMatches,
            count: liveMatches.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching live matches:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 10 seconds for live data
export const revalidate = 10;
