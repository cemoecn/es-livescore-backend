/**
 * GET /api/debug/season-ids
 * Gets current season IDs for top leagues from competitions table
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const TOP_LEAGUE_IDS = [
    'gy0or5jhg6qwzv3', // Bundesliga
    'jednm9whz0ryox8', // Premier League
    'vl7oqdehlyr510j', // La Liga
    '4zp5rzghp5q82w1', // Serie A
    'yl5ergphnzr8k0o', // Ligue 1
];

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('competitions')
            .select('id, name, cur_season_id, current_round')
            .in('id', TOP_LEAGUE_IDS);

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Format as a ready-to-use object
        const seasonIds: Record<string, string> = {};
        for (const comp of data || []) {
            if (comp.cur_season_id) {
                seasonIds[comp.id] = comp.cur_season_id;
            }
        }

        return NextResponse.json({
            success: true,
            competitions: data,
            seasonIds,
            codeToUse: `const SEASON_IDS: Record<string, string> = ${JSON.stringify(seasonIds, null, 4)};`,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
