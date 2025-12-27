/**
 * GET /api/cron/sync-daily
 * Cron job to sync daily matches from TheSports API to Supabase
 * Should be called every 1-5 minutes
 */

import { syncDailyMatches } from '@/services/sync-service';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        // Get date from query or use today
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

        const result = await syncDailyMatches(date);

        return NextResponse.json({
            success: true,
            date,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Sync daily error:', error);
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
