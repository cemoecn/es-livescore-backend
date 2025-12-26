/**
 * GET /api/standings/[leagueId]
 * Returns standings for a specific league
 */

import { getStandings } from '@/services/thesports';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> }
) {
    try {
        const { leagueId } = await params;

        const standings = await getStandings({ competition_id: leagueId });

        return NextResponse.json({
            success: true,
            data: standings,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching standings:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Revalidate every 5 minutes
export const revalidate = 300;
