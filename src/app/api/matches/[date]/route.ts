/**
 * GET /api/matches/[date]
 * Returns matches for a specific date (YYYY-MM-DD)
 */

import { getMatches } from '@/services/thesports';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
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

        const matches = await getMatches({ date: apiDate });

        return NextResponse.json({
            success: true,
            data: matches,
            date,
            count: Array.isArray(matches) ? matches.length : 0,
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
