/**
 * GET /api/leagues
 * Returns all available leagues/competitions
 */

import { getCompetitions } from '@/services/thesports';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const competitions = await getCompetitions();

        return NextResponse.json({
            success: true,
            data: competitions,
            count: competitions.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching leagues:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 6 hours (leagues don't change often)
export const revalidate = 21600;
