/**
 * POST /api/admin/fix-var-event
 * Update VAR event with var_reason and var_result
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { matchId, time, varReason, varResult } = body;

        if (!matchId || time === undefined) {
            return NextResponse.json(
                { success: false, error: 'matchId and time are required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('match_events')
            .update({
                var_reason: varReason,
                var_result: varResult,
            })
            .eq('match_id', matchId)
            .eq('type', 28)  // VAR event
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
