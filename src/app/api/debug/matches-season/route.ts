/**
 * GET /api/debug/matches-season
 * Gets season_ids from recent matches in Supabase to find the correct active season ID
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Get different leagues to see their season IDs
        const { data: matches, error } = await supabase
            .from('matches')
            .select('competition_id, season_id, start_time')
            .order('start_time', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Group by competition
        const seasonMap: Record<string, Set<string>> = {};
        matches?.forEach(m => {
            if (!seasonMap[m.competition_id]) {
                seasonMap[m.competition_id] = new Set();
            }
            seasonMap[m.competition_id].add(m.season_id);
        });

        // Convert sets to arrays for JSON
        const result: Record<string, string[]> = {};
        for (const [compId, seasonIds] of Object.entries(seasonMap)) {
            result[compId] = Array.from(seasonIds);
        }

        return NextResponse.json({
            success: true,
            active_seasons: result,
            matches_sample: matches?.slice(0, 5)
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
