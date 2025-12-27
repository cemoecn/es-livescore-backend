/**
 * GET /api/cron/sync-live
 * Cron job to sync live matches from TheSports API to Supabase
 * Should be called every 5-10 seconds for real-time updates
 */

import { syncLiveMatches } from '@/services/sync-service';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const result = await syncLiveMatches();

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Sync live error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
