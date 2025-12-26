/**
 * GET /api/matches/[date]
 * Returns enriched matches for a specific date (YYYY-MM-DD)
 * Includes full team names, logos, and competition details
 */

import { EnrichmentService, type RawMatch } from '@/services/enrichment';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid date format. Use YYYY-MM-DD',
                },
                { status: 400 }
            );
        }

        // Convert YYYY-MM-DD to YYYYMMDD for TheSports API
        const apiDate = date.replace(/-/g, '');

        // Fetch raw matches from TheSports API
        const url = `${API_URL}/v1/football/match/diary?user=${USERNAME}&secret=${API_KEY}&date=${apiDate}`;
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

        return NextResponse.json({
            success: true,
            data: enrichedMatches,
            date,
            count: enrichedMatches.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching matches:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 30 seconds
export const revalidate = 30;
