/**
 * GET /api/cron/cleanup-orphan-matches
 * Deletes matches that have no team_ids (orphan data from old WebSocket)
 * These matches cannot be repaired since we have no team reference
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        console.log('[Cleanup] Starting orphan match cleanup...');

        // Find and delete matches with TBD names AND no team IDs
        // These are irreparable orphan matches from old WebSocket
        const { data: orphans, error: fetchError } = await supabase
            .from('matches')
            .select('id')
            .or('home_team_id.is.null,home_team_id.eq.')
            .or('home_team_name.eq.TBD,home_team_name.is.null');

        if (fetchError) {
            console.error('[Cleanup] Fetch error:', fetchError);
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        console.log(`[Cleanup] Found ${orphans?.length || 0} orphan matches to delete`);

        if (!orphans || orphans.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No orphan matches found',
                deleted: 0,
                timestamp: new Date().toISOString(),
            });
        }

        // Delete orphan matches
        const orphanIds = orphans.map(m => m.id);
        const { error: deleteError, count } = await supabase
            .from('matches')
            .delete()
            .in('id', orphanIds);

        if (deleteError) {
            console.error('[Cleanup] Delete error:', deleteError);
            return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
        }

        console.log(`[Cleanup] Deleted ${count || orphanIds.length} orphan matches`);

        return NextResponse.json({
            success: true,
            deleted: count || orphanIds.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
