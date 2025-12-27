/**
 * GET /api/cron/sync-standings
 * Cron job to sync standings from TheSports API to Supabase
 * Should be called every 5-10 minutes
 */

import { syncStandings } from '@/services/sync-service';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const result = await syncStandings();

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Sync standings error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
