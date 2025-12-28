/**
 * DELETE /api/matches/clear-date/[date]
 * Clears all matches for a specific date and re-syncs with fresh data
 */

import { supabase } from '@/lib/supabase';
import { syncDailyMatches } from '@/services/sync-service';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ date: string }> }
) {
    try {
        const { date } = await params;

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { success: false, error: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            );
        }

        console.log(`[Clear] Clearing matches for ${date}...`);

        // Create date range for the given day
        const startOfDay = new Date(`${date}T00:00:00Z`);
        const endOfDay = new Date(`${date}T23:59:59Z`);

        // Delete all matches for this date
        const { error: deleteError, count } = await supabase
            .from('matches')
            .delete()
            .gte('start_time', startOfDay.toISOString())
            .lte('start_time', endOfDay.toISOString());

        if (deleteError) {
            console.error('[Clear] Delete error:', deleteError);
            return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
        }

        console.log(`[Clear] Deleted ${count || 0} matches for ${date}`);

        // Re-sync with fresh data
        const syncResult = await syncDailyMatches(date);

        return NextResponse.json({
            success: true,
            date,
            deleted: count || 0,
            synced: syncResult.synced,
            errors: syncResult.errors,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Clear] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
