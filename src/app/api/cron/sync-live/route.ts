/**
 * GET /api/cron/sync-live
 * 
 * DISABLED: Live match updates now come through WebSocket only.
 * This endpoint has been disabled to avoid conflicts with WebSocket data.
 * 
 * Previous functionality: Cron job to sync live matches from TheSports API to Supabase
 */

import { NextResponse } from 'next/server';

export async function GET() {
    // Return immediately - live updates now handled by WebSocket only
    return NextResponse.json({
        success: true,
        message: 'Live sync disabled - using WebSocket for real-time updates',
        synced: 0,
        errors: 0,
        timestamp: new Date().toISOString(),
    });
}

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';
