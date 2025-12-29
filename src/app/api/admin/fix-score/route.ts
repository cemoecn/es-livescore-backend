/**
 * POST /api/admin/fix-score
 * Admin endpoint to manually fix match scores
 * Required for cases where MQTT sends incorrect data
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { matchId, homeScore, awayScore, status } = body;

        if (!matchId) {
            return NextResponse.json(
                { success: false, error: 'matchId is required' },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (homeScore !== undefined) updateData.home_score = homeScore;
        if (awayScore !== undefined) updateData.away_score = awayScore;
        if (status !== undefined) updateData.status = status;

        const { data, error } = await supabase
            .from('matches')
            .update(updateData)
            .eq('id', matchId)
            .select()
            .single();

        if (error) {
            console.error('[Admin] Fix score error:', error);
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        console.log(`[Admin] Fixed match ${matchId}: ${homeScore}-${awayScore}`);

        return NextResponse.json({
            success: true,
            match: data,
        });
    } catch (error) {
        console.error('[Admin] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
