/**
 * GET /api/cron/sync-all
 * Syncs matches for last 7 days + today + next 7 days (15 days total)
 */

import { syncAllDays } from '@/services/sync-service';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        console.log('[Cron] Starting 15-day sync...');

        const result = await syncAllDays();

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Cron] Sync error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
