/**
 * GET /api/matches/live
 * Returns all currently live matches
 */

import { getLiveMatches } from '@/services/thesports';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const matches = await getLiveMatches();

        return NextResponse.json({
            success: true,
            data: matches,
            count: matches.length,
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
