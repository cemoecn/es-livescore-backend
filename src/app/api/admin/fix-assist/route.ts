/**
 * POST /api/admin/fix-assist
 * Update goal event with assist1_name
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { matchId, time, assist1Name } = body;

        if (!matchId || time === undefined) {
            return NextResponse.json(
                { success: false, error: 'matchId and time are required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('match_events')
            .update({
                assist1_name: assist1Name,
            })
            .eq('match_id', matchId)
            .in('type', [1, 8])  // Goal or Penalty goal
            .eq('time', time)
            .select();

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            updated: data?.length || 0,
            event: data?.[0],
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
